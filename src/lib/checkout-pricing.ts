// Pure pricing helpers shared by the bag/checkout UI and the checkout server actions.
// The browser uses them only for display; placeOrder re-prices everything from MongoDB
// and runs the SAME computeTotals() below, so the summary matches what the server charges.
import { REGION_CONFIG, type Region } from "./region";
import type { CartLine, Money } from "./types";

export type LineOptions = CartLine["options"];
/** "partcod" = pay settings.partialCodAdvance online now, the rest in cash on delivery (India only). */
export type PaymentMethod = "cod" | "razorpay" | "stripe" | "partcod";

export const COUPON_KEY = "mg_coupon_v1";
export const LAST_ORDER_COOKIE = "mg_last_order";
export const GIFT_MESSAGE_MAX = 200;

/** INR is charged in whole rupees, GBP to the penny. */
export const roundMoney = (n: number, region: Region) => (region === "in" ? Math.round(n) : Math.round(n * 100) / 100);

/** Per-unit price of saree add-ons (stitched blouse, fall & pico) in a region. */
export function optionsPrice(options: LineOptions | undefined, region: Region): number {
  if (!options) return 0;
  const r = REGION_CONFIG[region];
  return (options.blouse === "stitched" ? r.blouseStitching : 0) + (options.fallPico ? r.fallPico : 0);
}

/** Shipping is charged on the item subtotal before any coupon. */
export function shippingFor(subtotal: number, region: Region): number {
  const r = REGION_CONFIG[region];
  return subtotal <= 0 || subtotal >= r.freeShippingAt ? 0 : r.shippingFee;
}

export function couponAmount(c: { type: string; value: number }, subtotal: number, region: Region): number {
  const raw = c.type === "flat" ? c.value : (subtotal * c.value) / 100;
  return roundMoney(Math.max(0, Math.min(raw, subtotal)), region);
}

export const methodsFor = (region: Region): PaymentMethod[] => (region === "in" ? ["razorpay", "cod", "partcod"] : ["stripe"]);
export const isCodMethod = (m?: PaymentMethod) => m === "cod" || m === "partcod";

/** The public slice of store settings that the checkout needs (passed from the server page to the client). */
export type CheckoutSettings = {
  giftWrapFee: Record<Region, number>;
  prepaidDiscountPct: number;
  partialCodAdvance: number;
  codOtpRequired: boolean;
  loyalty: { pointsPerUnit: Record<Region, number>; pointValue: Record<Region, number>; maxRedeemPct: number };
};

export const DEFAULT_CHECKOUT_SETTINGS: CheckoutSettings = {
  giftWrapFee: { in: 99, uk: 3 },
  prepaidDiscountPct: 5,
  partialCodAdvance: 200,
  codOtpRequired: true,
  loyalty: { pointsPerUnit: { in: 1, uk: 1 }, pointValue: { in: 1, uk: 0.01 }, maxRedeemPct: 20 },
};

export type Totals = {
  mrpTotal: number;
  mrpDiscount: number;
  /** Items incl. add-ons at the selling (sale) price. */
  subtotal: number;
  coupon: number;
  /** Online-payment discount (India only). */
  prepaid: number;
  /** What the prepaid discount would be if the shopper paid online (for "Save ₹X by paying online"). */
  prepaidIfOnline: number;
  loyaltyPoints: number;
  loyalty: number;
  giftWrap: number;
  shipping: number;
  codFee: number;
  /** Order value before the gift card is applied. */
  gross: number;
  giftCard: number;
  /** Amount the customer pays (online, or in cash on delivery) after the gift card. Stored as order.total. */
  total: number;
  /** Charged online now: total for online payment, the advance for part-COD, 0 for COD and gift-card orders. */
  payNow: number;
  /** Collected in cash at the door (COD and part-COD). */
  dueOnDelivery: number;
  /** The gift card covers the whole order: no other payment needed. */
  coveredByGiftCard: boolean;
  /** Part-COD is only offered when the order total is larger than the advance. */
  partCodAvailable: boolean;
  /** Item value the customer actually pays for (after coupon, prepaid and points) — the basis for earning points. */
  itemsPaid: number;
  savings: number;
  count: number;
};

export type TotalsOptions = {
  couponDiscount?: number;
  method?: PaymentMethod;
  giftWrap?: boolean;
  /** Max points the shopper wants to use (normally their whole balance); capped by the rules. */
  redeemPoints?: number;
  giftCardBalance?: number;
  settings?: CheckoutSettings;
};

type PricedLine = { qty: number; price: Record<Region, Money>; options?: LineOptions; optionsPrice?: number };

/**
 * One rule for the money at checkout, in this order:
 *  1. subtotal = Σ qty × (selling price incl. any timed sale + saree add-ons); shipping is decided on this subtotal.
 *  2. coupon off the subtotal.
 *  3. prepaid discount: settings.prepaidDiscountPct of (subtotal − coupon), India online payments only
 *     (paying with a gift card counts as prepaid). The UK has no cash on delivery, so it doesn't apply there.
 *  4. loyalty points: up to settings.loyalty.maxRedeemPct of the subtotal, never more than what is left, and never more than the balance.
 *  5. + delivery + gift wrap + COD fee (full COD only; part-COD has no COD fee because part is prepaid).
 *  6. gift card last, up to its balance. If it covers everything, the order is paid by gift card.
 */
export function computeTotals(lines: PricedLine[], region: Region, o: TotalsOptions = {}): Totals {
  const s = o.settings ?? DEFAULT_CHECKOUT_SETTINGS;
  const r = REGION_CONFIG[region];
  let mrpTotal = 0;
  let subtotal = 0;
  let count = 0;
  for (const l of lines) {
    const m = l.price[region];
    const opt = l.optionsPrice ?? optionsPrice(l.options, region);
    mrpTotal += l.qty * (Math.max(m.mrp || 0, m.now) + opt);
    subtotal += l.qty * (m.now + opt);
    count += l.qty;
  }
  mrpTotal = roundMoney(mrpTotal, region);
  subtotal = roundMoney(subtotal, region);
  const coupon = Math.min(Math.max(0, o.couponDiscount ?? 0), subtotal);
  const afterCoupon = roundMoney(subtotal - coupon, region);
  const shipping = shippingFor(subtotal, region);
  const giftWrap = o.giftWrap && subtotal > 0 ? s.giftWrapFee[region] ?? 0 : 0;
  const gcBalance = Math.max(0, o.giftCardBalance ?? 0);
  const pointValue = s.loyalty.pointValue[region] || 0;

  const scenario = (kind: "online" | "cod" | "partcod") => {
    const prepaid = kind === "online" && region === "in" ? roundMoney((afterCoupon * Math.max(0, s.prepaidDiscountPct)) / 100, region) : 0;
    const cap = Math.max(0, Math.min((subtotal * s.loyalty.maxRedeemPct) / 100, afterCoupon - prepaid));
    const loyaltyPoints = pointValue > 0 ? Math.max(0, Math.min(Math.floor(o.redeemPoints ?? 0), Math.floor(cap / pointValue + 1e-9))) : 0;
    const loyalty = Math.min(roundMoney(loyaltyPoints * pointValue, region), cap);
    const codFee = kind === "cod" ? r.codFee : 0;
    const gross = roundMoney(afterCoupon - prepaid - loyalty + shipping + giftWrap + codFee, region);
    const giftCard = roundMoney(Math.min(gcBalance, gross), region);
    const total = roundMoney(gross - giftCard, region);
    return { prepaid, loyaltyPoints, loyalty, codFee, gross, giftCard, total, itemsPaid: roundMoney(afterCoupon - prepaid - loyalty, region) };
  };

  const online = scenario("online");
  const coveredByGiftCard = gcBalance > 0 && online.total <= 0 && subtotal > 0;
  const method = o.method;
  const kind = coveredByGiftCard || !isCodMethod(method) ? "online" : method === "partcod" ? "partcod" : "cod";
  const x = kind === "online" ? online : scenario(kind);
  const advance = Math.max(0, s.partialCodAdvance);
  const partCodAvailable = region === "in" && advance > 0 && scenario("partcod").total > advance;

  let payNow = x.total;
  let dueOnDelivery = 0;
  if (!coveredByGiftCard && kind === "cod") {
    payNow = 0;
    dueOnDelivery = x.total;
  } else if (!coveredByGiftCard && kind === "partcod") {
    payNow = partCodAvailable ? Math.min(advance, x.total) : x.total;
    dueOnDelivery = roundMoney(x.total - payNow, region);
  }
  if (coveredByGiftCard) payNow = 0;

  const mrpDiscount = roundMoney(mrpTotal - subtotal, region);
  return {
    mrpTotal,
    mrpDiscount,
    subtotal,
    coupon,
    prepaid: x.prepaid,
    prepaidIfOnline: online.prepaid,
    loyaltyPoints: x.loyaltyPoints,
    loyalty: x.loyalty,
    giftWrap,
    shipping,
    codFee: x.codFee,
    gross: x.gross,
    giftCard: x.giftCard,
    total: x.total,
    payNow,
    dueOnDelivery,
    coveredByGiftCard,
    partCodAvailable,
    itemsPaid: x.itemsPaid,
    savings: roundMoney(mrpDiscount + coupon + x.prepaid + x.loyalty, region),
    count,
  };
}

/** Display totals for the bag. `couponDiscount` comes from the server's validateCoupon. */
export function bagTotals(lines: PricedLine[], region: Region, couponDiscount = 0, method?: PaymentMethod): Totals {
  return computeTotals(lines, region, { couponDiscount, method });
}

/** Informational instalment note (no-cost EMI in India above ₹3,000; Pay in 3 in the UK). */
export function emiNote(total: number, region: Region): string | null {
  if (total <= 0) return null;
  if (region === "in") {
    if (total < 3000) return null;
    const monthly = Math.ceil(total / 6);
    return `No-cost EMI available on orders above ₹3,000 (from ₹${monthly.toLocaleString("en-IN")}/month)`;
  }
  const part = Math.ceil((total / 3) * 100) / 100;
  return `Or 3 interest-free payments of £${part.toFixed(2)}`;
}

export const optionLabels = (o: LineOptions | undefined) => {
  if (!o) return [] as string[];
  const out = [o.blouse === "stitched" ? "Blouse: stitched" : "Blouse: unstitched piece"];
  if (o.fallPico) out.push("Fall & pico");
  return out;
};

/** Picks the checkout slice out of the full store settings (server → client). */
export function toCheckoutSettings(s: {
  giftWrapFee?: Partial<Record<Region, number>>;
  prepaidDiscountPct?: number;
  partialCodAdvance?: number;
  codOtpRequired?: boolean;
  loyalty?: { pointsPerUnit?: Partial<Record<Region, number>>; pointValue?: Partial<Record<Region, number>>; maxRedeemPct?: number };
}): CheckoutSettings {
  const d = DEFAULT_CHECKOUT_SETTINGS;
  return {
    giftWrapFee: { in: s.giftWrapFee?.in ?? d.giftWrapFee.in, uk: s.giftWrapFee?.uk ?? d.giftWrapFee.uk },
    prepaidDiscountPct: s.prepaidDiscountPct ?? d.prepaidDiscountPct,
    partialCodAdvance: s.partialCodAdvance ?? d.partialCodAdvance,
    codOtpRequired: s.codOtpRequired ?? d.codOtpRequired,
    loyalty: {
      pointsPerUnit: { in: s.loyalty?.pointsPerUnit?.in ?? d.loyalty.pointsPerUnit.in, uk: s.loyalty?.pointsPerUnit?.uk ?? d.loyalty.pointsPerUnit.uk },
      pointValue: { in: s.loyalty?.pointValue?.in ?? d.loyalty.pointValue.in, uk: s.loyalty?.pointValue?.uk ?? d.loyalty.pointValue.uk },
      maxRedeemPct: s.loyalty?.maxRedeemPct ?? d.loyalty.maxRedeemPct,
    },
  };
}
