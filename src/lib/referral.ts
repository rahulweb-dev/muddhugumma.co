import "server-only";
import { randomInt } from "node:crypto";
import mongoose from "mongoose";
import { cookies } from "next/headers";
import { db } from "./db";
import { Order, User, nextSequence, type OrderDoc, type UserDoc } from "./models";
import { adjustPoints } from "./loyalty";
import { getSettings } from "./settings";
import { REGION_COOKIE, type Region } from "./region";

/*
 * Refer-a-friend. Owner: checkout & money.
 * Each customer gets a code (e.g. PRIYA7K2). A friend who signs up with it gets a welcome reward;
 * the referrer is rewarded when the friend's first order is delivered.
 * Rewards are paid as loyalty points worth settings.referralReward[region]
 * (points = reward / settings.loyalty.pointValue[region]).
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const tail = (n: number) => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

export const normaliseReferralCode = (code: string) => String(code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

/** Returns the user's referral code, creating one if needed. */
export async function ensureReferralCode(userId: string): Promise<string> {
  if (!mongoose.isValidObjectId(userId)) return "";
  await db();
  const u = await User.findById(userId, { name: 1, referralCode: 1 }).lean<Pick<UserDoc, "name" | "referralCode">>();
  if (!u) return "";
  if (u.referralCode) return u.referralCode;
  const first = (u.name ?? "").trim().split(/\s+/)[0] ?? "";
  const stem = first.replace(/[^A-Za-z]/g, "").slice(0, 6).toUpperCase() || "FRIEND";
  for (let i = 0; i < 8; i++) {
    const code = stem + tail(4);
    if (await User.exists({ referralCode: code })) continue;
    try {
      const res = await User.updateOne({ _id: userId, referralCode: { $in: [null, ""] } }, { $set: { referralCode: code } });
      if (res.modifiedCount) return code;
      // Someone else set it in the meantime.
      const again = await User.findById(userId, { referralCode: 1 }).lean<Pick<UserDoc, "referralCode">>();
      if (again?.referralCode) return again.referralCode;
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
    }
  }
  return "";
}

async function rewardPoints(region: Region): Promise<number> {
  const s = await getSettings();
  const value = s.loyalty.pointValue[region] || 1;
  return Math.round((s.referralReward[region] ?? 0) / value);
}

async function guessRegion(userId: string): Promise<Region> {
  const u = await User.findById(userId, { addresses: 1 }).lean<Pick<UserDoc, "addresses">>();
  const a = u?.addresses?.find((x) => x.isDefault) ?? u?.addresses?.[0];
  if (a?.region === "uk" || a?.region === "in") return a.region;
  const o = await Order.findOne({ userId }, { region: 1 }).sort({ createdAt: -1 }).lean<Pick<OrderDoc, "region">>();
  if (o?.region) return o.region;
  try {
    return (await cookies()).get(REGION_COOKIE)?.value === "uk" ? "uk" : "in";
  } catch {
    return "in"; // not in a request (scripts, jobs)
  }
}

/** Called right after sign-up when a referral code was supplied. Never throws. */
export async function attachReferral(userId: string, code: string): Promise<void> {
  try {
    const c = normaliseReferralCode(code);
    if (!c || !mongoose.isValidObjectId(userId)) return;
    await db();
    const referrer = await User.findOne({ referralCode: c }, { _id: 1 }).lean<{ _id: unknown }>();
    if (!referrer || String(referrer._id) === String(userId)) return;
    const res = await User.updateOne({ _id: userId, referredBy: { $in: [null, ""] } }, { $set: { referredBy: c } });
    if (!res.modifiedCount) return;
    const region = await guessRegion(userId);
    const points = await rewardPoints(region);
    if (points > 0) await adjustPoints(userId, points, `Welcome reward: joined with code ${c}`);
  } catch (e) {
    console.error("[referral] attach failed", e);
  }
}

/** Called when an order is delivered; rewards the referrer on the friend's first delivered order. Never throws. */
export async function rewardReferrerForOrder(orderNumber: string): Promise<void> {
  try {
    await db();
    const o = await Order.findOne({ number: orderNumber }, { userId: 1, region: 1, status: 1 }).lean<Pick<OrderDoc, "userId" | "region" | "status">>();
    if (!o?.userId || o.status !== "delivered" || !mongoose.isValidObjectId(o.userId)) return;
    const friend = await User.findById(o.userId, { referredBy: 1, name: 1 }).lean<Pick<UserDoc, "referredBy" | "name">>();
    if (!friend?.referredBy) return;
    const referrer = await User.findOne({ referralCode: friend.referredBy }, { _id: 1 }).lean<{ _id: unknown }>();
    if (!referrer || String(referrer._id) === String(o.userId)) return;
    // Only the friend's first delivered order counts, and only once (atomic counter).
    if ((await nextSequence(`referral-reward-${o.userId}`)) !== 1) return;
    const points = await rewardPoints(o.region === "uk" ? "uk" : "in");
    const first = (friend.name ?? "your friend").split(/\s+/)[0];
    if (points > 0) await adjustPoints(String(referrer._id), points, `Referral reward: ${first}'s first order arrived`, orderNumber);
  } catch (e) {
    console.error("[referral] reward failed", orderNumber, e);
  }
}
