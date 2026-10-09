import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { Order } from "./models";
import { onOrderPaid } from "./order-events";

/*
 * Payment providers over plain fetch (no SDKs). Without keys, checkout runs in TEST MODE.
 * What is charged online:
 *  - online orders: order.total (the final amount after every discount and the gift card);
 *  - part-COD orders (India): only order.partialCod.paidOnline (the advance); the rest is cash on delivery;
 *  - gift-card purchases: the card value.
 */

export const razorpayConfigured = () => !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
export const stripeConfigured = () => !!process.env.STRIPE_SECRET_KEY;
export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3100").replace(/\/$/, "");
export const razorpayPublicKey = () => process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || "";

function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}
const hmacHex = (secret: string, body: string) => createHmac("sha256", secret).update(body, "utf8").digest("hex");

/* ---------- Razorpay ---------- */

export async function createRazorpayOrder(amountPaise: number, receipt: string, notes: Record<string, string> = {}): Promise<{ id: string; amount: number; currency: string }> {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: Math.round(amountPaise), currency: "INR", receipt, notes: { order_number: receipt, ...notes } }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; amount?: number; currency?: string; error?: { description?: string } };
  if (!res.ok || !data.id) throw new Error(`Razorpay order failed: ${data.error?.description ?? res.status}`);
  return { id: data.id, amount: data.amount ?? amountPaise, currency: data.currency ?? "INR" };
}

/** Reads a Razorpay order back (ties a gift-card payment to its purchase reference via `receipt`). */
export async function fetchRazorpayOrder(id: string): Promise<{ id: string; amount: number; receipt: string; status: string } | null> {
  if (!razorpayConfigured() || !/^order_[A-Za-z0-9]+$/.test(id)) return null;
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1/orders/${id}`, { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" });
  if (!res.ok) return null;
  const d = (await res.json().catch(() => null)) as { id?: string; amount?: number; receipt?: string; status?: string } | null;
  return d?.id ? { id: d.id, amount: d.amount ?? 0, receipt: d.receipt ?? "", status: d.status ?? "" } : null;
}

export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !orderId || !paymentId || !signature) return false;
  return safeEqualHex(hmacHex(secret, `${orderId}|${paymentId}`), signature);
}

export function verifyRazorpayWebhook(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  return safeEqualHex(hmacHex(secret, rawBody), signature);
}

/* ---------- Stripe ---------- */

export type StripeOrderInput = {
  number: string;
  email: string;
  items: { name: string; qty: number; unitPrice: number; optionsPrice: number; size: string; image?: string }[];
  shipping: number;
  /** Extra charges shown as their own lines, e.g. gift wrap. */
  extras?: { name: string; amount: number }[];
  /** Total of the deductions (only used for the label). */
  discount: number;
  coupon?: string;
  /** The exact amount to charge. Whatever the lines add up to above it becomes one Stripe discount, so totals always match. */
  total: number;
  /** "order" (default) or "giftcard" (metadata.kind, read by the webhook). */
  kind?: "order" | "giftcard";
  successPath?: string;
  cancelPath?: string;
};

const pence = (n: number) => Math.round(n * 100);

/** Hosted Checkout Session. All deductions (coupon, points, gift card) become one one-off Stripe coupon so Stripe's total equals ours. */
export async function createStripeCheckoutSession(order: StripeOrderInput): Promise<{ id: string; url: string }> {
  const key = process.env.STRIPE_SECRET_KEY!;
  const site = siteUrl();
  const success = order.successPath ?? `/order/${order.number}`;
  const p = new URLSearchParams();
  p.set("mode", "payment");
  p.set("currency", "gbp");
  p.set("customer_email", order.email);
  p.set("client_reference_id", order.number);
  p.set("metadata[number]", order.number);
  p.set("metadata[kind]", order.kind ?? "order");
  p.set("payment_intent_data[metadata][number]", order.number);
  p.set("success_url", `${site}${success}${success.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`);
  p.set("cancel_url", `${site}${order.cancelPath ?? "/checkout"}`);
  let i = 0;
  let linesPence = 0;
  const line = (name: string, qty: number, amount: number) => {
    p.set(`line_items[${i}][quantity]`, String(qty));
    p.set(`line_items[${i}][price_data][currency]`, "gbp");
    p.set(`line_items[${i}][price_data][unit_amount]`, String(pence(amount)));
    p.set(`line_items[${i}][price_data][product_data][name]`, name);
    linesPence += qty * pence(amount);
    i++;
  };
  for (const it of order.items) line(it.size ? `${it.name} (${it.size})` : it.name, it.qty, it.unitPrice + it.optionsPrice);
  for (const x of order.extras ?? []) if (x.amount > 0) line(x.name, 1, x.amount);
  if (order.shipping > 0) line("UK delivery", 1, order.shipping);

  const off = linesPence - pence(order.total);
  if (off < 0) throw new Error("Stripe lines add up to less than the order total");
  if (off > 0) {
    const c = await stripePost(
      "/v1/coupons",
      new URLSearchParams({
        amount_off: String(off),
        currency: "gbp",
        duration: "once",
        max_redemptions: "1",
        name: order.coupon ? `Code ${order.coupon} and savings` : "Savings and gift card",
      }),
      key
    );
    p.set("discounts[0][coupon]", c.id as string);
  }
  const s = await stripePost("/v1/checkout/sessions", p, key);
  if (!s.url) throw new Error("Stripe session has no URL");
  return { id: s.id as string, url: s.url as string };
}

async function stripePost(path: string, body: URLSearchParams, key: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
  if (!res.ok || !data.id) throw new Error(`Stripe ${path} failed: ${data.error?.message ?? res.status}`);
  return data;
}

/** Used by the confirmation page when the shopper lands before the webhook. */
export async function retrieveStripeSession(id: string): Promise<{ id: string; payment_status: string; payment_intent: string | null; metadata: Record<string, string> } | null> {
  if (!stripeConfigured() || !/^cs_[A-Za-z0-9_]+$/.test(id)) return null;
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${id}`, {
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

/** Verifies a `Stripe-Signature` header (t=…,v1=…) against the raw body, with a 5-minute tolerance. */
export function verifyStripeSignature(rawBody: string, header: string | null, toleranceSec = 300): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  let t = "";
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2).map((s) => s.trim());
    if (k === "t") t = v;
    if (k === "v1" && v) v1.push(v);
  }
  const ts = Number(t);
  if (!t || !Number.isFinite(ts) || !v1.length) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSec) return false;
  const expected = hmacHex(secret, `${t}.${rawBody}`);
  return v1.some((sig) => safeEqualHex(expected, sig));
}

/* ---------- shared ---------- */

/**
 * Marks an order paid exactly once (idempotent). Moves "placed" orders to "confirmed" and fires onOrderPaid.
 * `match` narrows the order further, e.g. by the provider reference.
 */
export async function markOrderPaid(number: string, ref: string, note: string, match: Record<string, unknown> = {}): Promise<boolean> {
  await db();
  const now = new Date();
  const res = await Order.updateOne(
    { number, "payment.status": { $ne: "paid" }, ...match },
    { $set: { "payment.status": "paid", "payment.ref": ref } }
  );
  if (!res.modifiedCount) return false;
  await Order.updateOne(
    { number, status: "placed" },
    { $set: { status: "confirmed" }, $push: { history: { status: "confirmed", at: now, note } } }
  );
  await onOrderPaid(number).catch((e) => console.error("[payments] onOrderPaid failed", e));
  return true;
}

/**
 * Part-paid cash on delivery (India only). The rule:
 *  - the order is payment.method "cod" with order.partialCod = { paidOnline: advance, dueOnDelivery: the rest };
 *  - while the advance is unpaid the order stays "placed" and payment.ref holds the Razorpay order id;
 *  - once the advance is paid the order moves to "confirmed" and payment.ref becomes "<razorpay order id>:<payment id>" (or TEST-… in test mode);
 *  - payment.status stays "pending" because the rest is collected at the door; the admin marks it "paid" on delivery.
 * Idempotent: only the first confirmation for that reference changes anything. Fires onOrderPaid.
 */
export async function markAdvancePaid(number: string, expectedRef: string, ref: string, note: string): Promise<boolean> {
  await db();
  const res = await Order.updateOne(
    { number, status: "placed", "payment.method": "cod", "partialCod.paidOnline": { $gt: 0 }, "payment.ref": expectedRef },
    { $set: { status: "confirmed", "payment.ref": ref }, $push: { history: { status: "confirmed", at: new Date(), note } } }
  );
  if (!res.modifiedCount) return false;
  await onOrderPaid(number).catch((e) => console.error("[payments] onOrderPaid failed", e));
  return true;
}
