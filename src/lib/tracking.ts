import "server-only";
import { db } from "./db";
import { Order, type OrderDoc, type ShipmentDoc, type TrackingEventDoc } from "./models";
import { deliveryWindow, type Region } from "./region";
import { courierName, trackingEvent, trackingLink, type ShipmentView, type TrackingCode } from "./shipping";
import { onOrderStatusChanged, onTrackingEvent } from "./order-events";

/*
 * Shipment tracking core.
 * Today the admin panel calls these functions (provider "manual").
 * Stage 2: a Shiprocket integration calls the same functions:
 *   - recordShipment(...) after booking a courier through the Shiprocket API (provider "shiprocket", providerRef = shipment id)
 *   - recordTrackingEvent({ awb }, ...) from a /api/webhooks/shiprocket route, mapping its scan status onto TrackingCode
 * Customers' views read only the stored shipment, so nothing on their side changes when the provider does.
 */

type OrderFilter = { _id: string } | { number: string } | { awb: string };
const toQuery = (f: OrderFilter) => ("awb" in f ? { "shipment.awb": f.awb } : f);

const PRE_SHIP = new Set(["placed", "confirmed", "packed"]);
const CLOSED = new Set(["cancelled", "returned"]);

export type ShipmentInput = {
  courier: string;
  awb: string;
  trackingUrl?: string;
  shippedAt?: Date;
  expectedBy?: Date;
  provider?: "manual" | "shiprocket";
  providerRef?: string;
};

export type TrackingResult = { ok: true; message: string } | { ok: false; error: string };

/** Adds or updates the shipment on an order and moves it to "shipped" when it hasn't got there yet. */
export async function recordShipment(filter: OrderFilter, input: ShipmentInput, actor: string): Promise<TrackingResult> {
  await db();
  const order = await Order.findOne(toQuery(filter), { number: 1, status: 1, region: 1, shipment: 1 }).lean<Pick<OrderDoc, "number" | "status" | "region" | "shipment">>();
  if (!order) return { ok: false, error: "Order not found." };
  if (CLOSED.has(order.status)) return { ok: false, error: `This order is ${order.status}; it can't be shipped.` };

  const first = !order.shipment?.awb;
  const shippedAt = input.shippedAt ?? order.shipment?.shippedAt ?? new Date();
  const expectedBy = input.expectedBy ?? order.shipment?.expectedBy ?? deliveryWindow(order.region, shippedAt)[1];
  const name = courierName(input.courier);

  const set: Record<string, unknown> = {
    "shipment.provider": input.provider ?? order.shipment?.provider ?? "manual",
    "shipment.courier": input.courier,
    "shipment.awb": input.awb,
    "shipment.trackingUrl": input.trackingUrl ?? "",
    "shipment.providerRef": input.providerRef ?? order.shipment?.providerRef ?? "",
    "shipment.shippedAt": shippedAt,
    "shipment.expectedBy": expectedBy,
  };
  const push: Record<string, unknown> = {};
  if (PRE_SHIP.has(order.status)) {
    set.status = "shipped";
    push.history = { status: "shipped", at: new Date(), note: `Shipped with ${name} · AWB ${input.awb} (${actor})` };
  } else {
    push.history = { status: order.status, at: new Date(), note: `Tracking details updated: ${name} · AWB ${input.awb} (${actor})` };
  }
  if (first) {
    push["shipment.events"] = { code: "shipped", label: "Shipped", location: "Hyderabad studio", at: shippedAt, note: `Handed to ${name}`, source: input.provider === "shiprocket" ? "shiprocket" : "admin" };
  }
  await Order.updateOne(toQuery(filter), { $set: set, $push: push });
  // Customer "your order has shipped" message (once per order; never throws).
  if (set.status === "shipped") await onOrderStatusChanged(order.number, "shipped");
  return { ok: true, message: first ? `Marked shipped with ${name}. The customer can now track it.` : "Tracking details updated." };
}

export type EventInput = { code: TrackingCode; location?: string; at?: Date; note?: string; source?: "admin" | "shiprocket" };

/** Adds a tracking scan. Delivered scans also close the order. Duplicate scans (same code and time) are ignored. */
export async function recordTrackingEvent(filter: OrderFilter, input: EventInput, actor: string): Promise<TrackingResult> {
  const def = trackingEvent(input.code);
  if (!def) return { ok: false, error: "Unknown tracking status." };
  await db();
  const order = await Order.findOne(toQuery(filter), { number: 1, status: 1, shipment: 1 }).lean<Pick<OrderDoc, "number" | "status" | "shipment">>();
  if (!order) return { ok: false, error: "Order not found." };
  if (!order.shipment?.awb) return { ok: false, error: "Add the courier and tracking number first." };

  const at = input.at ?? new Date();
  const loc = (input.location ?? "").trim().toLowerCase();
  // Couriers resend scans; the same status at the same place within a minute is the same scan.
  const dupe = (order.shipment.events ?? []).some(
    (e) => e.code === input.code && (e.location ?? "").trim().toLowerCase() === loc && Math.abs(new Date(e.at).getTime() - at.getTime()) < 60_000
  );
  if (dupe) return { ok: true, message: "Already recorded." };

  const set: Record<string, unknown> = {};
  const push: Record<string, unknown> = {
    "shipment.events": { code: def.code, label: def.label, location: (input.location ?? "").trim(), at, note: (input.note ?? "").trim(), source: input.source ?? "admin" },
  };
  let message = `Added “${def.label}”.`;

  if (def.code === "delivered") {
    set["shipment.deliveredAt"] = at;
    if (order.status !== "delivered" && !CLOSED.has(order.status)) {
      set.status = "delivered";
      push.history = { status: "delivered", at: new Date(), note: `Delivered${input.location ? ` in ${input.location}` : ""} (${actor})` };
      message = "Marked delivered.";
    }
  } else if (def.code === "rto_delivered") {
    push.history = { status: order.status, at: new Date(), note: `Parcel returned to the studio. Mark the order “Returned” to put the stock back. (${actor})` };
    message = "Recorded. Mark the order Returned to put the stock back.";
  } else if (PRE_SHIP.has(order.status)) {
    set.status = "shipped";
    push.history = { status: "shipped", at: new Date(), note: `In transit (${actor})` };
  }

  await Order.updateOne(toQuery(filter), Object.keys(set).length ? { $set: set, $push: push } : { $push: push });
  // Customer messages (each sent once; these never throw).
  await onTrackingEvent(order.number, def.code);
  if (set.status === "shipped") await onOrderStatusChanged(order.number, "shipped");
  if (set.status === "delivered") await onOrderStatusChanged(order.number, "delivered");
  return { ok: true, message };
}

export async function removeTrackingEvent(filter: OrderFilter, eventId: string): Promise<TrackingResult> {
  await db();
  const res = await Order.updateOne(toQuery(filter), { $pull: { "shipment.events": { _id: eventId } } });
  return res.modifiedCount ? { ok: true, message: "Tracking update removed." } : { ok: false, error: "That update was already removed." };
}

/* ---------- views ---------- */

export function toShipmentView(s?: ShipmentDoc | null): ShipmentView | null {
  if (!s?.awb) return null;
  const iso = (d?: Date) => (d ? new Date(d).toISOString() : "");
  const events = [...(s.events ?? [])]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .map((e: TrackingEventDoc) => {
      const def = trackingEvent(e.code);
      return {
        id: String(e._id ?? ""),
        code: e.code,
        label: e.label || def?.label || e.code,
        customerLabel: def?.customer ?? e.label ?? e.code,
        location: e.location ?? "",
        at: iso(e.at),
        note: e.note ?? "",
        source: e.source ?? "admin",
      };
    });
  return {
    provider: s.provider ?? "manual",
    courier: s.courier ?? "",
    courierName: courierName(s.courier),
    awb: s.awb,
    trackingUrl: trackingLink(s.courier, s.awb, s.trackingUrl),
    shippedAt: iso(s.shippedAt),
    expectedBy: iso(s.expectedBy),
    deliveredAt: iso(s.deliveredAt),
    events,
  };
}

export type PublicTracking = {
  number: string;
  region: Region;
  status: string;
  placedAt: string;
  itemCount: number;
  firstItem: { name: string; image: string } | null;
  city: string;
  history: { status: string; at: string }[];
  shipment: ShipmentView | null;
};

const digits = (s: string) => s.replace(/\D/g, "");

/**
 * Guest lookup for /track: the order number plus the email or phone used at checkout.
 * Returns null on any mismatch so the page never reveals whether an order number exists.
 */
export async function findTrackableOrder(numberRaw: string, contactRaw: string): Promise<PublicTracking | null> {
  const number = numberRaw.trim().toUpperCase();
  const contact = contactRaw.trim();
  if (!/^[A-Z0-9-]{6,30}$/.test(number) || contact.length < 5) return null;
  await db();
  const o = await Order.findOne({ number }).lean<OrderDoc>();
  if (!o) return null;
  const emailMatch = contact.includes("@") && contact.toLowerCase() === (o.email ?? "").toLowerCase();
  const phone = digits(o.address?.phone ?? "");
  const given = digits(contact);
  const phoneMatch = !contact.includes("@") && given.length >= 10 && phone.length >= 10 && phone.slice(-10) === given.slice(-10);
  if (!emailMatch && !phoneMatch) return null;
  return toPublicTracking(o);
}

export function toPublicTracking(o: OrderDoc): PublicTracking {
  return {
    number: o.number,
    region: o.region,
    status: o.status,
    placedAt: o.createdAt ? new Date(o.createdAt).toISOString() : "",
    itemCount: (o.items ?? []).reduce((n, i) => n + (i.qty || 1), 0),
    firstItem: o.items?.[0] ? { name: o.items[0].name, image: o.items[0].image } : null,
    city: o.address?.city ?? "",
    history: (o.history ?? []).map((h) => ({ status: h.status, at: h.at ? new Date(h.at).toISOString() : "" })),
    shipment: toShipmentView(o.shipment),
  };
}
