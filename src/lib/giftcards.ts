import "server-only";
import { randomInt } from "node:crypto";
import { db } from "./db";
import { GiftCard, Order, type GiftCardDoc, type OrderDoc } from "./models";
import { sendEmail } from "./notify";
import { esc, renderEmail, siteUrl } from "./email-layout";
import { formatMoney, type Region } from "./region";

/* Gift cards. Owner: checkout & money. Returns (store credit) and the admin issue screen call issueGiftCard.
 *
 * Lifecycle
 *  - Issued (admin, store credit, or a paid purchase): active, expiresAt = 1 year unless given.
 *  - Bought online: created inactive WITHOUT expiresAt while the payment is pending (orderNumber = purchase ref "GC…"),
 *    then activated by activatePurchasedGiftCard() once the payment is confirmed (expiry starts then).
 *  - Redeemed at checkout: balance decremented atomically (guarded by balance >= amount) with a redemption entry
 *    { orderNumber, amount }. Restoring a cancelled order pushes a negative entry for that order (idempotent).
 */

export type IssueGiftCardInput = {
  region: "in" | "uk";
  amount: number;
  recipientName?: string;
  recipientEmail?: string;
  purchaserEmail?: string;
  message?: string;
  orderNumber?: string;
  expiresAt?: Date;
  /** Send the "you've received a gift card" email (default true when recipientEmail is set). */
  notify?: boolean;
};

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const block = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** Code like MG-7KQ2-X9PA (no 0/O/1/I). */
export function newGiftCardCode(): string {
  return `MG-${block()}-${block()}`;
}

/** Normalises what a shopper typed ("mg 7kq2x9pa" → "MG-7KQ2-X9PA"). */
export function normaliseGiftCardCode(raw: string): string {
  const c = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c.length === 10 && c.startsWith("MG")) return `MG-${c.slice(2, 6)}-${c.slice(6)}`;
  return String(raw ?? "").trim().toUpperCase().slice(0, 40);
}

async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = newGiftCardCode();
    if (!(await GiftCard.exists({ code }))) return code;
  }
  throw new Error("Could not generate a gift card code");
}

/** Creates an active gift card and (optionally) emails the recipient. */
export async function issueGiftCard(input: IssueGiftCardInput): Promise<GiftCardDoc> {
  const amount = input.region === "in" ? Math.round(input.amount) : Math.round(input.amount * 100) / 100;
  if (!(amount > 0)) throw new Error("Enter an amount above zero.");
  await db();
  const doc = await GiftCard.create({
    code: await uniqueCode(),
    region: input.region,
    initial: amount,
    balance: amount,
    purchaserEmail: input.purchaserEmail?.toLowerCase() ?? "",
    recipientName: input.recipientName ?? "",
    recipientEmail: input.recipientEmail?.toLowerCase() ?? "",
    message: input.message ?? "",
    orderNumber: input.orderNumber ?? "",
    active: true,
    expiresAt: input.expiresAt ?? new Date(Date.now() + YEAR_MS),
    redemptions: [],
  });
  const card = doc.toObject() as GiftCardDoc;
  if (card.recipientEmail && input.notify !== false) await emailRecipient(card);
  return card;
}

/* ---------- emails ---------- */

const expiry = (d?: Date, region: Region = "in") =>
  d ? new Date(d).toLocaleDateString(region === "in" ? "en-IN" : "en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";

function cardBlock(card: GiftCardDoc) {
  return `<div style="margin:18px 0;padding:18px;border:1px dashed #9A744A;background:#F2EEE8;text-align:center">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#6E6962">Gift card · ${esc(formatMoney(card.initial, card.region))}</div>
<div style="font-size:24px;letter-spacing:4px;margin-top:8px;font-weight:bold;color:#1B1A18">${esc(card.code)}</div>
<div style="font-size:12px;color:#6E6962;margin-top:8px">Valid until ${esc(expiry(card.expiresAt, card.region))} on ${card.region === "in" ? "India (₹)" : "UK (£)"} orders</div>
</div>`;
}

export async function emailRecipient(card: GiftCardDoc) {
  if (!card.recipientEmail) return;
  const name = card.recipientName?.split(/\s+/)[0] || "there";
  const from = card.purchaserEmail ? "Someone special" : "House of Muddhugumma";
  const { html, text } = renderEmail({
    preheader: `A ${formatMoney(card.initial, card.region)} gift card is waiting for you.`,
    kicker: "A gift for you",
    heading: `${formatMoney(card.initial, card.region)} to spend`,
    body: `<p>Hi ${esc(name)},</p><p>${esc(from)} has sent you a House of Muddhugumma gift card. Use it on sarees, kurta sets and lehengas: enter the code in the <b>Gift card</b> box at checkout.</p>${
      card.message ? `<p style="font-family:Georgia,serif;font-style:italic;font-size:17px;color:#5B3A22">“${esc(card.message)}”</p>` : ""
    }${cardBlock(card)}<p>You can use it over several orders until the balance runs out.</p>`,
    cta: { label: "Start shopping", url: siteUrl("/c/new") },
    footnote: `Check your balance any time at ${siteUrl("/gift-cards/balance")}.`,
  });
  await sendEmail({ to: card.recipientEmail, subject: `You've received a ${formatMoney(card.initial, card.region)} gift card`, html, text, template: "giftcard_received", ref: card.code });
}

export async function emailPurchaser(card: GiftCardDoc) {
  if (!card.purchaserEmail) return;
  const who = card.recipientName || card.recipientEmail || "your recipient";
  const { html, text } = renderEmail({
    preheader: `Your ${formatMoney(card.initial, card.region)} gift card is on its way.`,
    kicker: "Gift card receipt",
    heading: "Thank you for your gift",
    body: `<p>Your ${esc(formatMoney(card.initial, card.region))} gift card for ${esc(who)} is ready${
      card.recipientEmail ? ` and we've emailed it to ${esc(card.recipientEmail)}` : ""
    }.</p>${cardBlock(card)}<p>Keep this email safe: anyone with the code can spend the balance. Purchase reference: ${esc(card.orderNumber ?? "")}.</p>`,
    cta: { label: "Check the balance", url: siteUrl("/gift-cards/balance") },
  });
  await sendEmail({ to: card.purchaserEmail, subject: `Your gift card receipt (${card.code})`, html, text, template: "giftcard_receipt", ref: card.orderNumber || card.code });
}

/* ---------- online purchase ---------- */

/** Creates the card for a purchase awaiting payment (inactive, no expiry yet). */
export async function createPendingGiftCard(input: Omit<IssueGiftCardInput, "expiresAt" | "notify"> & { orderNumber: string }): Promise<GiftCardDoc> {
  await db();
  const doc = await GiftCard.create({
    code: await uniqueCode(),
    region: input.region,
    initial: input.amount,
    balance: input.amount,
    purchaserEmail: input.purchaserEmail?.toLowerCase() ?? "",
    recipientName: input.recipientName ?? "",
    recipientEmail: input.recipientEmail?.toLowerCase() ?? "",
    message: input.message ?? "",
    orderNumber: input.orderNumber,
    active: false,
    redemptions: [],
  });
  return doc.toObject() as GiftCardDoc;
}

/** Activates a paid purchase exactly once and emails the recipient and purchaser. Returns the card (or null if unknown). */
export async function activatePurchasedGiftCard(purchaseRef: string): Promise<GiftCardDoc | null> {
  await db();
  const card = await GiftCard.findOneAndUpdate(
    { orderNumber: purchaseRef, active: false, expiresAt: { $exists: false } },
    { $set: { active: true, expiresAt: new Date(Date.now() + YEAR_MS) } },
    { new: true }
  ).lean<GiftCardDoc>();
  if (card) {
    await emailRecipient(card).catch((e) => console.error("[giftcards] recipient email failed", e));
    await emailPurchaser(card).catch((e) => console.error("[giftcards] purchaser email failed", e));
    return card;
  }
  return GiftCard.findOne({ orderNumber: purchaseRef }).lean<GiftCardDoc>();
}

/* ---------- redeeming ---------- */

export type UsableCard = { ok: true; code: string; balance: number; expiresAt?: Date } | { ok: false; message: string };

/** Checks a code for use on an order in `region`. */
export async function findUsableGiftCard(raw: string, region: Region): Promise<UsableCard> {
  const code = normaliseGiftCardCode(raw);
  if (!/^MG-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return { ok: false, message: "Enter a gift card code like MG-7KQ2-X9PA." };
  await db();
  const c = await GiftCard.findOne({ code }).lean<GiftCardDoc>();
  if (!c || !c.active) return { ok: false, message: `${code} isn't an active gift card.` };
  if (c.region !== region) return { ok: false, message: `${code} is for ${c.region === "in" ? "India (₹)" : "UK (£)"} orders only.` };
  if (c.expiresAt && new Date(c.expiresAt).getTime() < Date.now()) return { ok: false, message: `${code} expired on ${expiry(c.expiresAt, region)}.` };
  if (!(c.balance > 0)) return { ok: false, message: `${code} has no balance left.` };
  return { ok: true, code, balance: c.balance, expiresAt: c.expiresAt };
}

/** Takes `amount` off the card for an order, atomically. Returns false if the card can no longer cover it. */
export async function redeemGiftCard(code: string, region: Region, amount: number, orderNumber: string): Promise<boolean> {
  if (amount <= 0) return true;
  await db();
  const now = new Date();
  const res = await GiftCard.updateOne(
    { code, region, active: true, balance: { $gte: amount }, $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }] },
    { $inc: { balance: -amount }, $push: { redemptions: { orderNumber, amount, at: now } } }
  );
  return res.modifiedCount === 1;
}

/** Puts the amount used on a cancelled order back on its gift card (idempotent). */
export async function restoreGiftCardForOrder(orderNumber: string): Promise<void> {
  try {
    await db();
    const o = await Order.findOne({ number: orderNumber }, { giftCard: 1 }).lean<Pick<OrderDoc, "giftCard">>();
    const code = o?.giftCard?.code;
    if (!code) return;
    const card = await GiftCard.findOne({ code }).lean<GiftCardDoc>();
    if (!card) return;
    const used = card.redemptions.filter((r) => r.orderNumber === orderNumber).reduce((n, r) => n + (r.amount ?? 0), 0);
    if (used <= 0) return; // nothing taken, or already restored
    const amount = card.region === "in" ? Math.round(used) : Math.round(used * 100) / 100;
    // Atomic guard: only if no restore entry (negative amount) exists yet for this order.
    await GiftCard.updateOne(
      { code, redemptions: { $not: { $elemMatch: { orderNumber, amount: { $lt: 0 } } } } },
      { $inc: { balance: amount }, $push: { redemptions: { orderNumber, amount: -amount, at: new Date() } } }
    );
  } catch (e) {
    console.error("[giftcards] restore failed", orderNumber, e);
  }
}

/** Public balance lookup (code only; no personal details). */
export async function giftCardBalance(raw: string): Promise<{ ok: true; code: string; region: Region; balance: number; initial: number; expiresAt?: Date; active: boolean } | { ok: false; message: string }> {
  const code = normaliseGiftCardCode(raw);
  if (!/^MG-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return { ok: false, message: "Enter a gift card code like MG-7KQ2-X9PA." };
  await db();
  const c = await GiftCard.findOne({ code }).lean<GiftCardDoc>();
  if (!c || (!c.active && !c.expiresAt)) return { ok: false, message: "We couldn't find that gift card. Check the code and try again." };
  return { ok: true, code, region: c.region, balance: c.balance, initial: c.initial, expiresAt: c.expiresAt, active: c.active };
}
