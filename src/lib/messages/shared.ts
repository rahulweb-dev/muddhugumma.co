import "server-only";
import { esc, renderEmail, siteUrl, type EmailParts } from "../email-layout";
import { formatMoney, REGION_CONFIG, type Region } from "../region";
import type { OrderDoc } from "../models";

/* Building blocks for customer emails. All HTML uses inline styles (email clients ignore stylesheets). */

export type Message = {
  subject: string;
  html: string;
  text: string;
  /** Short readable WhatsApp text (logged to the Outbox; the live provider uses `waTemplate` + `waParams`). */
  whatsapp?: string;
  waTemplate?: string;
  waParams?: string[];
};

export const MUTED = "#6E6962";
export const LINE = "#E3DDD3";
export const BRONZE = "#9A744A";
export const OK = "#2F6B4A";

export const money = (v: number, r: Region) => formatMoney(Number(v) || 0, r);

const TZ: Record<Region, string> = { in: "Asia/Kolkata", uk: "Europe/London" };

/** "Saturday, 10 October" in the shopper's timezone. */
export const longDay = (d: Date | string | undefined, r: Region) =>
  d ? new Date(d).toLocaleDateString(REGION_CONFIG[r].locale, { timeZone: TZ[r], weekday: "long", day: "numeric", month: "long" }) : "";

/** "10 Oct" in the shopper's timezone. */
export const shortDay = (d: Date | string | undefined, r: Region) =>
  d ? new Date(d).toLocaleDateString(REGION_CONFIG[r].locale, { timeZone: TZ[r], day: "numeric", month: "short" }) : "";

/**
 * Absolute image URL for emails. Only ImageKit (or already absolute) URLs are used, because a localhost
 * site URL would show a broken image in the inbox. Without ImageKit the email lists names only.
 */
export function emailImage(path: string | undefined, w = 120): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path.includes("ik.imagekit.io") ? `${path}${path.includes("?") ? "&" : "?"}tr=w-${w},q-75,f-jpg` : path;
  const ep = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT?.replace(/\/$/, "");
  if (!ep) return null;
  return `${ep}/${path.replace(/^\/+/, "").replace(/^img\//, "")}?tr=w-${w},q-75,f-jpg`;
}

export const p = (html: string) => `<p style="margin:0 0 14px">${html}</p>`;
export const small = (html: string) => `<p style="margin:0 0 12px;font-size:13px;color:${MUTED}">${html}</p>`;
export const link = (label: string, url: string) => `<a href="${esc(url)}" style="color:${BRONZE}">${esc(label)}</a>`;

/** A highlighted box, e.g. for a coupon code or courier details. */
export const box = (html: string) =>
  `<div style="margin:6px 0 16px;padding:14px 16px;background:#F2EEE8;border:1px solid ${LINE};font-size:14px;line-height:1.6">${html}</div>`;

export const codeBox = (code: string, note: string) =>
  `<div style="margin:6px 0 16px;padding:16px;background:#F2EEE8;border:1px dashed ${BRONZE};text-align:center">
<div style="font-family:'Courier New',monospace;font-size:22px;letter-spacing:3px;font-weight:bold;color:#1B1A18">${esc(code)}</div>
<div style="font-size:12px;color:${MUTED};margin-top:6px">${esc(note)}</div></div>`;

export type LineItem = { name: string; image?: string; size?: string; qty: number; price?: number; note?: string; url?: string };

/** Item rows with a small photo (when ImageKit is set up), name, size and quantity, and line price. */
export function itemsTable(items: LineItem[], r: Region): string {
  const rows = items
    .map((it) => {
      const img = emailImage(it.image);
      const name = it.url ? `<a href="${esc(it.url)}" style="color:#1B1A18;text-decoration:none">${esc(it.name)}</a>` : esc(it.name);
      const meta = [it.size ? `Size ${esc(it.size)}` : "", `Qty ${it.qty}`, it.note ? esc(it.note) : ""].filter(Boolean).join(" · ");
      return `<tr>
${img ? `<td width="64" style="padding:10px 12px 10px 0;vertical-align:top"><img src="${esc(img)}" width="56" height="75" alt="" style="display:block;width:56px;height:75px;object-fit:cover;border:1px solid ${LINE}"></td>` : ""}
<td style="padding:10px 0;vertical-align:top;font-size:14px"><b style="font-weight:600">${name}</b><br><span style="font-size:12.5px;color:${MUTED}">${meta}</span></td>
${it.price !== undefined ? `<td align="right" style="padding:10px 0 10px 12px;vertical-align:top;font-size:14px;white-space:nowrap">${money(it.price, r)}</td>` : ""}
</tr>`;
    })
    .join(`<tr><td colspan="3" style="border-top:1px solid ${LINE};height:1px;line-height:1px;font-size:0">&nbsp;</td></tr>`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 16px;border-top:1px solid ${LINE};border-bottom:1px solid ${LINE}">${rows}</table>`;
}

export const orderItems = (o: OrderDoc): LineItem[] =>
  (o.items ?? []).map((i) => {
    const notes: string[] = [];
    if (i.options?.blouse === "stitched") notes.push("Blouse stitched to measure");
    else if (i.options?.blouse === "unstitched") notes.push("Unstitched blouse piece");
    if (i.options?.fallPico) notes.push("Fall & pico");
    return {
      name: i.name,
      image: i.image,
      size: i.size,
      qty: Number(i.qty) || 1,
      price: ((Number(i.unitPrice) || 0) + (Number(i.optionsPrice) || 0)) * (Number(i.qty) || 1),
      note: notes.join(", "),
      url: i.slug ? siteUrl(`/p/${i.slug}`) : undefined,
    };
  });

/** Subtotal, every discount or fee present on the order, and the total. */
export function totalsTable(o: OrderDoc): string {
  const r = o.region;
  const rows: [string, string, string?][] = [["Subtotal", money(o.subtotal, r)]];
  if (o.discount > 0) rows.push([`Coupon${o.coupon ? ` (${o.coupon})` : ""}`, `−${money(o.discount, r)}`, OK]);
  if ((o.prepaidDiscount ?? 0) > 0) rows.push(["Prepaid discount", `−${money(o.prepaidDiscount!, r)}`, OK]);
  if ((o.loyalty?.discount ?? 0) > 0) rows.push([`Circle points (${o.loyalty!.redeemedPoints ?? 0} pts)`, `−${money(o.loyalty!.discount!, r)}`, OK]);
  if (o.gift?.wrap) rows.push(["Gift wrap", (o.gift.fee ?? 0) > 0 ? money(o.gift.fee!, r) : "Free"]);
  rows.push(["Shipping", o.shipping > 0 ? money(o.shipping, r) : "Free"]);
  if (o.codFee > 0) rows.push(["Cash on delivery fee", money(o.codFee, r)]);
  if ((o.giftCard?.amount ?? 0) > 0) rows.push([`Gift card${o.giftCard?.code ? ` ending ${o.giftCard.code.slice(-4)}` : ""}`, `−${money(o.giftCard!.amount!, r)}`, OK]);
  const body = rows
    .map(([k, v, c]) => `<tr><td style="padding:4px 0;font-size:14px;color:${c ?? MUTED}">${esc(k)}</td><td align="right" style="padding:4px 0;font-size:14px;color:${c ?? "#1B1A18"}">${esc(v)}</td></tr>`)
    .join("");
  let tail = `<tr><td style="padding:10px 0 4px;border-top:1px solid ${LINE};font-size:15px;font-weight:bold">Total</td><td align="right" style="padding:10px 0 4px;border-top:1px solid ${LINE};font-size:15px;font-weight:bold">${money(o.total, r)}</td></tr>`;
  const paid = o.partialCod?.paidOnline ?? 0;
  const due = o.partialCod?.dueOnDelivery ?? 0;
  if (paid > 0 || due > 0) {
    tail += `<tr><td style="padding:4px 0;font-size:13px;color:${MUTED}">Paid online</td><td align="right" style="padding:4px 0;font-size:13px">${money(paid, r)}</td></tr>`;
    tail += `<tr><td style="padding:4px 0;font-size:13px;color:${MUTED}">Due on delivery</td><td align="right" style="padding:4px 0;font-size:13px">${money(due, r)}</td></tr>`;
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">${body}${tail}</table>`;
}

export const addressBlock = (o: OrderDoc) => {
  const a = o.address ?? {};
  const lines = [a.name, a.line1, a.line2, [a.city, a.state].filter(Boolean).join(", ") + (a.postcode ? ` ${a.postcode}` : ""), o.region === "uk" ? "United Kingdom" : "India"]
    .filter((x) => x && String(x).trim())
    .map((x) => esc(String(x)));
  return `<div style="font-size:13.5px;line-height:1.55;color:#3E3A35">${lines.join("<br>")}</div>`;
};

export const firstName = (name?: string) => (name ?? "").trim().split(/\s+/)[0] || "there";

export function build(subject: string, parts: EmailParts, wa?: { text: string; template: string; params: string[] }): Message {
  const { html, text } = renderEmail(parts);
  return { subject, html, text, whatsapp: wa?.text, waTemplate: wa?.template, waParams: wa?.params };
}
