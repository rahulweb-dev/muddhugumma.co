/*
 * Analytics events (GA4 + Meta Pixel). Owner: platform.
 *
 * Nothing is sent, and no third-party script loads, until BOTH are true:
 *   - the shopper has allowed the category in the cookie banner (cookie `mg_consent`): GA4 needs "analytics",
 *     Meta Pixel needs "marketing";
 *   - the id is configured: NEXT_PUBLIC_GA_ID (G-XXXXXXX) / NEXT_PUBLIC_META_PIXEL_ID.
 *
 * Usage from any client component:
 *   import { track, itemFromProduct } from "@/lib/analytics";
 *   track("add_to_cart", { currency: "INR", value: 4999, items: [itemFromProduct(product, region, { size: "M" })] });
 *   track("purchase", { transaction_id: "MG2610…", currency, value, shipping, tax, coupon, items });
 *   track("search", { search_term: q });
 *   track("sign_up", { method: "email" });
 *
 * This module has no "use client" directive on purpose: the consent helpers (parseConsent, CONSENT_COOKIE)
 * are also used on the server (root layout). track() simply does nothing outside the browser.
 */
import type { Region } from "./region";

export type AnalyticsEvent =
  | "view_item"
  | "view_item_list"
  | "add_to_cart"
  | "add_to_wishlist"
  | "begin_checkout"
  | "purchase"
  | "search"
  | "sign_up"
  | "generate_lead";

/** GA4 ecommerce item. Only item_id and item_name are required. */
export type AnalyticsItem = {
  item_id: string;
  item_name: string;
  item_brand?: string;
  item_category?: string;
  item_variant?: string;
  price?: number;
  quantity?: number;
  discount?: number;
};

export type AnalyticsData = {
  currency?: "INR" | "GBP";
  value?: number;
  items?: AnalyticsItem[];
  transaction_id?: string;
  shipping?: number;
  tax?: number;
  coupon?: string;
  search_term?: string;
  method?: string;
  item_list_name?: string;
  [key: string]: unknown;
};

/* ---------- consent ---------- */

export const CONSENT_COOKIE = "mg_consent";
/** Six months, as recommended by the ICO for consent records. */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 182;
const CONSENT_VERSION = "v1";

export type Consent = { analytics: boolean; marketing: boolean };

/** Cookie value looks like "v1.a1.m0". Anything else (missing, old version, tampered) means "not decided yet". */
export function parseConsent(value: string | undefined | null): Consent | null {
  const m = /^v1\.a([01])\.m([01])$/.exec(value ?? "");
  return m ? { analytics: m[1] === "1", marketing: m[2] === "1" } : null;
}

export const serializeConsent = (c: Consent) => `${CONSENT_VERSION}.a${c.analytics ? 1 : 0}.m${c.marketing ? 1 : 0}`;

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "";
export const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "";

type Win = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  fbq?: ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
  _fbq?: unknown;
  __mgConsent?: Consent | null;
  __mgGaReady?: boolean;
  __mgPixelReady?: boolean;
};

const win = (): Win | null => (typeof window === "undefined" ? null : (window as Win));

/** The consent the shopper gave in this browser (kept in memory by the banner, falling back to the cookie). */
export function currentConsent(): Consent | null {
  const w = win();
  if (!w) return null;
  if (w.__mgConsent !== undefined) return w.__mgConsent;
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${CONSENT_COOKIE}=`))?.split("=")[1];
  return parseConsent(raw ? decodeURIComponent(raw) : null);
}

/** Saves the choice for six months and makes it visible to track() straight away. */
export function saveConsent(c: Consent): void {
  const w = win();
  if (!w) return;
  w.__mgConsent = c;
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${serializeConsent(c)}; path=/; max-age=${CONSENT_MAX_AGE}; samesite=lax${secure}`;
}

const gaOn = () => !!GA_ID && !!currentConsent()?.analytics;
const pixelOn = () => !!PIXEL_ID && !!currentConsent()?.marketing;

/* ---------- script bootstrapping (the <Script src> tags live in src/components/analytics) ---------- */

/** Creates the gtag() queue and configures GA4. Safe to call more than once. */
export function ensureGtag(): boolean {
  const w = win();
  if (!w || !gaOn()) return false;
  if (!w.__mgGaReady) {
    w.dataLayer = w.dataLayer || [];
    // gtag.js only accepts the `arguments` object, not a plain array.
    w.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments);
    };
    w.gtag("js", new Date());
    // Page views are sent by hand on every client navigation (see AnalyticsScripts).
    w.gtag("config", GA_ID, { send_page_view: false, anonymize_ip: true });
    w.__mgGaReady = true;
  }
  return true;
}

/** Creates the fbq() queue (Meta's standard stub) and initialises the pixel. Safe to call more than once. */
export function ensureFbq(): boolean {
  const w = win();
  if (!w || !pixelOn()) return false;
  if (!w.__mgPixelReady) {
    if (!w.fbq) {
      const n = function fbq(...args: unknown[]) {
        if (n.callMethod) n.callMethod(...args);
        else n.queue!.push(args);
      } as NonNullable<Win["fbq"]>;
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];
      w.fbq = n;
      w._fbq = n;
    }
    w.fbq("init", PIXEL_ID);
    w.__mgPixelReady = true;
  }
  return true;
}

/* ---------- events ---------- */

/** GA4 event name → Meta Pixel standard event. */
export const META_EVENT: Record<AnalyticsEvent, string> = {
  view_item: "ViewContent",
  view_item_list: "ViewCategory", // not a Meta standard event, sent with trackCustom
  add_to_cart: "AddToCart",
  add_to_wishlist: "AddToWishlist",
  begin_checkout: "InitiateCheckout",
  purchase: "Purchase",
  search: "Search",
  sign_up: "CompleteRegistration",
  generate_lead: "Schedule",
};

const META_CUSTOM = new Set<AnalyticsEvent>(["view_item_list"]);

/** Turns GA4-shaped data into Meta Pixel parameters. */
export function metaParams(event: AnalyticsEvent, d: AnalyticsData): Record<string, unknown> {
  const items = d.items ?? [];
  const p: Record<string, unknown> = {};
  if (d.currency) p.currency = d.currency;
  if (typeof d.value === "number") p.value = d.value;
  if (items.length) {
    p.content_ids = items.map((i) => i.item_id);
    p.contents = items.map((i) => ({ id: i.item_id, quantity: i.quantity ?? 1, item_price: i.price }));
    p.content_type = "product";
    p.num_items = items.reduce((n, i) => n + (i.quantity ?? 1), 0);
    if (items.length === 1) p.content_name = items[0].item_name;
    if (items[0].item_category) p.content_category = items[0].item_category;
  }
  if (event === "search" && d.search_term) p.search_string = d.search_term;
  if (event === "sign_up") p.status = true;
  if (event === "view_item_list" && d.item_list_name) p.content_category = d.item_list_name;
  return p;
}

/** Send an ecommerce event to GA4 and Meta Pixel. A no-op without consent or ids, on the server, or if anything throws. */
export function track(event: AnalyticsEvent, data: AnalyticsData = {}): void {
  try {
    if (ensureGtag()) win()!.gtag!("event", event, data);
    if (ensureFbq()) {
      const name = META_EVENT[event];
      const params = metaParams(event, data);
      // Purchase uses the order number as eventID so a later server-side Conversions API call can deduplicate.
      const opts = event === "purchase" && data.transaction_id ? { eventID: String(data.transaction_id) } : undefined;
      if (META_CUSTOM.has(event)) win()!.fbq!("trackCustom", name, params);
      else if (opts) win()!.fbq!("track", name, params, opts);
      else win()!.fbq!("track", name, params);
    }
  } catch (e) {
    if (process.env.NODE_ENV !== "production") console.warn("[analytics]", e);
  }
}

/** Page view on first load and every client-side navigation. Called by AnalyticsScripts; `to` limits which tools receive it. */
export function trackPageView(url: string, to: { ga?: boolean; pixel?: boolean } = { ga: true, pixel: true }): void {
  try {
    const w = win();
    if (!w) return;
    if (to.ga && ensureGtag()) w.gtag!("event", "page_view", { page_location: location.origin + url, page_path: url, page_title: document.title });
    if (to.pixel && ensureFbq()) w.fbq!("track", "PageView");
  } catch {
    /* never break the page for analytics */
  }
}

/** Builds a GA4 item from a product card / PDP product. */
export function itemFromProduct(
  p: { slug: string; name: string; category?: string; price: Record<Region, { now: number; mrp: number }> },
  region: Region,
  opts: { size?: string; quantity?: number; price?: number } = {}
): AnalyticsItem {
  const money = p.price[region];
  const price = opts.price ?? money.now;
  return {
    item_id: p.slug,
    item_name: p.name,
    item_brand: "House of Muddhugumma",
    item_category: p.category,
    item_variant: opts.size,
    price,
    quantity: opts.quantity ?? 1,
    discount: money.mrp > price ? Math.round((money.mrp - price) * 100) / 100 : undefined,
  };
}

export const currencyFor = (region: Region): "INR" | "GBP" => (region === "uk" ? "GBP" : "INR");

/** Removes analytics cookies set by GA4 / Meta after consent is withdrawn. */
export function clearTrackingCookies(): void {
  if (typeof document === "undefined") return;
  const host = location.hostname;
  const domains = ["", host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
  for (const c of document.cookie.split("; ")) {
    const name = c.split("=")[0];
    if (/^(_ga|_gid|_gat|_fbp|_fbc)/.test(name)) {
      for (const d of domains) document.cookie = `${name}=; path=/; max-age=0${d ? `; domain=${d}` : ""}`;
    }
  }
}
