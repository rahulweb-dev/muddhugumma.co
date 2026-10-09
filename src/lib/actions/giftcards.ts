"use server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getRegion } from "@/lib/queries";
import { GiftCard } from "@/lib/models";
import { formatMoney, type Region } from "@/lib/region";
import { activatePurchasedGiftCard, createPendingGiftCard, giftCardBalance } from "@/lib/giftcards";
import { createStripeCheckoutSession, stripeConfigured } from "@/lib/payments";
import { cashfreeConfigured, createCashfreeOrder, settleCashfree, type CashfreeCheckout } from "@/lib/cashfree";

/* Buying a gift card online. Same payment paths as orders: Cashfree (India), Stripe (UK), test mode without keys. */

const LAST_GC_COOKIE = "mg_last_gc";
const LIMITS: Record<Region, { min: number; max: number }> = { in: { min: 500, max: 50000 }, uk: { min: 10, max: 500 } };

const email = z.string().trim().toLowerCase().max(120).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address");
const schema = z.object({
  region: z.enum(["in", "uk"]),
  amount: z.number().int("Choose a whole amount").positive("Choose an amount"),
  recipientName: z.string().trim().min(2, "Enter their name").max(80),
  recipientEmail: email,
  message: z
    .string()
    .optional()
    .default("")
    .transform((s) => s.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim())
    .pipe(z.string().max(300, "Keep the message to 300 characters")),
  purchaserEmail: email,
  // India only: Cashfree needs the buyer's mobile (10 digits, 6–9 first).
  purchaserPhone: z.string().optional().default("").transform((s) => s.replace(/\D/g, "").slice(-10)),
});

export type GiftCardPurchaseInput = z.input<typeof schema>;
export type GiftCardPurchaseResult =
  | { ok: false; error: string; fieldErrors?: Record<string, string> }
  | { ok: true; ref: string; redirect: string }
  | { ok: true; ref: string; cashfree: CashfreeCheckout }
  | { ok: true; ref: string; stripeUrl: string };

function purchaseRef() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const tail = Array.from(randomBytes(4), (b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[b % 36]).join("");
  return `GC${ymd}${tail}`;
}

async function rememberPurchase(ref: string) {
  (await cookies()).set(LAST_GC_COOKIE, ref, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
}

export async function purchaseGiftCard(input: GiftCardPurchaseInput): Promise<GiftCardPurchaseResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) fe[i.path.map(String).join(".")] ??= i.message;
    return { ok: false, error: "Please check the highlighted details.", fieldErrors: fe };
  }
  const d = parsed.data;
  const region = await getRegion();
  if (d.region !== region) return { ok: false, error: "Your region changed. Check the amount and try again." };
  if (region === "in" && !/^[6-9]\d{9}$/.test(d.purchaserPhone)) {
    return { ok: false, error: "Please check the highlighted details.", fieldErrors: { purchaserPhone: "Enter your 10-digit mobile number" } };
  }
  const lim = LIMITS[region];
  if (d.amount < lim.min || d.amount > lim.max) {
    const msg = `Choose an amount between ${formatMoney(lim.min, region)} and ${formatMoney(lim.max, region)}.`;
    return { ok: false, error: msg, fieldErrors: { amount: msg } };
  }
  const session = await getSession();
  const purchaserEmail = session?.email?.toLowerCase() || d.purchaserEmail;

  await db();
  let ref = purchaseRef();
  for (let i = 0; i < 5 && (await GiftCard.exists({ orderNumber: ref })); i++) ref = purchaseRef();
  try {
    await createPendingGiftCard({ region, amount: d.amount, recipientName: d.recipientName, recipientEmail: d.recipientEmail, purchaserEmail, message: d.message, orderNumber: ref });
  } catch (e) {
    console.error("[giftcards] create failed", e);
    return { ok: false, error: "We couldn't set up your gift card. Nothing was charged; please try again." };
  }
  await rememberPurchase(ref);
  const thanks = `/gift-cards/thanks?ref=${ref}`;

  const live = region === "in" ? cashfreeConfigured() : stripeConfigured();
  if (!live) {
    // TEST MODE: no provider keys configured. No money is taken.
    await activatePurchasedGiftCard(ref);
    return { ok: true, ref, redirect: `${thanks}&test=1` };
  }
  try {
    if (region === "in") {
      const cashfree = await createCashfreeOrder({
        orderId: ref,
        amount: d.amount,
        customer: { name: "", email: purchaserEmail, phone: d.purchaserPhone },
        returnPath: thanks,
        note: `Gift card for ${d.recipientName}`,
        kind: "giftcard",
      });
      return { ok: true, ref, cashfree };
    }
    const s = await createStripeCheckoutSession({
      number: ref,
      email: purchaserEmail,
      items: [{ name: `House of Muddhugumma gift card for ${d.recipientName}`, qty: 1, unitPrice: d.amount, optionsPrice: 0, size: "" }],
      shipping: 0,
      discount: 0,
      total: d.amount,
      kind: "giftcard",
      successPath: thanks,
      cancelPath: "/gift-cards",
    });
    return { ok: true, ref, stripeUrl: s.url };
  } catch (e) {
    console.error("[giftcards] payment provider error", e);
    await GiftCard.deleteOne({ orderNumber: ref, active: false, expiresAt: { $exists: false } });
    return { ok: false, error: "We couldn't reach the payment provider. Nothing was charged; please try again in a moment." };
  }
}

/** Called when the Cashfree popup closes after paying. Cashfree is asked directly whether the card was paid for. */
export async function confirmGiftCardCashfree(ref: string): Promise<{ ok: true; redirect: string } | { ok: false; error: string }> {
  if (!/^GCd{6}[A-Z0-9]{4}$/.test(String(ref))) return { ok: false, error: "Unknown purchase." };
  const paid = await settleCashfree(ref, "checkout").catch(() => false);
  if (!paid) return { ok: false, error: "We couldn't confirm this payment yet. If money was taken, your gift card will be sent automatically within a few minutes." };
  return { ok: true, redirect: `/gift-cards/thanks?ref=${ref}` };
}

export type BalanceResult =
  | { ok: true; code: string; balance: string; initial: string; expires: string; state: "active" | "expired" | "used" | "inactive"; region: Region }
  | { ok: false; message: string };

export async function checkGiftCardBalance(code: string): Promise<BalanceResult> {
  try {
    const r = await giftCardBalance(code);
    if (!r.ok) return r;
    const expired = !!r.expiresAt && new Date(r.expiresAt).getTime() < Date.now();
    return {
      ok: true,
      code: r.code,
      region: r.region,
      balance: formatMoney(r.balance, r.region),
      initial: formatMoney(r.initial, r.region),
      expires: r.expiresAt ? new Date(r.expiresAt).toLocaleDateString(r.region === "in" ? "en-IN" : "en-GB", { day: "numeric", month: "long", year: "numeric" }) : "",
      state: !r.active ? "inactive" : expired ? "expired" : r.balance <= 0 ? "used" : "active",
    };
  } catch (e) {
    console.error("[giftcards] balance failed", e);
    return { ok: false, message: "We couldn't check that just now. Please try again." };
  }
}
