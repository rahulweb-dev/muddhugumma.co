// Region rules shared by server and client: currency, delivery, sizes, payment options.
export type Region = "in" | "uk";
export const REGIONS: Region[] = ["in", "uk"];
export const REGION_COOKIE = "mg_region";

export const isRegion = (v: unknown): v is Region => v === "in" || v === "uk";

type RegionConfig = {
  code: Region;
  label: string;
  country: string;
  pill: string;
  currency: "INR" | "GBP";
  locale: string;
  freeShippingAt: number;
  shippingFee: number;
  codFee: number;
  eta: [number, number];
  sizes: string[];
  returnsDays: number;
  taxNote: string;
  postLabel: string;
  postHint: string;
  postPattern: RegExp;
  blouseStitching: number;
  fallPico: number;
  announcements: string[];
  ticker: string[];
  priceBands: { label: string; min: number; max: number }[];
  budgetTiles: { kicker: string; label: string; note: string; max: number }[];
  trust: { title: string; note: string }[];
  payments: string[];
  footerNote: string;
  states?: string[];
};

export const REGION_CONFIG: Record<Region, RegionConfig> = {
  in: {
    code: "in",
    label: "India",
    country: "India",
    pill: "IN ₹",
    currency: "INR",
    locale: "en-IN",
    freeShippingAt: 1999,
    shippingFee: 99,
    codFee: 49,
    eta: [4, 6],
    sizes: ["XS", "S", "M", "L", "XL", "XXL"],
    returnsDays: 7,
    taxNote: "Inclusive of all taxes",
    postLabel: "Pincode",
    postHint: "6-digit pincode",
    postPattern: /^[1-9][0-9]{5}$/,
    blouseStitching: 899,
    fallPico: 249,
    announcements: [
      "Free shipping across India above ₹1,999",
      "Cash on delivery available on all orders",
      "Festive Edit: Diwali delivery cut-off 25 October",
    ],
    ticker: ["Handpicked from 5 weaving clusters", "Free shipping above ₹1,999", "7-day easy returns", "Cash on delivery", "Video styling calls"],
    priceBands: [
      { label: "Under ₹2,000", min: 0, max: 2000 },
      { label: "₹2,000 – ₹5,000", min: 2000, max: 5000 },
      { label: "₹5,000 – ₹15,000", min: 5000, max: 15000 },
      { label: "Above ₹15,000", min: 15000, max: 1e9 },
    ],
    budgetTiles: [
      { kicker: "Under", label: "₹2,000", note: "Everyday kurtas", max: 2000 },
      { kicker: "Under", label: "₹3,000", note: "Cotton sarees", max: 3000 },
      { kicker: "Under", label: "₹8,000", note: "Festive silks", max: 8000 },
      { kicker: "Luxe", label: "₹15,000+", note: "Bridal & heirloom", max: 0 },
    ],
    trust: [
      { title: "Free delivery", note: "Pan-India above ₹1,999" },
      { title: "Cash on delivery", note: "Pay when it arrives" },
      { title: "7-day returns", note: "Free pickup from home" },
      { title: "Weaver direct", note: "Fair prices, real craft" },
    ],
    payments: ["UPI", "RuPay", "Visa", "Mastercard", "Net banking", "Cash on delivery"],
    footerNote: "Handpicked in India, shipped from Hyderabad to every pin code.",
    states: [
      "Andhra Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
      "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Odisha", "Puducherry", "Punjab",
      "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "Uttarakhand", "West Bengal",
    ],
  },
  uk: {
    code: "uk",
    label: "United Kingdom",
    country: "United Kingdom",
    pill: "UK £",
    currency: "GBP",
    locale: "en-GB",
    freeShippingAt: 75,
    shippingFee: 4.95,
    codFee: 0,
    eta: [5, 7],
    sizes: ["UK 6", "UK 8", "UK 10", "UK 12", "UK 14", "UK 16"],
    returnsDays: 14,
    taxNote: "Duties and VAT included",
    postLabel: "Postcode",
    postHint: "e.g. LE1 6RL",
    postPattern: /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/,
    blouseStitching: 12,
    fallPico: 4,
    announcements: [
      "Free UK delivery on orders over £75",
      "Duties and taxes included: no charges at the door",
      "Festive Edit: UK Diwali delivery cut-off 20 October",
    ],
    ticker: ["Handpicked from 5 weaving clusters", "Free UK delivery over £75", "Duties included", "14-day returns", "Video styling calls"],
    priceBands: [
      { label: "Under £25", min: 0, max: 25 },
      { label: "£25 – £60", min: 25, max: 60 },
      { label: "£60 – £170", min: 60, max: 170 },
      { label: "Above £170", min: 170, max: 1e9 },
    ],
    budgetTiles: [
      { kicker: "Under", label: "£25", note: "Everyday kurtas", max: 25 },
      { kicker: "Under", label: "£35", note: "Cotton sarees", max: 35 },
      { kicker: "Under", label: "£90", note: "Festive silks", max: 90 },
      { kicker: "Luxe", label: "£170+", note: "Bridal & heirloom", max: 0 },
    ],
    trust: [
      { title: "Free UK delivery", note: "On orders over £75" },
      { title: "Duties included", note: "No customs fees on arrival" },
      { title: "14-day returns", note: "Prepaid UK returns label" },
      { title: "Pay in 3", note: "Interest-free instalments" },
    ],
    payments: ["Visa", "Mastercard", "Amex", "Apple Pay", "Google Pay", "Pay in 3"],
    footerNote: "Handpicked in India, delivered to the UK in 5–7 working days.",
  },
};

export function formatMoney(value: number, region: Region): string {
  const c = REGION_CONFIG[region];
  return new Intl.NumberFormat(c.locale, {
    style: "currency",
    currency: c.currency,
    maximumFractionDigits: region === "in" ? 0 : Number.isInteger(value) ? 0 : 2,
    minimumFractionDigits: region === "in" ? 0 : Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

/** Size options for a product in a region. Sarees and dupattas are free size. */
export function sizesFor(freeSize: boolean, region: Region): string[] {
  return freeSize ? ["Free size"] : REGION_CONFIG[region].sizes;
}

/** UK sizes are stored under their India equivalents (each region keeps its own counts; see lib/stock.ts). */
const UK_TO_IN: Record<string, string> = { "UK 6": "XS", "UK 8": "S", "UK 10": "M", "UK 12": "L", "UK 14": "XL", "UK 16": "XXL" };
export const canonicalSize = (size: string) => UK_TO_IN[size] ?? size;

/** Size chart rows: India size, UK size, bust and waist in inches. */
export const SIZE_CHART = [
  { in: "XS", uk: "UK 6", bust: 32, waist: 26, hip: 35 },
  { in: "S", uk: "UK 8", bust: 34, waist: 28, hip: 37 },
  { in: "M", uk: "UK 10", bust: 36, waist: 30, hip: 39 },
  { in: "L", uk: "UK 12", bust: 38, waist: 32, hip: 41 },
  { in: "XL", uk: "UK 14", bust: 40, waist: 34, hip: 43 },
  { in: "XXL", uk: "UK 16", bust: 42, waist: 36, hip: 45 },
];

/** Estimated delivery window, skipping Sundays. */
export function deliveryWindow(region: Region, from = new Date()): [Date, Date] {
  const add = (n: number) => {
    const d = new Date(from);
    let left = n;
    while (left > 0) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0) left--;
    }
    return d;
  };
  const [a, b] = REGION_CONFIG[region].eta;
  return [add(a), add(b)];
}

export const shortDate = (d: Date, region: Region) =>
  d.toLocaleDateString(REGION_CONFIG[region].locale, { weekday: "short", day: "numeric", month: "short" });
