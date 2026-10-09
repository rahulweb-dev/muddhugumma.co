// Logic checks for checkout money features against the configured database. Creates only TEST documents and deletes them.
// Usage: node --env-file=.env.local --conditions=react-server --import tsx scripts/test-checkout.mts
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { db } from "../src/lib/db.ts";
import { Counter, GiftCard, LoyaltyTxn, Order, Otp, Outbox, User } from "../src/lib/models.ts";
import { computeTotals, emiNote, DEFAULT_CHECKOUT_SETTINGS } from "../src/lib/checkout-pricing.ts";
import { issueGiftCard, redeemGiftCard, restoreGiftCardForOrder, findUsableGiftCard, newGiftCardCode, createPendingGiftCard, activatePurchasedGiftCard } from "../src/lib/giftcards.ts";
import { adjustPoints, awardLoyaltyForOrder, reverseLoyaltyForOrder, spendPoints } from "../src/lib/loyalty.ts";
import { attachReferral, ensureReferralCode, rewardReferrerForOrder } from "../src/lib/referral.ts";
import { sendOtp, verifyOtp, hasVerifiedOtp } from "../src/lib/otp.ts";
import { getInvoice, hsnFor, indianFY } from "../src/lib/invoice.ts";

const ok = (m: string) => console.log("  ✓", m);
await db();

const TEST_EMAILS = ["test-checkout-a@example.com", "test-checkout-b@example.com"];
async function cleanup() {
  const users = await User.find({ email: { $in: TEST_EMAILS } }, { _id: 1 }).lean();
  const ids = users.map((u) => String(u._id));
  await GiftCard.deleteMany({ orderNumber: { $in: ["TEST-GC-1", "GCTEST00TEST"] } });
  await Order.deleteMany({ number: { $in: ["MGTEST0GC1", "MGTEST0LY1", "MGTEST0IN1"] } });
  await LoyaltyTxn.deleteMany({ userId: { $in: ids } });
  await User.deleteMany({ _id: { $in: ids } });
  await Counter.deleteMany({ _id: { $in: ["loyalty-refund-MGTEST0LY1", ...ids.map((i) => `referral-reward-${i}`)] } });
  await Otp.deleteMany({ phone: "+919000000001", purpose: "cod-test" });
  await Outbox.deleteMany({ $or: [{ to: /test-checkout/ }, { ref: "TEST-OTP" }, { ref: "GCTEST00TEST" }, { to: "+919000000001" }] });
}
await cleanup();
try {

/* ---------- pure pricing ---------- */
console.log("pricing");
const line = (now: number, mrp = now, qty = 1) => ({ qty, price: { in: { now, mrp }, uk: { now: now / 100, mrp: mrp / 100 } } });
let t = computeTotals([line(4000, 5000)], "in", { method: "razorpay" });
assert.equal(t.subtotal, 4000); assert.equal(t.prepaid, 200); assert.equal(t.total, 3800); assert.equal(t.shipping, 0); ok("prepaid 5% on online");
t = computeTotals([line(4000)], "in", { method: "cod" });
assert.equal(t.prepaid, 0); assert.equal(t.codFee, 49); assert.equal(t.total, 4049); assert.equal(t.dueOnDelivery, 4049); assert.equal(t.prepaidIfOnline, 200); ok("COD fee, no prepaid");
t = computeTotals([line(4000)], "in", { method: "partcod" });
assert.equal(t.codFee, 0); assert.equal(t.payNow, 200); assert.equal(t.dueOnDelivery, 3800); ok("part-COD split");
t = computeTotals([line(1500)], "in", { method: "razorpay", couponDiscount: 100, giftWrap: true, redeemPoints: 10000 });
// subtotal 1500, coupon 100 -> 1400, prepaid 70, points cap 20% of 1500 = 300, shipping 99, wrap 99
assert.equal(t.prepaid, 70); assert.equal(t.loyaltyPoints, 300); assert.equal(t.loyalty, 300); assert.equal(t.total, 1400 - 70 - 300 + 99 + 99); ok("coupon, points cap, wrap, shipping");
t = computeTotals([line(1500)], "in", { method: "cod", giftCardBalance: 5000 });
assert.ok(t.coveredByGiftCard); assert.equal(t.total, 0); assert.equal(t.codFee, 0); assert.equal(t.giftCard, 1500 - 75 + 99); ok("gift card covers (counts as prepaid)");
t = computeTotals([line(1500)], "in", { method: "razorpay", giftCardBalance: 500 });
assert.equal(t.giftCard, 500); assert.equal(t.total, 1500 - 75 + 99 - 500); ok("gift card partial");
t = computeTotals([line(6000)], "uk", { method: "stripe", redeemPoints: 500 });
assert.equal(t.prepaid, 0); assert.equal(t.loyalty, 5); assert.equal(t.total, 59.95); ok("UK: no prepaid, points at £0.01");
assert.equal(computeTotals([line(150)], "in", { method: "partcod" }).partCodAvailable, true);
assert.equal(computeTotals([line(100)], "in", { method: "partcod", settings: DEFAULT_CHECKOUT_SETTINGS }).partCodAvailable, false); ok("part-COD only above the advance");
assert.match(emiNote(6000, "in")!, /₹1,000\/month/); assert.equal(emiNote(2000, "in"), null); assert.match(emiNote(60, "uk")!, /£20\.00/); ok("EMI notes");

/* ---------- gift cards ---------- */
console.log("gift cards");
assert.match(newGiftCardCode(), /^MG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/); ok("code format");
const card = await issueGiftCard({ region: "in", amount: 1000, recipientEmail: "test-checkout-recipient@example.com", recipientName: "TEST Recipient", purchaserEmail: "test-checkout@example.com", orderNumber: "TEST-GC-1" });
assert.equal(card.balance, 1000); assert.ok(card.expiresAt && card.expiresAt.getTime() > Date.now() + 360 * 864e5); ok("issued with 1-year expiry");
assert.equal((await findUsableGiftCard(card.code.toLowerCase().replace(/-/g, ""), "in")).ok, true); ok("lookup normalises code");
assert.equal((await findUsableGiftCard(card.code, "uk")).ok, false); ok("region must match");
assert.equal(await redeemGiftCard(card.code, "in", 600, "MGTEST0GC1"), true);
assert.equal(await redeemGiftCard(card.code, "in", 600, "MGTEST0GC2"), false); ok("atomic balance guard");
await Order.create({ number: "MGTEST0GC1", email: "test-checkout@example.com", region: "in", currency: "INR", items: [], address: { name: "TEST" }, subtotal: 600, total: 0, payment: { method: "giftcard", status: "paid" }, giftCard: { code: card.code, amount: 600 } });
await restoreGiftCardForOrder("MGTEST0GC1");
await restoreGiftCardForOrder("MGTEST0GC1");
assert.equal((await GiftCard.findOne({ code: card.code }).lean())!.balance, 1000); ok("restore is idempotent");
const pending = await createPendingGiftCard({ region: "uk", amount: 50, orderNumber: "GCTEST00TEST", recipientEmail: "test-checkout-recipient@example.com", purchaserEmail: "test-checkout@example.com" });
assert.equal(pending.active, false);
assert.equal((await activatePurchasedGiftCard("GCTEST00TEST"))!.active, true);
const again = await activatePurchasedGiftCard("GCTEST00TEST");
assert.equal(again!.active, true);
assert.equal(await Outbox.countDocuments({ ref: { $in: ["GCTEST00TEST", pending.code] } }), 2); ok("purchase activates once, emails recipient + buyer once");

/* ---------- loyalty + referral ---------- */
console.log("loyalty & referral");
const pw = "x".repeat(20);
const ua = await User.create({ name: "Test Priya", email: "test-checkout-a@example.com", passwordHash: pw });
const ub = await User.create({ name: "Test Friend", email: "test-checkout-b@example.com", passwordHash: pw });
const A = String(ua._id), B = String(ub._id);
const codeA = await ensureReferralCode(A);
assert.match(codeA, /^TEST[A-HJ-NP-Z2-9]{4}$/); assert.equal(await ensureReferralCode(A), codeA); ok(`referral code ${codeA}`);
await attachReferral(A, codeA); assert.equal((await User.findById(A).lean())!.referredBy, ""); ok("own code ignored");
await attachReferral(B, codeA.toLowerCase()); await attachReferral(B, codeA);
assert.equal((await User.findById(B).lean())!.loyaltyPoints, 500); ok("welcome reward once (500 pts)");
assert.equal(await spendPoints(B, 600, "MGTEST0LY1"), false);
assert.equal(await spendPoints(B, 300, "MGTEST0LY1"), true); ok("spend guarded by balance");
await Order.create({ number: "MGTEST0LY1", userId: B, email: "test-checkout-b@example.com", region: "in", currency: "INR", items: [], address: { name: "TEST" }, subtotal: 2599, discount: 100, prepaidDiscount: 125, total: 2074, payment: { method: "test", status: "paid" }, status: "delivered", loyalty: { redeemedPoints: 300, discount: 300 } });
await awardLoyaltyForOrder("MGTEST0LY1"); await awardLoyaltyForOrder("MGTEST0LY1");
let o = await Order.findOne({ number: "MGTEST0LY1" }).lean();
assert.equal(o!.loyalty!.earnedPoints, 20); // floor((2599-100-125-300)/100) = 20
assert.equal((await User.findById(B).lean())!.loyaltyPoints, 220); ok("award once: 20 points");
await rewardReferrerForOrder("MGTEST0LY1"); await rewardReferrerForOrder("MGTEST0LY1");
assert.equal((await User.findById(A).lean())!.loyaltyPoints, 500); ok("referrer rewarded once");
await Order.updateOne({ number: "MGTEST0LY1" }, { $set: { status: "returned" } });
await reverseLoyaltyForOrder("MGTEST0LY1"); await reverseLoyaltyForOrder("MGTEST0LY1");
assert.equal((await User.findById(B).lean())!.loyaltyPoints, 500); ok("reverse: -20 earned, +300 refunded, once");
await adjustPoints(B, -1, "TEST adjust");
assert.equal(await LoyaltyTxn.countDocuments({ userId: B }), 6); ok("ledger rows written");

/* ---------- OTP ---------- */
console.log("otp");
const phone = "+919000000001";
const s1 = await sendOtp(phone, "cod-test", "TEST-OTP");
assert.ok(s1.ok && s1.testCode); ok(`sent (test code ${s1.ok ? s1.testCode : ""})`);
const s2 = await sendOtp(phone, "cod-test", "TEST-OTP"); assert.equal(s2.ok, false); ok("resend blocked for 30 s");
assert.equal((await verifyOtp(phone, "cod-test", "000000")).ok, s1.ok && s1.testCode === "000000");
assert.equal((await verifyOtp(phone, "cod-test", s1.ok ? s1.testCode! : "")).ok, true);
assert.equal(await hasVerifiedOtp(phone, "cod-test"), true);
assert.equal((await verifyOtp(phone, "cod-test", s1.ok ? s1.testCode! : "")).ok, false); ok("verify once, wrong code counted");

/* ---------- invoice ---------- */
console.log("invoice");
assert.equal(indianFY(new Date("2026-10-09")), "2026-27"); assert.equal(indianFY(new Date("2027-03-31")), "2026-27"); assert.equal(indianFY(new Date("2027-04-01")), "2027-28"); ok("Indian FY");
assert.equal(hsnFor({ category: "sarees", fabric: "Raw silk" }), "5007"); assert.equal(hsnFor({ category: "sarees", fabric: "Georgette" }), "5407");
assert.equal(hsnFor({ category: "sarees", fabric: "Cotton" }), "5208"); assert.equal(hsnFor({ category: "lehengas", fabric: "Velvet" }), "6204"); ok("HSN");
await Order.create({
  number: "MGTEST0IN1", email: "test-checkout@example.com", region: "in", currency: "INR", invoiceNumber: "TEST-INV-1",
  items: [{ slug: "test-a", name: "TEST cotton saree", size: "Free size", qty: 1, unitPrice: 2000, optionsPrice: 0 }, { slug: "test-b", name: "TEST silk saree", size: "Free size", qty: 1, unitPrice: 8000, optionsPrice: 0 }],
  address: { name: "TEST", state: "Karnataka", line1: "1 Test St", city: "Bengaluru", postcode: "560001" }, subtotal: 10000, discount: 0, shipping: 0, codFee: 0, total: 10000,
  payment: { method: "test", status: "paid" }, status: "confirmed",
});
const inv = await getInvoice("MGTEST0IN1");
assert.ok(inv); assert.equal(inv!.number, "TEST-INV-1"); assert.equal(inv!.intraState, false);
assert.equal(inv!.lines[0].rate, 5); assert.equal(inv!.lines[1].rate, 18); assert.equal(inv!.totals.igst, inv!.totals.tax); assert.equal(inv!.totals.gross, 10000);
ok(`IGST invoice: taxable ${inv!.totals.taxable}, tax ${inv!.totals.tax}`);

console.log("all checks passed");
} finally {
  await cleanup();
  console.log("cleaned up");
}
await mongoose.disconnect();
