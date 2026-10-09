"use server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getRegion } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { getActiveSales } from "@/lib/sales";
import { effectivePrice } from "@/lib/pricing";
import { Coupon, GiftCard, Order, Product, User, type ProductDoc } from "@/lib/models";
import { REGION_CONFIG, canonicalSize, formatMoney, isRegion, sizesFor, type Region } from "@/lib/region";
import { stockFor, stockPath } from "@/lib/stock";
import type { Money } from "@/lib/types";
import {
  GIFT_MESSAGE_MAX,
  LAST_ORDER_COOKIE,
  computeTotals,
  couponAmount,
  isCodMethod,
  methodsFor,
  optionsPrice,
  toCheckoutSettings,
} from "@/lib/checkout-pricing";
import { createStripeCheckoutSession, markAdvancePaid, markOrderPaid, stripeConfigured, verifyRazorpaySignature } from "@/lib/payments";
import { cashfreeConfigured, createCashfreeOrder, settleCashfree, type CashfreeCheckout } from "@/lib/cashfree";
import { findUsableGiftCard, redeemGiftCard, restoreGiftCardForOrder } from "@/lib/giftcards";
import { reverseLoyaltyForOrder, spendPoints, unspendPoints } from "@/lib/loyalty";
import { hasVerifiedOtp, otpDeliverable } from "@/lib/otp";
import { onOrderPaid, onOrderPlaced } from "@/lib/order-events";

/* ---------- coupons ---------- */

export type CouponResult =
  | { ok: true; code: string; discount: number; description: string; note?: string }
  | { ok: false; message: string };

type CouponLike = { code: string; description?: string | null; type?: string | null; value?: number | null; regions?: string[] | null; minOrder?: { in?: number | null; uk?: number | null } | null; firstOrderOnly?: boolean | null; active?: boolean | null; expiresAt?: Date | null };

async function checkCoupon(rawCode: string, region: Region, subtotal: number, who: { uid?: string; email?: string }): Promise<CouponResult> {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code || code.length > 40 || !/^[A-Z0-9_-]+$/.test(code)) return { ok: false, message: "Enter a valid coupon code." };
  await db();
  const c = await Coupon.findOne({ code }).lean<CouponLike>();
  if (!c || c.active === false) return { ok: false, message: `${code} isn't a valid code.` };
  if (c.expiresAt && new Date(c.expiresAt).getTime() < Date.now()) return { ok: false, message: `${code} has expired.` };
  if (c.regions?.length && !c.regions.includes(region)) return { ok: false, message: `${code} can't be used for ${REGION_CONFIG[region].label} orders.` };
  const min = c.minOrder?.[region] ?? 0;
  if (subtotal < min) {
    return { ok: false, message: `${code} needs a bag total of ${formatMoney(min, region)} or more.` };
  }
  let note: string | undefined;
  if (c.firstOrderOnly) {
    const or: Record<string, unknown>[] = [];
    if (who.uid) or.push({ userId: who.uid });
    if (who.email) or.push({ email: who.email.toLowerCase() });
    if (or.length && (await Order.exists({ $or: or, status: { $ne: "cancelled" } }))) {
      return { ok: false, message: `${code} is for first orders only.` };
    }
    if (!who.uid) note = "First-order code: we'll check it against your email when you place the order.";
  }
  const discount = couponAmount({ type: c.type ?? "percent", value: c.value ?? 0 }, subtotal, region);
  if (discount <= 0) return { ok: false, message: `${code} doesn't apply to this bag.` };
  return { ok: true, code, discount, description: c.description ?? "", note };
}

/** Called from the bag and checkout. `subtotal` is only used for display; placeOrder re-checks with server prices. */
export async function validateCoupon(code: string, region: string, subtotal: number): Promise<CouponResult> {
  if (!isRegion(region)) return { ok: false, message: "Unknown region." };
  const s = await getSession();
  const n = Number(subtotal);
  return checkCoupon(code, region, Number.isFinite(n) && n > 0 ? n : 0, { uid: s?.uid, email: s?.email });
}

/* ---------- live prices for the bag ---------- */

export type CartProductInfo = { slug: string; name: string; category: ProductDoc["category"]; collections: string[]; price: Record<Region, Money>; active: boolean };

/**
 * Current catalogue data for the slugs in the bag (the bag in localStorage may hold old prices).
 * The bag/checkout pages pass active sales from the server; the client applies effectivePrice() with both,
 * exactly as placeOrder does.
 */
export async function cartProductInfo(slugs: string[]): Promise<Record<string, CartProductInfo>> {
  const list = [...new Set((Array.isArray(slugs) ? slugs : []).map((s) => String(s).slice(0, 120)))].slice(0, 40);
  if (!list.length) return {};
  await db();
  const docs = await Product.find({ slug: { $in: list } }, { slug: 1, name: 1, category: 1, collections: 1, price: 1, active: 1 }).lean<ProductDoc[]>();
  return Object.fromEntries(
    docs.map((d) => [
      d.slug,
      {
        slug: d.slug,
        name: d.name,
        category: d.category,
        collections: d.collections ?? [],
        price: { in: { now: d.price?.in?.now ?? 0, mrp: d.price?.in?.mrp ?? 0 }, uk: { now: d.price?.uk?.now ?? 0, mrp: d.price?.uk?.mrp ?? 0 } },
        active: d.active !== false,
      },
    ])
  );
}

/* ---------- gift card at checkout ---------- */

export type GiftCardCheck = { ok: true; code: string; balance: number; expires: string } | { ok: false; message: string };

export async function checkGiftCard(code: string, region: string): Promise<GiftCardCheck> {
  if (!isRegion(region)) return { ok: false, message: "Unknown region." };
  const r = await findUsableGiftCard(code, region);
  if (!r.ok) return r;
  return {
    ok: true,
    code: r.code,
    balance: r.balance,
    expires: r.expiresAt ? new Date(r.expiresAt).toLocaleDateString(REGION_CONFIG[region].locale, { day: "numeric", month: "short", year: "numeric" }) : "",
  };
}

/* ---------- placing an order ---------- */

const trim = (max: number) => z.string().trim().max(max);
const itemSchema = z.object({
  slug: trim(120).min(1),
  size: trim(20).min(1),
  qty: z.number().int().min(1).max(10),
  options: z.object({ blouse: z.enum(["unstitched", "stitched"]).optional(), fallPico: z.boolean().optional() }).optional(),
});

const inAddress = z.object({
  name: trim(80).min(2, "Enter the full name"),
  phone: z.string().transform((s) => s.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "")).pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number")),
  postcode: z.string().trim().regex(REGION_CONFIG.in.postPattern, "Enter a valid 6-digit pincode"),
  line1: trim(120).min(2, "Enter flat / house number and building"),
  line2: trim(120).min(2, "Enter area or street"),
  city: trim(60).min(2, "Enter the city"),
  state: z.string().refine((s) => (REGION_CONFIG.in.states ?? []).includes(s), "Choose a state"),
});

const ukAddress = z.object({
  name: trim(80).min(2, "Enter the full name"),
  phone: z.string().transform((s) => s.replace(/\D/g, "").replace(/^(44|0)(?=\d{9,10}$)/, "")).pipe(z.string().regex(/^\d{9,10}$/, "Enter a valid UK phone number")),
  postcode: z
    .string()
    .trim()
    .regex(REGION_CONFIG.uk.postPattern, "Enter a valid UK postcode")
    .transform((s) => {
      const c = s.replace(/\s+/g, "").toUpperCase();
      return `${c.slice(0, -3)} ${c.slice(-3)}`;
    }),
  line1: trim(120).min(2, "Enter address line 1"),
  line2: trim(120).optional().default(""),
  city: trim(60).min(2, "Enter the town or city"),
  state: trim(60).optional().default(""),
});

const orderSchema = z.object({
  region: z.enum(["in", "uk"]),
  email: z.string().trim().toLowerCase().max(120).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address"),
  items: z.array(itemSchema).min(1, "Your bag is empty").max(30),
  address: z.record(z.string(), z.unknown()),
  method: z.enum(["cod", "cashfree", "stripe", "partcod"]),
  coupon: trim(40).optional().default(""),
  saveAddress: z.boolean().optional().default(true),
  giftWrap: z.boolean().optional().default(false),
  giftMessage: z
    .string()
    .optional()
    .default("")
    .transform((s) => s.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim())
    .pipe(z.string().max(GIFT_MESSAGE_MAX, `Keep the gift message to ${GIFT_MESSAGE_MAX} characters`)),
  usePoints: z.boolean().optional().default(false),
  giftCard: trim(40).optional().default(""),
  /** The total the shopper saw; if the server's total differs, the order isn't placed and the new total is shown. */
  expectedTotal: z.number().optional(),
});

export type PlaceOrderInput = z.input<typeof orderSchema>;

export type PlaceOrderResult =
  | { ok: false; error: string; fieldErrors?: Record<string, string>; priceChanged?: boolean; needOtp?: boolean }
  | { ok: true; number: string; redirect: string }
  | {
      ok: true;
      number: string;
      cashfree: CashfreeCheckout;
    }
  | { ok: true; number: string; stripeUrl: string };

function issuesToFields(issues: { path: PropertyKey[]; message: string }[], prefix = "") {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = prefix + i.path.map(String).join(".");
    out[k] ??= i.message;
  }
  return out;
}

function orderNumber() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const bytes = randomBytes(4);
  const tail = Array.from(bytes, (b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[b % 36]).join("");
  return `MG${ymd}${tail}`;
}

const testRef = () => `TEST-${randomBytes(6).toString("hex").toUpperCase()}`;

async function setLastOrderCookie(number: string) {
  (await cookies()).set(LAST_ORDER_COOKIE, number, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

type Reserved = { id: unknown; path: string; qty: number }; // path: stockPath(region, size)
async function releaseStock(done: Reserved[]) {
  for (const r of done) {
    await Product.updateOne({ _id: r.id }, { $inc: { [r.path]: r.qty } }).catch((e) => console.error("[checkout] stock rollback failed", e));
  }
}

/** Gives back gift-card money taken for an order that was never created. */
async function refundCard(code: string, amount: number, number: string) {
  if (!code || amount <= 0) return;
  await GiftCard.updateOne({ code }, { $inc: { balance: amount }, $push: { redemptions: { orderNumber: number, amount: -amount, at: new Date() } } }).catch((e) =>
    console.error("[checkout] gift card rollback failed", e)
  );
}

const placed = async (number: string) => {
  try {
    await onOrderPlaced(number);
  } catch (e) {
    console.error("[checkout] onOrderPlaced failed", e);
  }
};

const METHOD_NOTE: Record<string, string> = {
  cod: "cash on delivery",
  partcod: "part-paid cash on delivery",
  cashfree: "Cashfree",
  stripe: "Stripe",
};

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the highlighted details.", fieldErrors: issuesToFields(parsed.error.issues) };
  const data = parsed.data;

  const region = await getRegion();
  if (data.region !== region) return { ok: false, error: "Your shipping region changed. Review your bag and try again." };
  if (!methodsFor(region).includes(data.method)) return { ok: false, error: "That payment method isn't available for this region." };

  const addrParsed = (region === "in" ? inAddress : ukAddress).safeParse(data.address);
  if (!addrParsed.success) return { ok: false, error: "Please check the highlighted details.", fieldErrors: issuesToFields(addrParsed.error.issues, "address.") };
  const a = addrParsed.data;
  const address = {
    name: a.name,
    phone: `${region === "in" ? "+91" : "+44"} ${a.phone}`,
    line1: a.line1,
    line2: a.line2 ?? "",
    city: a.city,
    state: a.state ?? "",
    postcode: a.postcode,
    region,
  };

  const session = await getSession();
  const email = session?.email?.toLowerCase() || data.email;

  await db();
  const [settings, sales] = await Promise.all([getSettings(), getActiveSales().catch(() => [])]);
  const cs = toCheckoutSettings(settings);

  /* Re-price every line from the database, with any running sale. */
  const slugs = [...new Set(data.items.map((i) => i.slug))];
  const docs = await Product.find({ slug: { $in: slugs } }).lean<ProductDoc[]>();
  const bySlug = new Map(docs.map((d) => [d.slug, d]));
  const need = new Map<string, number>();
  const lines: {
    doc: ProductDoc;
    key: string;
    mrp: number;
    item: { productId: string; slug: string; name: string; image: string; size: string; qty: number; unitPrice: number; options?: { blouse: string; fallPico: boolean }; optionsPrice: number };
  }[] = [];

  for (const it of data.items) {
    const p = bySlug.get(it.slug);
    if (!p || p.active === false) return { ok: false, error: `${p?.name ?? "One of the pieces in your bag"} is no longer available. Remove it to continue.` };
    if (!sizesFor(!!p.freeSize, region).includes(it.size)) return { ok: false, error: `Size ${it.size} isn't available for ${p.name}.` };
    if (typeof p.price?.[region]?.now !== "number" || p.price[region].now <= 0) return { ok: false, error: `${p.name} can't be shipped to ${REGION_CONFIG[region].label} right now.` };
    const eff = effectivePrice({ slug: p.slug, category: p.category, collections: p.collections ?? [], price: { in: p.price.in, uk: p.price.uk } }, region, sales);
    const unit = eff.now;
    const isSaree = p.blouseOptions ?? p.category === "sarees"; // offers blouse stitching + fall/pico
    const opts = isSaree ? { blouse: it.options?.blouse ?? "unstitched", fallPico: !!it.options?.fallPico } : undefined;
    const key = canonicalSize(it.size);
    const stockKey = `${p.slug}|${key}`;
    need.set(stockKey, (need.get(stockKey) ?? 0) + it.qty);
    const stock = stockFor(p, region)[key];
    if ((stock ?? 0) < (need.get(stockKey) ?? 0)) {
      return { ok: false, error: (stock ?? 0) > 0 ? `Only ${stock} left of ${p.name} in ${it.size}. Lower the quantity to continue.` : `${p.name} in ${it.size} has just sold out.` };
    }
    lines.push({
      doc: p,
      key,
      mrp: eff.mrp,
      item: {
        productId: String(p._id),
        slug: p.slug,
        name: p.name,
        image: p.images?.[0] ?? "",
        size: it.size,
        qty: it.qty,
        unitPrice: unit,
        options: opts as { blouse: string; fallPico: boolean } | undefined,
        optionsPrice: isSaree ? optionsPrice(opts as { blouse: "unstitched" | "stitched"; fallPico: boolean }, region) : 0,
      },
    });
  }

  const subtotal = lines.reduce((n, l) => n + l.item.qty * (l.item.unitPrice + l.item.optionsPrice), 0);
  let discount = 0;
  let couponCode = "";
  if (data.coupon) {
    const c = await checkCoupon(data.coupon, region, subtotal, { uid: session?.uid, email });
    if (!c.ok) return { ok: false, error: c.message, fieldErrors: { coupon: c.message } };
    discount = c.discount;
    couponCode = c.code;
  }

  /* Loyalty points (signed-in shoppers only). */
  let pointsBalance = 0;
  let referredBy = "";
  if (session) {
    const u = await User.findById(session.uid, { loyaltyPoints: 1, referredBy: 1 }).lean<{ loyaltyPoints?: number; referredBy?: string }>();
    pointsBalance = data.usePoints ? Math.max(0, Math.floor(u?.loyaltyPoints ?? 0)) : 0;
    referredBy = u?.referredBy ?? "";
  }

  /* Gift card. */
  let card: { code: string; balance: number } | null = null;
  if (data.giftCard) {
    const g = await findUsableGiftCard(data.giftCard, region);
    if (!g.ok) return { ok: false, error: g.message, fieldErrors: { giftCard: g.message } };
    card = { code: g.code, balance: g.balance };
  }

  const t = computeTotals(
    lines.map((l) => ({ qty: l.item.qty, price: { [region]: { now: l.item.unitPrice, mrp: l.mrp } } as Record<Region, Money>, optionsPrice: l.item.optionsPrice })),
    region,
    { couponDiscount: discount, method: data.method, giftWrap: data.giftWrap, redeemPoints: pointsBalance, giftCardBalance: card?.balance ?? 0, settings: cs }
  );

  const covered = t.coveredByGiftCard;
  const cod = !covered && isCodMethod(data.method);
  if (!covered && data.method === "partcod" && !t.partCodAvailable) {
    return { ok: false, error: `Part payment is for orders above ${formatMoney(cs.partialCodAdvance, region)}. Choose another way to pay.` };
  }
  if (typeof data.expectedTotal === "number" && Math.abs(data.expectedTotal - t.total) > 0.005) {
    return { ok: false, priceChanged: true, error: `Prices in your bag have changed. Your new total is ${formatMoney(t.total, region)}. Check the summary and place the order again.` };
  }

  /* Cash on delivery needs a verified phone number (when the store asks for it and a code can be delivered). */
  let codVerified = false;
  if (cod && cs.codOtpRequired && otpDeliverable()) {
    codVerified = await hasVerifiedOtp(`${region === "in" ? "+91" : "+44"}${a.phone}`, "cod", region);
    if (!codVerified) return { ok: false, needOtp: true, error: "Please verify your mobile number to use cash on delivery.", fieldErrors: { otp: "Verify your mobile number" } };
  }

  /* A fresh order number (checked up front because the gift card and points ledger record it). */
  let number = orderNumber();
  for (let i = 0; i < 5 && (await Order.exists({ number })); i++) number = orderNumber();

  /* Reserve stock atomically, line by line; roll back if any line can't be reserved. */
  const reserved: Reserved[] = [];
  for (const l of lines) {
    const path = stockPath(region, l.key);
    const res = await Product.updateOne({ _id: l.doc._id, active: true, [path]: { $gte: l.item.qty } }, { $inc: { [path]: -l.item.qty } });
    if (!res.modifiedCount) {
      await releaseStock(reserved);
      return { ok: false, error: `${l.item.name} in ${l.item.size} has just sold out. Update your bag to continue.` };
    }
    reserved.push({ id: l.doc._id, path, qty: l.item.qty });
  }

  /* Spend points and gift card balance atomically (guarded by the balance). */
  if (session && t.loyaltyPoints > 0 && !(await spendPoints(session.uid, t.loyaltyPoints, number))) {
    await releaseStock(reserved);
    return { ok: false, priceChanged: true, error: "Your points balance has changed. Check the summary and try again." };
  }
  if (card && t.giftCard > 0 && !(await redeemGiftCard(card.code, region, t.giftCard, number))) {
    await releaseStock(reserved);
    if (session) await unspendPoints(session.uid, t.loyaltyPoints, number);
    return { ok: false, priceChanged: true, error: "Your gift card balance has changed. Check it and try again.", fieldErrors: { giftCard: "Balance changed" } };
  }

  const now = new Date();
  const methodStored = covered ? "giftcard" : cod ? "cod" : data.method;
  try {
    await Order.create({
      number,
      userId: session?.uid,
      email,
      region,
      currency: REGION_CONFIG[region].currency,
      items: lines.map((l) => l.item),
      address,
      subtotal: t.subtotal,
      discount: t.coupon,
      coupon: couponCode,
      shipping: t.shipping,
      codFee: t.codFee,
      total: t.total,
      payment: covered ? { method: "giftcard", status: "paid", ref: card?.code ?? "" } : { method: methodStored, status: "pending" },
      status: "placed",
      history: [
        {
          status: "placed",
          at: now,
          note: `Order placed (${covered ? "paid by gift card" : METHOD_NOTE[data.method] ?? data.method})`,
        },
      ],
      gift: { wrap: data.giftWrap, message: data.giftMessage, fee: t.giftWrap },
      prepaidDiscount: t.prepaid,
      loyalty: { redeemedPoints: t.loyaltyPoints, discount: t.loyalty, earnedPoints: 0, awarded: false },
      giftCard: { code: t.giftCard > 0 ? card?.code ?? "" : "", amount: t.giftCard },
      referralCode: referredBy,
      partialCod: !covered && data.method === "partcod" ? { paidOnline: t.payNow, dueOnDelivery: t.dueOnDelivery } : { paidOnline: 0, dueOnDelivery: 0 },
      codVerified,
    });
  } catch (e) {
    console.error("[checkout] order create failed", e);
    await releaseStock(reserved);
    if (session) await unspendPoints(session.uid, t.loyaltyPoints, number);
    if (card) await refundCard(card.code, t.giftCard, number);
    return { ok: false, error: "We couldn't place your order. Nothing was charged; please try again." };
  }

  /* Save a new address to the account. */
  if (session && data.saveAddress) {
    try {
      const u = await User.findById(session.uid, { addresses: 1 }).lean<{ addresses?: { line1?: string | null; postcode?: string | null; region?: string | null }[] }>();
      const norm = (s?: string | null) => String(s ?? "").replace(/\s+/g, "").toLowerCase();
      const exists = u?.addresses?.some((x) => x.region === region && norm(x.postcode) === norm(address.postcode) && norm(x.line1) === norm(address.line1));
      if (u && !exists) {
        await User.updateOne({ _id: session.uid }, { $push: { addresses: { ...address, isDefault: !u.addresses?.length } } });
      }
    } catch (e) {
      console.error("[checkout] address save failed", e);
    }
  }

  await setLastOrderCookie(number);
  const redirectTo = `/order/${number}`;

  /* Paid in full by gift card. */
  if (covered) {
    await Order.updateOne({ number }, { $set: { status: "confirmed" }, $push: { history: { status: "confirmed", at: new Date(), note: `Paid by gift card ${card?.code ?? ""}` } } });
    await placed(number);
    await onOrderPaid(number).catch((e) => console.error("[checkout] onOrderPaid failed", e));
    return { ok: true, number, redirect: redirectTo };
  }

  /* Cash on delivery: confirmed now, paid at the door. */
  if (data.method === "cod") {
    await Order.updateOne({ number }, { $set: { status: "confirmed" }, $push: { history: { status: "confirmed", at: new Date(), note: "Cash on delivery order confirmed" } } });
    await placed(number);
    return { ok: true, number, redirect: redirectTo };
  }

  await placed(number);
  const charge = t.payNow; // final total, or the advance for part-COD

  /* TEST MODE: no provider keys configured. */
  const live = data.method === "stripe" ? stripeConfigured() : cashfreeConfigured();
  if (!live) {
    if (data.method === "partcod") {
      await markAdvancePaid(number, "", testRef(), `Test payment of the ${formatMoney(charge, region)} advance: no money was taken`);
    } else {
      await Order.updateOne({ number }, { $set: { "payment.method": "test" } });
      await markOrderPaid(number, testRef(), "Test payment: no money was taken");
    }
    return { ok: true, number, redirect: redirectTo };
  }

  try {
    if (data.method === "cashfree" || data.method === "partcod") {
      const cashfree = await createCashfreeOrder({
        orderId: number,
        amount: charge,
        customer: { name: address.name, email, phone: a.phone },
        returnPath: `/order/${number}?cf=1`,
        note: data.method === "partcod" ? `Advance for order ${number}` : `Order ${number}`,
        kind: data.method === "partcod" ? "cod_advance" : "order",
      });
      await Order.updateOne({ number }, { $set: { "payment.ref": number } });
      return { ok: true, number, cashfree };
    }
    const deductions = t.coupon + t.prepaid + t.loyalty + t.giftCard;
    const s = await createStripeCheckoutSession({
      number,
      email,
      items: lines.map((l) => ({ name: l.item.name, qty: l.item.qty, unitPrice: l.item.unitPrice, optionsPrice: l.item.optionsPrice, size: l.item.size })),
      shipping: t.shipping,
      extras: [{ name: "Gift wrap", amount: t.giftWrap }],
      discount: deductions,
      coupon: couponCode,
      total: t.total,
    });
    await Order.updateOne({ number }, { $set: { "payment.ref": s.id } });
    return { ok: true, number, stripeUrl: s.url };
  } catch (e) {
    console.error("[checkout] payment provider error", e);
    await releaseStock(reserved);
    await Order.updateOne(
      { number },
      { $set: { status: "cancelled", "payment.status": "failed" }, $push: { history: { status: "cancelled", at: new Date(), note: "Payment could not be started" } } }
    );
    await restoreGiftCardForOrder(number);
    await reverseLoyaltyForOrder(number);
    return { ok: false, error: "We couldn't reach the payment provider. Nothing was charged; please try again in a moment." };
  }
}

/* ---------- Cashfree return ---------- */

/** Called when the Cashfree popup closes after paying. Cashfree is asked directly, so nothing from the browser is trusted. */
export async function confirmCashfreePayment(number: string): Promise<{ ok: true; redirect: string } | { ok: false; error: string }> {
  if (!/^MGd{6}[A-Z0-9]{4}$/.test(String(number))) return { ok: false, error: "Unknown order." };
  const paid = await settleCashfree(number, "checkout").catch((e) => {
    console.error("[checkout] cashfree confirm failed", e);
    return false;
  });
  if (!paid) return { ok: false, error: "We couldn't confirm this payment yet. If money was taken, your order will be confirmed automatically within a few minutes." };
  await setLastOrderCookie(number);
  return { ok: true, redirect: `/order/${number}` };
}

/* ---------- Razorpay return (orders started before the move to Cashfree) ---------- */

export async function confirmRazorpayPayment(
  number: string,
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string
): Promise<{ ok: true; redirect: string } | { ok: false; error: string }> {
  if (!/^MG\d{6}[A-Z0-9]{4}$/.test(String(number))) return { ok: false, error: "Unknown order." };
  if (!verifyRazorpaySignature(String(razorpayOrderId), String(razorpayPaymentId), String(razorpaySignature))) {
    return { ok: false, error: "We couldn't verify this payment. If money was taken, it will be confirmed automatically within a few minutes." };
  }
  await db();
  const o = await Order.findOne({ number }, { payment: 1, partialCod: 1, status: 1 }).lean<{
    payment?: { method?: string | null; ref?: string | null; status?: string | null };
    partialCod?: { paidOnline?: number | null } | null;
    status?: string;
  }>();
  if (!o) return { ok: false, error: "Unknown order." };
  const ref = `${razorpayOrderId}:${razorpayPaymentId}`;
  if (o.payment?.method === "cod" && (o.partialCod?.paidOnline ?? 0) > 0) {
    // Part-COD advance.
    if (o.status === "placed") {
      if (o.payment?.ref !== razorpayOrderId) return { ok: false, error: "This payment doesn't match your order." };
      await markAdvancePaid(number, razorpayOrderId, ref, "Advance paid with Razorpay");
    }
  } else if (o.payment?.status !== "paid") {
    if (o.payment?.ref !== razorpayOrderId) return { ok: false, error: "This payment doesn't match your order." };
    await markOrderPaid(number, ref, "Paid with Razorpay", { "payment.ref": razorpayOrderId });
  }
  await setLastOrderCookie(number);
  return { ok: true, redirect: `/order/${number}` };
}
