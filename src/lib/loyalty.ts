import "server-only";
import mongoose from "mongoose";
import { db } from "./db";
import { LoyaltyTxn, Order, User, nextSequence, type OrderDoc } from "./models";
import { getSettings } from "./settings";

/*
 * "Muddhugumma Circle" loyalty points. Owner: checkout & money.
 * Points are earned when an order is delivered and reversed if it is cancelled or returned.
 *
 * Earning: floor(item amount paid / unit) × settings.loyalty.pointsPerUnit[region], where unit is ₹100 (India) or £1 (UK).
 *   "Item amount paid" = items after coupon, prepaid discount and points (delivery, gift wrap and COD fee don't earn).
 * Spending: 1 point is worth settings.loyalty.pointValue[region]; up to settings.loyalty.maxRedeemPct of the item subtotal per order.
 * Every change writes a LoyaltyTxn ledger row and $inc's User.loyaltyPoints.
 */

export const EARN_UNIT = { in: 100, uk: 1 } as const;

type LeanOrder = Pick<OrderDoc, "number" | "userId" | "region" | "subtotal" | "discount" | "prepaidDiscount" | "loyalty" | "status">;

/** Item value the customer paid for on an order (basis for earning). */
export function itemsPaid(o: Pick<OrderDoc, "subtotal" | "discount" | "prepaidDiscount" | "loyalty">): number {
  return Math.max(0, (o.subtotal ?? 0) - (o.discount ?? 0) - (o.prepaidDiscount ?? 0) - (o.loyalty?.discount ?? 0));
}

export async function pointsForOrder(o: Pick<OrderDoc, "region" | "subtotal" | "discount" | "prepaidDiscount" | "loyalty">): Promise<number> {
  const s = await getSettings();
  const region = o.region === "uk" ? "uk" : "in";
  return Math.floor(itemsPaid(o) / EARN_UNIT[region]) * Math.max(0, s.loyalty.pointsPerUnit[region] ?? 0);
}

/** Credit points for a delivered order (idempotent: uses order.loyalty.awarded). */
export async function awardLoyaltyForOrder(orderNumber: string): Promise<void> {
  try {
    await db();
    const o = await Order.findOne({ number: orderNumber }).lean<LeanOrder>();
    if (!o?.userId || !mongoose.isValidObjectId(o.userId) || o.status !== "delivered" || o.loyalty?.awarded) return;
    const points = await pointsForOrder(o);
    // Claim the award atomically so two callers can't both credit it.
    const res = await Order.updateOne(
      { number: orderNumber, "loyalty.awarded": { $ne: true } },
      { $set: { "loyalty.awarded": true, "loyalty.earnedPoints": points } }
    );
    if (!res.modifiedCount || points <= 0) return;
    await adjustPoints(o.userId, points, `Earned on order ${orderNumber}`, orderNumber);
  } catch (e) {
    console.error("[loyalty] award failed", orderNumber, e);
  }
}

/** Take back earned points and refund redeemed points when an order is cancelled or returned (idempotent). */
export async function reverseLoyaltyForOrder(orderNumber: string): Promise<void> {
  try {
    await db();
    const o = await Order.findOne({ number: orderNumber }).lean<LeanOrder>();
    if (!o?.userId || !mongoose.isValidObjectId(o.userId)) return;

    // Earned points: un-claim the award atomically, then take the points back.
    if (o.loyalty?.awarded) {
      const res = await Order.updateOne({ number: orderNumber, "loyalty.awarded": true }, { $set: { "loyalty.awarded": false } });
      const earned = o.loyalty.earnedPoints ?? 0;
      if (res.modifiedCount && earned > 0) await adjustPoints(o.userId, -earned, `Reversed: order ${orderNumber} was ${o.status}`, orderNumber);
    }

    // Redeemed points go back once per order (the counter makes the refund idempotent).
    const redeemed = o.loyalty?.redeemedPoints ?? 0;
    if (redeemed > 0 && (await nextSequence(`loyalty-refund-${orderNumber}`)) === 1) {
      await adjustPoints(o.userId, redeemed, `Refunded: points used on order ${orderNumber}`, orderNumber);
    }
  } catch (e) {
    console.error("[loyalty] reverse failed", orderNumber, e);
  }
}

/** Add or remove points with a ledger entry (used for birthdays, referrals and admin adjustments). */
export async function adjustPoints(userId: string, points: number, reason: string, orderNumber?: string): Promise<void> {
  const p = Math.trunc(Number(points));
  if (!p || !mongoose.isValidObjectId(userId)) return;
  await db();
  await User.updateOne({ _id: userId }, { $inc: { loyaltyPoints: p } });
  await LoyaltyTxn.create({ userId, points: p, reason, orderNumber: orderNumber ?? "" });
}

/**
 * Spend points at checkout atomically (only if the balance still covers them). Returns false if not.
 * Used by placeOrder; the ledger row is written here too.
 */
export async function spendPoints(userId: string, points: number, orderNumber: string): Promise<boolean> {
  const p = Math.trunc(points);
  if (p <= 0) return true;
  await db();
  const res = await User.updateOne({ _id: userId, loyaltyPoints: { $gte: p } }, { $inc: { loyaltyPoints: -p } });
  if (!res.modifiedCount) return false;
  await LoyaltyTxn.create({ userId, points: -p, reason: `Used on order ${orderNumber}`, orderNumber });
  return true;
}

/** Puts back points taken by spendPoints when the order could not be created (no ledger noise beyond a correcting row). */
export async function unspendPoints(userId: string, points: number, orderNumber: string): Promise<void> {
  const p = Math.trunc(points);
  if (p <= 0) return;
  await adjustPoints(userId, p, `Returned: order ${orderNumber} was not placed`, orderNumber).catch((e) => console.error("[loyalty] unspend failed", e));
}
