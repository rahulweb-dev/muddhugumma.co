// Couriers, tracking event types and display helpers. Safe to import from client and server code.
import type { Region } from "./region";

export type Courier = {
  id: string;
  name: string;
  regions: Region[];
  /** Public tracking page for an AWB. Empty when the courier has no deep link; the admin can paste one instead. */
  url: (awb: string) => string;
};

const enc = encodeURIComponent;

export const COURIERS: Courier[] = [
  { id: "delhivery", name: "Delhivery", regions: ["in"], url: (a) => `https://www.delhivery.com/track-v2/package/${enc(a)}` },
  { id: "bluedart", name: "Blue Dart", regions: ["in"], url: (a) => `https://www.bluedart.com/web/guest/trackdartresult?trackFor=0&trackNo=${enc(a)}` },
  { id: "dtdc", name: "DTDC", regions: ["in"], url: () => "https://www.dtdc.com/track-your-shipment/" },
  { id: "xpressbees", name: "Xpressbees", regions: ["in"], url: (a) => `https://www.xpressbees.com/shipment/tracking?awbNo=${enc(a)}` },
  { id: "ekart", name: "Ekart", regions: ["in"], url: (a) => `https://ekartlogistics.com/shipmenttrack/${enc(a)}` },
  { id: "indiapost", name: "India Post (Speed Post)", regions: ["in", "uk"], url: () => "https://www.indiapost.gov.in/" },
  { id: "dhl", name: "DHL Express", regions: ["in", "uk"], url: (a) => `https://www.dhl.com/in-en/home/tracking/tracking-express.html?submit=1&tracking-id=${enc(a)}` },
  { id: "fedex", name: "FedEx", regions: ["in", "uk"], url: (a) => `https://www.fedex.com/fedextrack/?trknbr=${enc(a)}` },
  { id: "aramex", name: "Aramex", regions: ["in", "uk"], url: (a) => `https://www.aramex.com/track/results?ShipmentNumber=${enc(a)}` },
  { id: "royalmail", name: "Royal Mail", regions: ["uk"], url: (a) => `https://www.royalmail.com/track-your-item#/tracking-results/${enc(a)}` },
  { id: "shiprocket", name: "Shiprocket", regions: ["in", "uk"], url: (a) => `https://shiprocket.co/tracking/${enc(a)}` },
  { id: "other", name: "Other courier", regions: ["in", "uk"], url: () => "" },
];

export const courierById = (id?: string) => COURIERS.find((c) => c.id === id);
export const courierName = (id?: string) => courierById(id)?.name ?? (id || "Courier");

/** The link customers click: an admin-entered URL wins, otherwise the courier's deep link. */
export function trackingLink(courier?: string, awb?: string, override?: string): string {
  if (override) return override;
  if (!awb) return "";
  return courierById(courier)?.url(awb) ?? "";
}

/**
 * Tracking milestones. Codes match what a courier aggregator reports, so Shiprocket scans can map onto them later.
 * `final` codes close the shipment (delivered) or hand it back (rto_delivered).
 */
export const TRACKING_EVENTS = [
  { code: "shipped", label: "Shipped", customer: "Handed to the courier" },
  { code: "picked_up", label: "Picked up", customer: "Picked up by the courier" },
  { code: "in_transit", label: "In transit", customer: "On the way" },
  { code: "reached_hub", label: "Reached hub", customer: "Arrived at a courier hub" },
  { code: "customs", label: "In customs", customer: "Clearing customs (duties already paid)" },
  { code: "out_for_delivery", label: "Out for delivery", customer: "Out for delivery today" },
  { code: "delivery_attempted", label: "Delivery attempted", customer: "Delivery attempted: the courier will try again" },
  { code: "delivered", label: "Delivered", customer: "Delivered", final: true },
  { code: "exception", label: "Delayed", customer: "Delayed: we're looking into it" },
  { code: "rto", label: "Returning to us", customer: "Being returned to our studio" },
  { code: "rto_delivered", label: "Returned to us", customer: "Returned to our studio", final: true },
] as const;

export type TrackingCode = (typeof TRACKING_EVENTS)[number]["code"];
export const TRACKING_CODES = TRACKING_EVENTS.map((e) => e.code) as TrackingCode[];
export const trackingEvent = (code: string) => TRACKING_EVENTS.find((e) => e.code === code);

/* ---------- views passed to components (plain JSON) ---------- */
export type TrackingEventView = { id: string; code: string; label: string; customerLabel: string; location: string; at: string; note: string; source: string };
export type ShipmentView = {
  provider: string;
  courier: string;
  courierName: string;
  awb: string;
  trackingUrl: string;
  shippedAt: string;
  expectedBy: string;
  deliveredAt: string;
  events: TrackingEventView[]; // newest first
};

const REGION_TZ: Record<Region, string> = { in: "Asia/Kolkata", uk: "Europe/London" };
const REGION_LOCALE: Record<Region, string> = { in: "en-IN", uk: "en-GB" };

/** "Sat, 10 Oct, 6:30 pm" in the shopper's own timezone. */
export const fmtTrackTime = (iso: string, region: Region) =>
  iso ? new Date(iso).toLocaleString(REGION_LOCALE[region], { timeZone: REGION_TZ[region], weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

export const fmtTrackDay = (iso: string, region: Region) =>
  iso ? new Date(iso).toLocaleDateString(REGION_LOCALE[region], { timeZone: REGION_TZ[region], weekday: "long", day: "numeric", month: "long" }) : "";
