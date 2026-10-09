// End-to-end check of customer comms, returns and jobs against the configured database.
// Usage: node --env-file=.env.local --conditions=react-server --import tsx scripts/test-comms.mts
// Creates TEST documents only and deletes them at the end. Product stock touched by the returns test is restored exactly.
import { db } from "../src/lib/db.ts";
import { Activity, Coupon, GiftCard, LoyaltyTxn, Order, Outbox, Product, ReturnRequest, User } from "../src/lib/models.ts";
import { recordShipment, recordTrackingEvent } from "../src/lib/tracking.ts";
import { onOrderPlaced, onOrderStatusChanged } from "../src/lib/order-events.ts";
import { createReturn, getReturnableLines, getReturnsForUser, returnWindow, updateReturnStatus } from "../src/lib/returns.ts";
import * as birthdays from "../src/lib/jobs/birthdays.ts";
import * as abandoned from "../src/lib/jobs/abandoned-carts.ts";
import mongoose from "mongoose";

const NUM = "MGTESTCOMMS1";
const NUM2 = "MGTESTCOMMS2";
const EMAIL = "comms-test-test@example.com"; // TEST user (emails are stored lowercase)
const actor = { uid: "test", name: "TEST runner" };
let restockedSize = "";
const ok = (label: string, cond: unknown) => console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);

await db();
const product = await Product.findOne({ freeSize: false, active: true }).lean();
if (!product) throw new Error("no sized product to test with");
const stockBefore = JSON.stringify(product.stock);
const sizes = Object.keys(product.stock instanceof Map ? Object.fromEntries(product.stock) : product.stock);
console.log("product:", product.slug, "stock:", stockBefore);

async function cleanup() {
  const users = await User.find({ email: { $regex: /^comms-test-test@example.com$/i } }, { _id: 1 }).lean();
  await Order.deleteMany({ number: { $in: [NUM, NUM2] } });
  await ReturnRequest.deleteMany({ orderNumber: { $in: [NUM, NUM2] } });
  await Outbox.deleteMany({ $or: [{ ref: { $in: [NUM, NUM2] } }, { to: { $regex: /^comms-test-test@example.com$/i } }] });
  await LoyaltyTxn.deleteMany({ orderNumber: { $in: [NUM, NUM2] } });
  await Activity.deleteMany({ target: { $regex: /MGTESTCOMMS/ } });
  await GiftCard.deleteMany({ orderNumber: { $in: [NUM, NUM2] } });
  await Coupon.deleteMany({ description: { $regex: /comms-test-test@example.com$/i } });
  await User.deleteMany({ _id: { $in: users.map((u) => u._id) } });
}

try {
  await cleanup();
  const user = await User.create({ name: "Test Comms", email: EMAIL, passwordHash: "x", role: "customer", marketingOptIn: true, birthday: "", cart: [] });
  const uid = String(user._id);
  const size = sizes.find((s) => s !== "Free size") ?? sizes[0];
  const item = { slug: product.slug, name: product.name, image: product.images[0], size, qty: 2, unitPrice: product.price.in.now, optionsPrice: 0 };
  const base = {
    userId: uid, email: EMAIL, region: "in", currency: "INR",
    address: { name: "Test Comms", phone: "+91 98765 43210", line1: "1 Test Street", city: "Bengaluru", state: "Karnataka", postcode: "560001", region: "in" },
    subtotal: item.unitPrice * 2, discount: 0, shipping: 0, codFee: 0, total: item.unitPrice * 2, prepaidDiscount: 50,
    gift: { wrap: true, message: "Happy Diwali", fee: 99 },
  };

  /* ---- order lifecycle ---- */
  await Order.create({ ...base, number: NUM, items: [item, { ...item, slug: product.slug, size: sizes[1] ?? size, qty: 1, options: { blouse: "stitched" } }], payment: { method: "test", status: "paid" }, status: "placed", history: [{ status: "placed", at: new Date() }] });
  await onOrderPlaced(NUM);
  await onOrderPlaced(NUM); // must not double-send
  let o = await Order.findOne({ number: NUM }).lean();
  ok("placed + paid keys recorded once", o!.notifications!.filter((k) => k === "placed").length === 1 && o!.notifications!.includes("paid"));

  console.log(await recordShipment({ number: NUM }, { courier: "delhivery", awb: "TESTCOMMS123" }, "test"));
  await recordTrackingEvent({ number: NUM }, { code: "out_for_delivery", location: "Bengaluru", at: new Date(Date.now() - 3e5) }, "test");
  await recordTrackingEvent({ number: NUM }, { code: "delivered", location: "Bengaluru" }, "test");
  o = await Order.findOne({ number: NUM }).lean();
  ok("status delivered", o!.status === "delivered");
  ok("shipped/ofd/delivered keys", ["shipped", "out_for_delivery_1", "delivered"].every((k) => o!.notifications!.includes(k)));
  const mails = await Outbox.find({ ref: NUM }).sort({ createdAt: 1 }).lean();
  console.log("outbox:", mails.map((m) => `${m.channel}:${m.template}`).join(", "));
  ok("whatsapp sent alongside email", mails.some((m) => m.channel === "whatsapp" && m.template === "order_shipped"));
  ok("placed email has totals lines", mails.find((m) => m.template === "order_placed")?.body?.includes("Prepaid discount"));

  /* ---- returns ---- */
  ok("return window open", returnWindow(o!).open);
  const lines = await getReturnableLines(o!);
  ok("stitched blouse line blocked", lines[1].blocked.includes("Blouses stitched"));
  const bad = await createReturn({ orderNumber: NUM, userId: uid, lines: [{ index: 1, qty: 1, reason: "Changed my mind", kind: "return" }], refundMethod: "original" });
  ok("blocked line rejected", !bad.ok);
  const created = await createReturn({ orderNumber: NUM, userId: uid, lines: [{ index: 0, qty: 1, reason: "Size doesn't fit", kind: "return" }], refundMethod: "original" });
  ok(`created ${created.ok ? created.number : JSON.stringify(created)}`, created.ok && created.number === `RT-${NUM}-1`);
  const again = await createReturn({ orderNumber: NUM, userId: uid, lines: [{ index: 0, qty: 2, reason: "Size doesn't fit", kind: "return" }], refundMethod: "original" });
  ok("cannot over-return quantity", !again.ok);
  if (created.ok) {
    console.log(await updateReturnStatus(created.number, "approved", actor));
    console.log(await updateReturnStatus(created.number, "pickup_scheduled", actor, { pickup: { courier: "delhivery", date: new Date(Date.now() + 864e5) } }));
    const rec = await updateReturnStatus(created.number, "received", actor);
    console.log(rec);
    if (rec.ok) restockedSize = size;
    const p2 = await Product.findOne({ slug: product.slug }).lean();
    const get = (st: unknown, k: string) => Number((st instanceof Map ? Object.fromEntries(st) : (st as Record<string, number>))[k]) || 0;
    ok("restocked on received", get(p2!.stock, size) === get(product.stock, size) + 1);
    ok("cannot go backwards", !(await updateReturnStatus(created.number, "approved", actor)).ok);
    console.log(await updateReturnStatus(created.number, "refunded", actor, { refundMethod: "original" }));
    const views = await getReturnsForUser(uid);
    ok("refunded with amount", views[0]?.status === "refunded" && views[0].refundAmount === item.unitPrice);
    const rmails = await Outbox.find({ ref: NUM, template: /^return_/ }).lean();
    console.log("return emails:", rmails.filter((m) => m.channel === "email").map((m) => m.template).join(", "));
  }
  // store credit (depends on the gift card feature)
  const sc = await createReturn({ orderNumber: NUM, userId: uid, lines: [{ index: 0, qty: 1, reason: "Changed my mind", kind: "return" }], refundMethod: "store_credit" });
  if (sc.ok) {
    const r = await updateReturnStatus(sc.number, "refunded", actor, { refundMethod: "store_credit" });
    console.log("store credit refund:", r);
  }

  /* ---- cancellation ---- */
  await Order.create({ ...base, number: NUM2, items: [item], payment: { method: "cod", status: "pending" }, status: "cancelled", history: [{ status: "cancelled", at: new Date(), note: "Out of stock" }] });
  await onOrderStatusChanged(NUM2, "cancelled");
  ok("cancel email", await Outbox.exists({ ref: NUM2, template: "order_cancelled" }));

  /* ---- jobs (only when no real customer would be affected) ---- */
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const md = `${fmt.find((p) => p.type === "month")!.value}-${fmt.find((p) => p.type === "day")!.value}`;
  const realBdays = await User.countDocuments({ birthday: md, marketingOptIn: true, email: { $not: /^comms-test-test@example.com$/i } });
  if (realBdays) console.log(`SKIP birthdays job: ${realBdays} real customer(s) have a birthday today`);
  else {
    await User.updateOne({ _id: user._id }, { $set: { birthday: md } });
    console.log("birthdays:", await birthdays.run());
    console.log("birthdays again:", await birthdays.run());
    ok("birthday coupon created once", (await Coupon.countDocuments({ description: `Birthday offer for ${EMAIL}` })) === 1);
  }
  const realCarts = await User.countDocuments({ "cart.0": { $exists: true }, cartRemindedAt: { $exists: false }, marketingOptIn: true, email: { $not: /^comms-test-test@example.com$/i } });
  if (realCarts) console.log(`SKIP abandoned-carts job: ${realCarts} real customer bag(s) could be reminded`);
  else {
    await User.updateOne({ _id: user._id }, { $set: { cart: [{ slug: product.slug, size, qty: 1 }], cartUpdatedAt: new Date(Date.now() - 48 * 36e5) } });
    console.log("abandoned:", await abandoned.run());
    console.log("abandoned again:", await abandoned.run());
    ok("one bag reminder", (await Outbox.countDocuments({ to: EMAIL, template: "abandoned_cart" })) === 1);
  }
} finally {
  await cleanup();
  // Undo the test restock with $inc (never overwrite stock that real orders may have changed meanwhile).
  if (restockedSize) await Product.updateOne({ _id: product._id }, { $inc: { [`stock.${restockedSize}`]: -1 } });
  const after = await Product.findById(product._id).lean();
  console.log("stock restored:", JSON.stringify(after!.stock) === stockBefore);
  await mongoose.disconnect();
}
