import "server-only";
import { db } from "./db";
import { GiftCard, Order, ReturnRequest, type GiftCardDoc, type OrderDoc, type ReturnDoc } from "./models";
import { sendEmail, sendWhatsApp } from "./notify";
import { awardLoyaltyForOrder, reverseLoyaltyForOrder } from "./loyalty";
import { rewardReferrerForOrder } from "./referral";
import { restoreGiftCardForOrder } from "./giftcards";
import type { Message } from "./messages/shared";
import {
  deliveryAttempted,
  orderCancelled,
  orderDelivered,
  orderPaid,
  orderPlaced,
  orderReturned,
  orderShipped,
  outForDelivery,
  staffNewOrder,
} from "./messages/orders";
import { returnMessage } from "./messages/returns";

/*
 * Order lifecycle hooks. Call these AFTER the database write succeeds; they never throw.
 * They send customer messages (email + WhatsApp), and award/reverse loyalty points.
 * Owner: comms & accounts. Callers: checkout (placed/paid), tracking (shipped/delivered/scans), admin (status changes), returns.
 *
 * Each customer message is sent once: its key is added to order.notifications with an atomic $addToSet
 * (claimed just before sending, released again if sending fails), so retries and webhook replays don't double-send.
 */

const loadOrder = async (number: string) => {
  await db();
  return Order.findOne({ number }).lean<OrderDoc>();
};

/** Atomically claims a notification key. True when this caller should send it. */
async function claim(number: string, key: string): Promise<boolean> {
  const res = await Order.updateOne({ number, notifications: { $ne: key } }, { $addToSet: { notifications: key } });
  return res.modifiedCount === 1;
}
const release = (number: string, key: string) => Order.updateOne({ number }, { $pull: { notifications: key } }).catch(() => undefined);

/** Email the order address, plus WhatsApp when the delivery address has a phone. */
async function deliver(o: OrderDoc, template: string, msg: Message) {
  const email = await sendEmail({ to: o.email, subject: msg.subject, html: msg.html, text: msg.text, template, ref: o.number });
  if (o.address?.phone && msg.whatsapp) {
    await sendWhatsApp({ to: o.address.phone, region: o.region, template: msg.waTemplate ?? template, params: msg.waParams, preview: msg.whatsapp, ref: o.number });
  }
  return email;
}

/** Claim → build → send. Releases the claim if anything throws, so a later call can retry. */
async function sendOnce(o: OrderDoc, key: string, template: string, build: () => Message | null) {
  if (!(await claim(o.number, key))) return;
  try {
    const msg = build();
    if (!msg) return;
    const res = await deliver(o, template, msg);
    if (!res.ok) await release(o.number, key);
  } catch (e) {
    await release(o.number, key);
    throw e;
  }
}

const safely = async (label: string, fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    console.error(`[order-events] ${label} failed`, e);
  }
};

export async function onOrderPlaced(orderNumber: string): Promise<void> {
  await safely(`placed ${orderNumber}`, async () => {
    const o = await loadOrder(orderNumber);
    if (!o) return;
    await sendOnce(o, "placed", "order_placed", () => orderPlaced(o));
    // A confirmation that already says "paid" makes a separate payment email redundant.
    if (o.payment?.status === "paid") await Order.updateOne({ number: o.number }, { $addToSet: { notifications: "paid" } });

    const team = process.env.TEAM_EMAIL?.trim();
    if (team && (await claim(o.number, "staff_placed"))) {
      const m = staffNewOrder(o);
      await sendEmail({ to: team, subject: m.subject, html: m.html, text: m.text, template: "staff_new_order", ref: o.number });
    }
  });
}

export async function onOrderPaid(orderNumber: string): Promise<void> {
  await safely(`paid ${orderNumber}`, async () => {
    const o = await loadOrder(orderNumber);
    if (!o) return;
    if (!(o.notifications ?? []).includes("placed")) {
      // Confirmation not sent yet (e.g. the order is only announced once paid): send it now; it shows the payment.
      await onOrderPlaced(orderNumber);
      await Order.updateOne({ number: o.number }, { $addToSet: { notifications: "paid" } });
      return;
    }
    await sendOnce(o, "paid", "order_paid", () => orderPaid(o));
  });
}

/** Status changed in the admin or by tracking: confirmed, packed, shipped, delivered, cancelled, returned. */
export async function onOrderStatusChanged(orderNumber: string, status: string): Promise<void> {
  await safely(`status ${orderNumber} → ${status}`, async () => {
    let o = await loadOrder(orderNumber);
    if (!o) return;
    switch (status) {
      case "shipped":
        await sendOnce(o, "shipped", "order_shipped", () => orderShipped(o!));
        break;
      case "delivered": {
        await safely("awardLoyaltyForOrder", () => awardLoyaltyForOrder(orderNumber));
        await safely("rewardReferrerForOrder", () => rewardReferrerForOrder(orderNumber));
        o = (await loadOrder(orderNumber)) ?? o;
        const points = o.loyalty?.awarded ? Number(o.loyalty?.earnedPoints) || 0 : 0;
        await sendOnce(o, "delivered", "order_delivered", () => orderDelivered(o!, points));
        break;
      }
      case "cancelled":
        await safely("reverseLoyaltyForOrder", () => reverseLoyaltyForOrder(orderNumber));
        await safely("restoreGiftCardForOrder", () => restoreGiftCardForOrder(orderNumber));
        await sendOnce(o, "cancelled", "order_cancelled", () => orderCancelled(o!));
        break;
      case "returned":
        await safely("reverseLoyaltyForOrder", () => reverseLoyaltyForOrder(orderNumber));
        await safely("restoreGiftCardForOrder", () => restoreGiftCardForOrder(orderNumber));
        await sendOnce(o, "returned", "order_returned", () => orderReturned(o!));
        break;
      default:
        // confirmed / packed: no customer message (the confirmation email already covers them).
        break;
    }
  });
}

/** A courier scan was recorded (e.g. out_for_delivery, delivery_attempted). */
export async function onTrackingEvent(orderNumber: string, code: string): Promise<void> {
  if (code !== "out_for_delivery" && code !== "delivery_attempted") return;
  await safely(`tracking ${orderNumber} ${code}`, async () => {
    const o = await loadOrder(orderNumber);
    if (!o || o.status === "delivered" || o.status === "cancelled" || o.status === "returned") return;
    // One message per scan: a second attempt (or a second day out for delivery) is worth telling the customer about.
    const n = (o.shipment?.events ?? []).filter((e) => e.code === code).length || 1;
    if (code === "out_for_delivery") await sendOnce(o, `out_for_delivery_${n}`, "order_out_for_delivery", () => outForDelivery(o));
    else await sendOnce(o, `delivery_attempted_${n}`, "order_delivery_attempted", () => deliveryAttempted(o));
  });
}

/** History notes written by updateReturnStatus carry the store-credit code as "Store credit code: <CODE>". */
export const STORE_CREDIT_NOTE = "Store credit code:";

/** A return/exchange request was created or changed status. */
export async function onReturnUpdated(returnNumber: string): Promise<void> {
  await safely(`return ${returnNumber}`, async () => {
    await db();
    const rt = await ReturnRequest.findOne({ number: returnNumber }).lean<ReturnDoc>();
    if (!rt) return;
    const o = await loadOrder(rt.orderNumber);
    if (!o) return;

    let giftCardCode: string | undefined;
    let giftCardExpiry: Date | undefined;
    if (rt.status === "refunded" && rt.refundMethod === "store_credit") {
      const note = [...(rt.history ?? [])].reverse().find((h) => h.status === "refunded" && h.note?.includes(STORE_CREDIT_NOTE))?.note ?? "";
      giftCardCode = note.split(STORE_CREDIT_NOTE)[1]?.trim().split(/\s/)[0]?.replace(/[.,;]$/, "") || undefined;
      if (giftCardCode) {
        const gc = await GiftCard.findOne({ code: giftCardCode }, { expiresAt: 1 }).lean<Pick<GiftCardDoc, "expiresAt">>();
        giftCardExpiry = gc?.expiresAt ? new Date(gc.expiresAt) : undefined;
      }
    }

    // Key per status; a rescheduled pickup (new date) is a new message.
    const pickupKey = rt.status === "pickup_scheduled" && rt.pickup?.date ? `:${new Date(rt.pickup.date).toISOString().slice(0, 10)}` : "";
    const key = `return:${rt.number}:${rt.status}${pickupKey}`;
    await sendOnce(o, key, `return_${rt.status}`, () => returnMessage(rt, { name: o.address?.name, giftCardCode, giftCardExpiry }));
  });
}
