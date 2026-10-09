import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { GiftCard, Order } from "./models";
import { markAdvancePaid, markOrderPaid, siteUrl } from "./payments";
import { activatePurchasedGiftCard } from "./giftcards";

/*
 * Cashfree Payment Gateway (India), over plain fetch, API version 2023-08-01.
 *  - The Cashfree order_id is our own reference: the order number (MG…) or the gift card purchase reference (GC…).
 *  - While unpaid, the order's payment.ref holds that order_id; once paid it becomes "<order_id>:<cf_payment_id>".
 *  - Payment is only ever confirmed by asking Cashfree for the order (status PAID and the amount we expect), whether the
 *    trigger is the checkout popup closing, the return page or the webhook. A browser can't fake it.
 * Env: CASHFREE_APP_ID, CASHFREE_SECRET_KEY, CASHFREE_ENV ("sandbox" | "production", default sandbox).
 */

const API_VERSION = "2023-08-01";

export const cashfreeConfigured = () => !!(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY);
export const cashfreeMode = (): "sandbox" | "production" => (process.env.CASHFREE_ENV === "production" ? "production" : "sandbox");
const base = () => (cashfreeMode() === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg");

const headers = () => ({
  "x-client-id": process.env.CASHFREE_APP_ID ?? "",
  "x-client-secret": process.env.CASHFREE_SECRET_KEY ?? "",
  "x-api-version": API_VERSION,
  "Content-Type": "application/json",
  Accept: "application/json",
});

export type CashfreeCheckout = { sessionId: string; mode: "sandbox" | "production" };

type CreateInput = {
  orderId: string;
  amount: number; // rupees
  customer: { name: string; email: string; phone: string };
  returnPath: string;
  note?: string;
  kind: "order" | "cod_advance" | "giftcard";
};

/** Creates a Cashfree order and returns the session id the browser SDK opens. */
export async function createCashfreeOrder(i: CreateInput): Promise<CashfreeCheckout> {
  const site = siteUrl();
  const https = site.startsWith("https://");
  const phone = i.customer.phone.replace(/\D/g, "").slice(-10);
  const body = {
    order_id: i.orderId,
    order_amount: Math.round(i.amount * 100) / 100,
    order_currency: "INR",
    customer_details: {
      customer_id: i.orderId,
      customer_name: i.customer.name.slice(0, 100) || undefined,
      customer_email: i.customer.email,
      customer_phone: phone,
    },
    // Cashfree only accepts https URLs here; on localhost the popup flow and confirmCashfree… cover it.
    order_meta: https ? { return_url: `${site}${i.returnPath}`, notify_url: `${site}/api/webhooks/cashfree` } : undefined,
    order_note: i.note,
    order_tags: { kind: i.kind },
  };
  const res = await fetch(`${base()}/orders`, { method: "POST", headers: headers(), body: JSON.stringify(body), cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as { payment_session_id?: string; message?: string };
  if (!res.ok || !data.payment_session_id) throw new Error(`Cashfree order failed: ${data.message ?? res.status}`);
  return { sessionId: data.payment_session_id, mode: cashfreeMode() };
}

type CashfreeOrder = { order_id: string; order_amount: number; order_status: string };

export async function fetchCashfreeOrder(orderId: string): Promise<CashfreeOrder | null> {
  if (!cashfreeConfigured() || !/^[A-Za-z0-9_-]{3,50}$/.test(orderId)) return null;
  const res = await fetch(`${base()}/orders/${orderId}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) return null;
  const d = (await res.json().catch(() => null)) as CashfreeOrder | null;
  return d?.order_id ? d : null;
}

/** The successful payment's id, for the order's payment reference. */
async function successfulPaymentId(orderId: string): Promise<string> {
  const res = await fetch(`${base()}/orders/${orderId}/payments`, { headers: headers(), cache: "no-store" });
  if (!res.ok) return "paid";
  const list = (await res.json().catch(() => [])) as { cf_payment_id?: string | number; payment_status?: string }[];
  const ok = Array.isArray(list) ? list.find((p) => p.payment_status === "SUCCESS") : undefined;
  return ok?.cf_payment_id ? String(ok.cf_payment_id) : "paid";
}

/** Webhook check: base64 HMAC-SHA256 of timestamp + raw body with the secret key, timestamp within 10 minutes. */
export function verifyCashfreeWebhook(rawBody: string, signature: string | null, timestamp: string | null): boolean {
  const secret = process.env.CASHFREE_SECRET_KEY;
  if (!secret || !signature || !timestamp) return false;
  const ts = Number(timestamp);
  const ms = ts > 1e12 ? ts : ts * 1000; // Cashfree sends milliseconds
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ms) > 10 * 60 * 1000) return false;
  const expected = createHmac("sha256", secret).update(timestamp + rawBody, "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

const cents = (n: number | null | undefined) => Math.round((Number(n) || 0) * 100);

type LeanOrder = { number: string; total?: number; payment?: { method?: string; status?: string; ref?: string }; partialCod?: { paidOnline?: number } };

/**
 * Settles a Cashfree order if Cashfree says it is PAID for the amount we expect: an order, a part-COD advance or a
 * gift card. Idempotent; returns whether it is paid.
 */
export async function settleCashfree(orderId: string, via: string): Promise<boolean> {
  const cf = await fetchCashfreeOrder(orderId);
  if (!cf || cf.order_status !== "PAID") return false;
  await db();

  if (/^GC\d{6}[A-Z0-9]{4}$/.test(orderId)) {
    const card = await GiftCard.findOne({ orderNumber: orderId }, { initial: 1 }).lean<{ initial?: number }>();
    if (!card || cents(card.initial) !== cents(cf.order_amount)) return false;
    await activatePurchasedGiftCard(orderId);
    return true;
  }

  const o = await Order.findOne({ number: orderId }, { number: 1, total: 1, payment: 1, partialCod: 1 }).lean<LeanOrder>();
  if (!o) return false;
  const advance = o.payment?.method === "cod" && (o.partialCod?.paidOnline ?? 0) > 0;
  // Already settled (by the popup, the return page or the webhook).
  if (o.payment?.ref?.startsWith(`${orderId}:`)) return true;
  if (o.payment?.ref !== orderId) return false;
  const ref = `${orderId}:${await successfulPaymentId(orderId)}`;
  if (advance) {
    if (cents(o.partialCod?.paidOnline) !== cents(cf.order_amount)) return false;
    await markAdvancePaid(o.number, orderId, ref, `Advance paid with Cashfree (${via})`);
    return true;
  }
  if (o.payment?.method !== "cashfree" || cents(o.total) !== cents(cf.order_amount)) return false;
  await markOrderPaid(o.number, ref, `Paid with Cashfree (${via})`, { "payment.ref": orderId });
  return true;
}
