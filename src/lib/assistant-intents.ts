// Free, rule-based understanding for the shopping assistant (no AI service). Pure functions: safe on client and server.

export type Intent =
  | "greet"
  | "track"
  | "delivery"
  | "returns"
  | "size"
  | "payment"
  | "offers"
  | "bridal"
  | "care"
  | "human"
  | "thanks"
  | "shop"
  | "unknown";

// Order of this list = priority when several match ("return my order" is about returns, not tracking).
const RULES: [Intent, RegExp][] = [
  ["human", /\b(human|person|agent|someone|staff|talk to|speak to|call (me|you)|whats ?app|phone number|contact (you|us)|customer (care|service)|complain)/],
  ["returns", /\b(return|exchange|refund|replace|replacement|send (it )?back|wrong (size|item|colour|color)|damaged|defective)/],
  ["track", /\b(track|tracking|where('?s| is) my|order status|status of my|my order|parcel|package|shipment|awb|dispatch(ed)?|shipped|not (yet )?(arrived|received|delivered)|when will (it|my)|delivery status)/],
  ["size", /\b(size|sizing|fit|fits|measure|measurement|bust|waist|hip|blouse stitch|stitching|tailor|xs|xxl|petite|plus size)\b/],
  // Customs and duties are delivery questions even when they say "pay".
  ["delivery", /\b(customs|duties|duty|import tax)\b/],
  ["payment", /\b(pay|payment|upi|card|cards|net ?banking|emi|instal?ments?|klarna|pay ?later|cod|cash on delivery|gift ?card|apple pay|google pay|razorpay|stripe)\b/],
  ["offers", /\b(offer|offers|coupon|discount|promo|code|sale|deal|cashback|cheaper)/],
  ["delivery", /\b(deliver|delivery|shipping|ship to|courier|how long|days to|duties|customs|import tax|vat|uk delivery|international|free shipping)/],
  ["bridal", /\b(bridal|bride|wedding|trousseau|consult|appointment|video call|stylist|custom|made to (order|measure))/],
  ["care", /\b(wash|washing|dry ?clean|iron|care|store|storage|stain|fade|colour bleed|color bleed)/],
  ["thanks", /^(thanks|thank you|thx|ty|ok(ay)? thanks|great|perfect|bye|goodbye)\b/],
  ["greet", /^(hi|hello|hey|namaste|hii+|good (morning|afternoon|evening)|help)\b/],
];

const PRODUCT_WORDS =
  /\b(saree|sari|sarees|kurta|kurti|kurtas|lehenga|lehnga|lehanga|anarkali|suit|dupatta|silk|cotton|linen|georgette|velvet|banarasi|kanchi|kanjeevaram|kanjivaram|chikankari|chikan|block ?print|bandhani|ikat|organza|tissue|red|maroon|pink|green|blue|ivory|white|black|yellow|orange|purple|gold|festive|diwali|office|party|under|below|₹|£|\d{3,})\b/;

export const ORDER_NUMBER = /\b(MG[A-Z0-9-]{6,24})\b/i;

export type Understood = { intent: Intent; orderNumber?: string; looksLikeProduct: boolean; measurements?: { bust?: number; waist?: number; hip?: number; unit: "in" | "cm" } };

/** Pulls bust / waist / hip numbers out of text like "bust 36 waist 30" or "my bust is 91 cm". */
export function parseMeasurements(text: string): Understood["measurements"] {
  const t = text.toLowerCase();
  const unit: "in" | "cm" = /\bcm\b|centimet/.test(t) ? "cm" : "in";
  const pick = (k: string) => {
    const m = t.match(new RegExp(`(?:${k})\\D{0,12}(\\d{2,3}(?:\\.\\d)?)`));
    return m ? Number(m[1]) : undefined;
  };
  let bust = pick("bust|chest");
  const waist = pick("waist");
  const hip = pick("hips?");
  // A lone number after we asked for the bust ("36" or "91 cm") counts as the bust.
  if (bust === undefined && waist === undefined && hip === undefined) {
    const lone = t.match(/^\s*(\d{2,3}(?:\.\d)?)\s*(in|inch|inches|"|cm)?\s*$/);
    if (lone) bust = Number(lone[1]);
  }
  if (bust === undefined && waist === undefined && hip === undefined) return undefined;
  return { bust, waist, hip, unit };
}

export function understand(raw: string): Understood {
  const text = raw.toLowerCase().replace(/\s+/g, " ").trim();
  const orderNumber = raw.match(ORDER_NUMBER)?.[1]?.toUpperCase();
  const looksLikeProduct = PRODUCT_WORDS.test(text);
  if (orderNumber && !/\b(return|exchange|refund)/.test(text)) return { intent: "track", orderNumber, looksLikeProduct };
  for (const [intent, rx] of RULES) {
    if (rx.test(text)) {
      // "silk saree under 5000 for wedding" is a shopping request, not a bridal consult.
      if ((intent === "bridal" || intent === "offers") && looksLikeProduct && /\b(saree|sari|kurta|kurti|lehenga|lehnga|anarkali|suit|under|below)\b/.test(text)) {
        return { intent: "shop", looksLikeProduct, orderNumber };
      }
      // "size of the green saree" is still a size question; "red saree size M" too.
      return { intent, orderNumber, looksLikeProduct, measurements: intent === "size" ? parseMeasurements(text) : undefined };
    }
  }
  if (parseMeasurements(text)) return { intent: "size", looksLikeProduct, measurements: parseMeasurements(text) };
  if (looksLikeProduct) return { intent: "shop", looksLikeProduct };
  return { intent: "unknown", looksLikeProduct };
}
