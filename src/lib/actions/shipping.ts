"use server";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { staffCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/audit";
import { onOrderStatusChanged } from "@/lib/order-events";
import { Order } from "@/lib/models";
import { COURIERS, TRACKING_CODES, type TrackingCode } from "@/lib/shipping";
import { codToCollect, type LeanOrder } from "@/lib/admin-data";
import { bookShipment, shiprocketConfigured } from "@/lib/shiprocket";
import { allow } from "@/lib/rate-limit";
import { findTrackableOrder, recordShipment, recordTrackingEvent, removeTrackingEvent, type PublicTracking, type TrackingResult } from "@/lib/tracking";

const ADMIN_TZ = process.env.ADMIN_TIMEZONE || "Asia/Kolkata";
const NO_SHIP: TrackingResult = { ok: false, error: "Your role doesn't allow you to ship orders. Ask the store owner if you need this." };

/** datetime-local / date inputs carry no timezone; read them in the studio's timezone (IST by default). */
function parseLocal(v: string): Date | undefined {
  if (!v) return undefined;
  const withTime = v.length === 10 ? `${v}T12:00` : v;
  const d = ADMIN_TZ === "Asia/Kolkata" ? new Date(`${withTime}:00+05:30`) : new Date(withTime);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function refresh(orderId: string) {
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin", "layout");
  revalidatePath("/account", "layout");
  revalidatePath("/track");
}

const orderNumber = async (orderId: string) => {
  await db();
  return (await Order.findById(orderId, { number: 1 }).lean<{ number: string }>())?.number ?? orderId;
};

const ShipmentSchema = z.object({
  courier: z.enum(COURIERS.map((c) => c.id) as [string, ...string[]], { message: "Choose the courier." }),
  awb: z.string().trim().min(4, { message: "Enter the tracking number (AWB)." }).max(40).regex(/^[A-Za-z0-9-]+$/, { message: "Use letters, numbers and dashes only." }),
  trackingUrl: z.string().trim().max(500).refine((v) => v === "" || /^https:\/\/\S+$/.test(v), { message: "Use a full https:// link, or leave it empty." }),
  shippedAt: z.string().max(20),
  expectedBy: z.string().max(20),
});

export async function saveShipmentAction(orderId: string, raw: z.input<typeof ShipmentSchema>): Promise<TrackingResult & { fields?: Record<string, string> }> {
  const admin = await staffCan("orders.ship");
  if (!admin) return NO_SHIP;
  if (!mongoose.isValidObjectId(orderId)) return { ok: false, error: "Unknown order." };
  const parsed = ShipmentSchema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[String(i.path[0])] ??= i.message;
    return { ok: false, error: Object.values(fields)[0] ?? "Check the form.", fields };
  }
  const d = parsed.data;
  if (d.courier === "other" && !d.trackingUrl) return { ok: false, error: "For “Other courier”, paste the tracking link so customers can follow it.", fields: { trackingUrl: "Paste the courier's tracking link." } };
  const res = await recordShipment(
    { _id: orderId },
    { courier: d.courier, awb: d.awb.toUpperCase(), trackingUrl: d.trackingUrl, shippedAt: parseLocal(d.shippedAt), expectedBy: parseLocal(d.expectedBy), provider: "manual" },
    admin.name
  );
  if (res.ok) {
    await logActivity(admin, "order.ship", { target: await orderNumber(orderId), targetId: orderId, meta: { courier: d.courier, awb: d.awb.toUpperCase() } });
    refresh(orderId);
  }
  return res;
}

const EventSchema = z.object({
  code: z.enum(TRACKING_CODES as [TrackingCode, ...TrackingCode[]], { message: "Choose a status." }),
  location: z.string().trim().max(80),
  at: z.string().max(20),
  note: z.string().trim().max(240),
});

export async function addTrackingEventAction(orderId: string, raw: z.input<typeof EventSchema>): Promise<TrackingResult> {
  const admin = await staffCan("orders.ship");
  if (!admin) return NO_SHIP;
  if (!mongoose.isValidObjectId(orderId)) return { ok: false, error: "Unknown order." };
  const parsed = EventSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const at = parseLocal(parsed.data.at) ?? new Date();
  if (at.getTime() > Date.now() + 5 * 60_000) return { ok: false, error: "That time is in the future." };
  const res = await recordTrackingEvent({ _id: orderId }, { code: parsed.data.code, location: parsed.data.location, at, note: parsed.data.note, source: "admin" }, admin.name);
  if (res.ok) {
    await logActivity(admin, "order.tracking_add", { target: await orderNumber(orderId), targetId: orderId, meta: { code: parsed.data.code, location: parsed.data.location || undefined } });
    refresh(orderId);
  }
  return res;
}

export async function removeTrackingEventAction(orderId: string, eventId: string): Promise<TrackingResult> {
  const admin = await staffCan("orders.ship");
  if (!admin) return NO_SHIP;
  if (!mongoose.isValidObjectId(orderId) || !mongoose.isValidObjectId(eventId)) return { ok: false, error: "Unknown update." };
  const res = await removeTrackingEvent({ _id: orderId }, eventId);
  if (res.ok) {
    await logActivity(admin, "order.tracking_remove", { target: await orderNumber(orderId), targetId: orderId, meta: { eventId } });
    refresh(orderId);
  }
  return res;
}

/* ---------- packing ---------- */

/** Moves confirmed orders to "packed". Orders in any other status are skipped and reported. */
export async function markOrdersPacked(orderIds: string[]): Promise<TrackingResult> {
  const admin = await staffCan("orders.ship");
  if (!admin) return NO_SHIP;
  const ids = [...new Set((Array.isArray(orderIds) ? orderIds : []).filter((id) => mongoose.isValidObjectId(id)))].slice(0, 200);
  if (!ids.length) return { ok: false, error: "Tick at least one order." };
  await db();
  const orders = await Order.find({ _id: { $in: ids } }, { number: 1, status: 1 }).lean<{ _id: mongoose.Types.ObjectId; number: string; status: string }[]>();
  const ready = orders.filter((o) => o.status === "confirmed");
  const packed: string[] = [];
  for (const o of ready) {
    // Guard on status so two people packing at once don't double-log.
    const res = await Order.updateOne(
      { _id: o._id, status: "confirmed" },
      { $set: { status: "packed" }, $push: { history: { status: "packed", at: new Date(), note: `Packed by ${admin.name}` } } }
    );
    if (res.modifiedCount) {
      packed.push(o.number);
      await logActivity(admin, "order.status", { target: o.number, targetId: String(o._id), meta: { from: "confirmed", to: "packed", via: "packing" } });
      await onOrderStatusChanged(o.number, "packed");
    }
  }
  revalidatePath("/admin/packing");
  revalidatePath("/admin", "layout");
  revalidatePath("/account", "layout");
  const skipped = ids.length - packed.length;
  if (!packed.length) return { ok: false, error: "None of those orders could be packed. Only confirmed orders can be marked packed." };
  return { ok: true, message: `${packed.length} order${packed.length === 1 ? "" : "s"} marked packed${skipped ? `; ${skipped} skipped (not confirmed)` : ""}.` };
}

/* ---------- public: guest tracking ---------- */

export type TrackLookupState = { status: "idle" } | { status: "notfound"; number: string; contact: string } | { status: "found"; data: PublicTracking };

export async function lookupTracking(_prev: TrackLookupState, form: FormData): Promise<TrackLookupState> {
  const number = String(form.get("number") ?? "").slice(0, 40);
  const contact = String(form.get("contact") ?? "").slice(0, 120);
  // 30 lookups an hour per visitor is plenty for real customers and stops anyone guessing order numbers.
  if (!(await allow("track", 30, 3600))) return { status: "notfound", number, contact };
  // Small fixed delay keeps guessing order numbers slow.
  await new Promise((r) => setTimeout(r, 400));
  const data = await findTrackableOrder(number, contact);
  return data ? { status: "found", data } : { status: "notfound", number, contact };
}

/** One click: book the parcel with Shiprocket (India orders), save the AWB as the shipment, and return the label link. */
export async function bookWithShiprocket(orderId: string): Promise<TrackingResult & { labelUrl?: string }> {
  const admin = await staffCan("orders.ship");
  if (!admin) return NO_SHIP;
  if (!mongoose.isValidObjectId(orderId)) return { ok: false, error: "Unknown order." };
  if (!shiprocketConfigured()) return { ok: false, error: "Shiprocket isn't connected yet. Add SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in Vercel." };
  await db();
  const o = await Order.findById(orderId).lean<LeanOrder & { shipment?: { awb?: string } }>();
  if (!o) return { ok: false, error: "Unknown order." };
  if (o.region === "uk") return { ok: false, error: "Shiprocket booking is for India orders. Add the UK courier and tracking number by hand." };
  if (!["confirmed", "packed"].includes(o.status)) return { ok: false, error: "Only orders that are confirmed or packed can be booked." };
  if (o.shipment?.awb) return { ok: false, error: "This order already has a tracking number." };
  try {
    const booked = await bookShipment({
      number: o.number,
      createdAt: new Date(o.createdAt ?? Date.now()),
      email: o.email,
      address: o.address ?? {},
      items: o.items.map((i) => ({ name: i.name ?? "Item", slug: i.slug, size: i.size, qty: i.qty ?? 1, unitPrice: i.unitPrice ?? 0, optionsPrice: i.optionsPrice ?? 0 })),
      total: o.total ?? 0,
      collect: codToCollect(o),
    });
    const res = await recordShipment({ _id: orderId }, { courier: "shiprocket", awb: booked.awb.toUpperCase(), shippedAt: new Date(), provider: "shiprocket", providerRef: booked.shipmentId }, admin.name);
    if (!res.ok) return res;
    await logActivity(admin, "order.ship", { target: o.number, targetId: orderId, meta: { courier: `shiprocket:${booked.courier}`, awb: booked.awb } });
    refresh(orderId);
    return {
      ok: true,
      message: `Booked with ${booked.courier}, AWB ${booked.awb}.${booked.pickup ? " Pickup requested." : " Request the pickup in Shiprocket."}${booked.labelUrl ? " Print the label from the link." : ""}`,
      labelUrl: booked.labelUrl,
    };
  } catch (e) {
    console.error("[shiprocket]", e);
    return { ok: false, error: e instanceof Error ? e.message : "Shiprocket booking failed." };
  }
}
