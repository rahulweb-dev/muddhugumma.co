import "server-only";
import { db } from "./db";
import { Order, Product, nextSequence, type OrderDoc, type ProductDoc } from "./models";
import { getSettings } from "./settings";
import type { Region } from "./region";

/*
 * Tax invoices. Owner: checkout & money.
 * An invoice number is assigned the first time an invoice is viewed for an order that is confirmed / packed / shipped /
 * delivered, or paid. India: "MG/2026-27/000001" (one sequence per Indian financial year, April–March).
 * UK: "MGUK-2026-000001" (one sequence per calendar year).
 * All shop prices include tax; tax is worked backwards out of each line.
 */

/**
 * GST on apparel and fabric, tax-inclusive prices.
 * CONFIRM WITH YOUR ACCOUNTANT before relying on these numbers.
 *  - Rate: LOW_RATE when the taxable value per piece is at most THRESHOLD_PER_UNIT (₹), otherwise HIGH_RATE.
 *    The value per piece is after the order's discounts (coupon, online-payment discount and points are spread across the lines).
 *  - Delivery, gift wrap and COD charges follow the main supply: they are taxed at the highest rate on the invoice.
 *  - Same state as the store (settings.stateCode, Telangana 36): CGST + SGST, half each. Other states: IGST.
 */
export const GST_RULES = { thresholdPerUnit: 2500, lowRate: 5, highRate: 18 } as const;

/** UK: prices include VAT at 20%, so VAT = gross / 6. */
export const UK_VAT_RATE = 20;

/** HSN codes by product (fabric for sarees; made garments for kurta sets and lehengas). */
export function hsnFor(p: { category?: string; fabric?: string }): string {
  if (p.category === "kurta-sets" || p.category === "lehengas") return "6204";
  const f = (p.fabric ?? "").toLowerCase();
  if (/art silk|georgette|synthetic|polyester|chiffon|crepe|satin/.test(f)) return "5407";
  if (/silk|tissue/.test(f)) return "5007";
  if (/cotton/.test(f)) return "5208";
  if (/linen/.test(f)) return "5309";
  return "5007";
}

/** GST state codes (as printed on GSTINs). */
export const GST_STATE_CODES: Record<string, string> = {
  "Jammu and Kashmir": "01", "Himachal Pradesh": "02", Punjab: "03", Chandigarh: "04", Uttarakhand: "05", Haryana: "06", Delhi: "07",
  Rajasthan: "08", "Uttar Pradesh": "09", Bihar: "10", Sikkim: "11", "Arunachal Pradesh": "12", Nagaland: "13", Manipur: "14",
  Mizoram: "15", Tripura: "16", Meghalaya: "17", Assam: "18", "West Bengal": "19", Jharkhand: "20", Odisha: "21", Chhattisgarh: "22",
  "Madhya Pradesh": "23", Gujarat: "24", "Dadra and Nagar Haveli and Daman and Diu": "26", Maharashtra: "27", Karnataka: "29", Goa: "30",
  Lakshadweep: "31", Kerala: "32", "Tamil Nadu": "33", Puducherry: "34", "Andaman and Nicobar Islands": "35", Telangana: "36",
  "Andhra Pradesh": "37", Ladakh: "38",
};

const INVOICEABLE = ["confirmed", "packed", "shipped", "delivered"];

/** Indian financial year label for a date, e.g. 2026-27 (April to March). */
export function indianFY(d = new Date()): string {
  const y = d.getFullYear();
  const start = d.getMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export type InvoiceLine = {
  description: string;
  detail: string;
  hsn: string;
  qty: number;
  /** Price incl. tax after discounts, for the whole line. */
  gross: number;
  taxable: number;
  rate: number;
  tax: number;
};

export type InvoiceData = {
  number: string;
  date: Date;
  orderNumber: string;
  orderDate: Date;
  region: Region;
  seller: { name: string; address: string; taxId: string; taxLabel: string; stateCode: string; email: string };
  buyer: { name: string; email: string; phone: string; address: string[]; state: string; stateCode: string };
  placeOfSupply: string;
  intraState: boolean;
  lines: InvoiceLine[];
  totals: { gross: number; taxable: number; tax: number; cgst: number; sgst: number; igst: number; vat: number };
  /** Breakdown of what was paid and how. */
  money: { label: string; amount: number }[];
  payment: { method: string; status: string; dueOnDelivery: number };
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Gives the order an invoice number if it doesn't have one yet (only for confirmed/paid orders). Returns the number or "". */
export async function ensureInvoiceNumber(orderNumber: string): Promise<string> {
  await db();
  const o = await Order.findOne({ number: orderNumber }, { invoiceNumber: 1, status: 1, payment: 1, region: 1 }).lean<Pick<OrderDoc, "invoiceNumber" | "status" | "payment" | "region">>();
  if (!o) return "";
  if (o.invoiceNumber) return o.invoiceNumber;
  if (!INVOICEABLE.includes(o.status) && o.payment?.status !== "paid") return "";
  if (o.status === "cancelled") return "";
  const now = new Date();
  let inv: string;
  if (o.region === "uk") {
    const seq = await nextSequence(`invoice-uk-${now.getFullYear()}`);
    inv = `MGUK-${now.getFullYear()}-${String(seq).padStart(6, "0")}`;
  } else {
    const fy = indianFY(now);
    const seq = await nextSequence(`invoice-in-${fy}`);
    inv = `MG/${fy}/${String(seq).padStart(6, "0")}`;
  }
  const res = await Order.updateOne({ number: orderNumber, invoiceNumber: { $in: ["", null] } }, { $set: { invoiceNumber: inv } });
  if (res.modifiedCount) return inv;
  // Another request numbered it first (this sequence number is skipped).
  const again = await Order.findOne({ number: orderNumber }, { invoiceNumber: 1 }).lean<Pick<OrderDoc, "invoiceNumber">>();
  return again?.invoiceNumber ?? "";
}

const METHOD: Record<string, string> = {
  cod: "Cash on delivery",
  cashfree: "Cashfree (UPI, cards, net banking)",
  razorpay: "Razorpay (UPI, cards, net banking)",
  stripe: "Card (Stripe)",
  test: "Test payment",
  giftcard: "Gift card",
};

/** Builds the invoice (assigning the number if needed). Returns null if the order isn't ready for an invoice. */
export async function getInvoice(orderNumber: string): Promise<InvoiceData | null> {
  const invNo = await ensureInvoiceNumber(orderNumber);
  if (!invNo) return null;
  const [o, s] = await Promise.all([Order.findOne({ number: orderNumber }).lean<OrderDoc>(), getSettings()]);
  if (!o) return null;
  const region: Region = o.region === "uk" ? "uk" : "in";
  const products = await Product.find({ slug: { $in: o.items.map((i) => i.slug) } }, { slug: 1, category: 1, fabric: 1 }).lean<Pick<ProductDoc, "slug" | "category" | "fabric">[]>();
  const meta = new Map(products.map((p) => [p.slug, p]));

  const a = o.address ?? {};
  const buyerState = a.state ?? "";
  const buyerStateCode = region === "in" ? GST_STATE_CODES[buyerState] ?? "" : "";
  const intraState = region === "in" && !!buyerStateCode && buyerStateCode === s.stateCode;

  // Order-level discounts are spread across the item lines in proportion to their value.
  const itemsGross = o.items.map((i) => (i.unitPrice + (i.optionsPrice ?? 0)) * i.qty);
  const itemsTotal = itemsGross.reduce((n, x) => n + x, 0);
  const deductions = (o.discount ?? 0) + (o.prepaidDiscount ?? 0) + (o.loyalty?.discount ?? 0);

  const lines: InvoiceLine[] = o.items.map((i, idx) => {
    const p = meta.get(i.slug);
    const share = itemsTotal > 0 ? (itemsGross[idx] / itemsTotal) * deductions : 0;
    const gross = r2(itemsGross[idx] - share);
    let rate: number = UK_VAT_RATE;
    if (region === "in") {
      const perUnitTaxableAtLow = gross / i.qty / (1 + GST_RULES.lowRate / 100);
      rate = perUnitTaxableAtLow <= GST_RULES.thresholdPerUnit ? GST_RULES.lowRate : GST_RULES.highRate;
    }
    const taxable = r2((gross * 100) / (100 + rate));
    const opts = [i.size ? `Size ${i.size}` : "", i.options?.blouse === "stitched" ? "Stitched blouse" : "", i.options?.fallPico ? "Fall & pico" : ""].filter(Boolean).join(" · ");
    return { description: i.name, detail: opts, hsn: region === "in" ? hsnFor(p ?? {}) : "", qty: i.qty, gross, taxable, rate, tax: r2(gross - taxable) };
  });

  const chargeRate = region === "in" ? Math.max(GST_RULES.lowRate, ...lines.map((l) => l.rate)) : UK_VAT_RATE;
  const charge = (description: string, amount: number, hsn: string) => {
    if (!(amount > 0)) return;
    const taxable = r2((amount * 100) / (100 + chargeRate));
    lines.push({ description, detail: "", hsn: region === "in" ? hsn : "", qty: 1, gross: r2(amount), taxable, rate: chargeRate, tax: r2(amount - taxable) });
  };
  charge("Delivery", o.shipping ?? 0, "9968");
  charge("Gift wrap", o.gift?.fee ?? 0, "9985");
  charge("Cash on delivery handling", o.codFee ?? 0, "9968");

  const gross = r2(lines.reduce((n, l) => n + l.gross, 0));
  const taxable = r2(lines.reduce((n, l) => n + l.taxable, 0));
  const tax = r2(gross - taxable);
  const half = r2(tax / 2);
  const totals = {
    gross,
    taxable,
    tax,
    cgst: region === "in" && intraState ? half : 0,
    sgst: region === "in" && intraState ? r2(tax - half) : 0,
    igst: region === "in" && !intraState ? tax : 0,
    vat: region === "uk" ? tax : 0,
  };

  const money: { label: string; amount: number }[] = [{ label: "Items (before discounts)", amount: o.subtotal }];
  if (o.discount) money.push({ label: `Coupon${o.coupon ? ` ${o.coupon}` : ""}`, amount: -o.discount });
  if (o.prepaidDiscount) money.push({ label: "Online payment discount", amount: -o.prepaidDiscount });
  if (o.loyalty?.discount) money.push({ label: `Points used (${o.loyalty.redeemedPoints ?? 0})`, amount: -o.loyalty.discount });
  if (o.shipping) money.push({ label: "Delivery", amount: o.shipping });
  if (o.gift?.fee) money.push({ label: "Gift wrap", amount: o.gift.fee });
  if (o.codFee) money.push({ label: "Cash on delivery fee", amount: o.codFee });
  money.push({ label: "Invoice total", amount: gross });
  if (o.giftCard?.amount) money.push({ label: `Paid by gift card ${o.giftCard.code ?? ""}`.trim(), amount: -o.giftCard.amount });
  if (o.partialCod?.paidOnline) money.push({ label: "Advance paid online", amount: -o.partialCod.paidOnline });

  const confirmedAt = o.history?.find((h) => h.status === "confirmed")?.at;
  return {
    number: invNo,
    date: new Date(confirmedAt ?? o.createdAt ?? Date.now()),
    orderNumber: o.number,
    orderDate: new Date(o.createdAt ?? Date.now()),
    region,
    seller: {
      name: s.legalName,
      address: region === "in" ? s.address : `${s.address}`,
      taxId: region === "in" ? s.gstin : s.ukVatNumber,
      taxLabel: region === "in" ? "GSTIN" : "VAT number",
      stateCode: s.stateCode,
      email: s.supportEmail,
    },
    buyer: {
      name: a.name ?? "",
      email: o.email,
      phone: a.phone ?? "",
      address: [a.line1, a.line2, [a.city, a.state].filter(Boolean).join(", "), a.postcode, region === "in" ? "India" : "United Kingdom"].filter(Boolean) as string[],
      state: buyerState,
      stateCode: buyerStateCode,
    },
    placeOfSupply: region === "in" ? `${buyerState || "—"}${buyerStateCode ? ` (${buyerStateCode})` : ""}` : "United Kingdom",
    intraState,
    lines,
    totals,
    money,
    payment: { method: METHOD[o.payment?.method ?? ""] ?? o.payment?.method ?? "", status: o.payment?.status ?? "pending", dueOnDelivery: o.payment?.status === "paid" ? 0 : o.partialCod?.dueOnDelivery || (o.payment?.method === "cod" ? o.total : 0) },
  };
}
