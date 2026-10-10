import "server-only";
// Per-visitor limits for public forms and APIs (contact, reviews, SMS codes, sign-up, password reset, checkout…),
// so bots can't flood inboxes, run up the SMS bill or hold stock with fake orders.
// Counters live in MongoDB (not memory) because Vercel runs many server instances; each expires with its window.
import { headers } from "next/headers";
import { db } from "./db";
import { RateLimit } from "./models";

/** The visitor's IP as Vercel / Cloudflare report it ("unknown" locally). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-real-ip") || h.get("cf-connecting-ip") || h.get("x-forwarded-for")?.split(",")[0] || "unknown").trim().slice(0, 64);
}

/**
 * Counts one use of `action` by this visitor and returns false once they're over `limit` uses per `windowSec`.
 * Fails open (allows) if the database is unreachable, so a hiccup never blocks a real customer.
 */
export async function allow(action: string, limit: number, windowSec: number, who?: string): Promise<boolean> {
  const key = `${action}:${who ?? (await clientIp())}`;
  try {
    await db();
    const now = new Date();
    let doc = await RateLimit.findOneAndUpdate({ key, resetAt: { $gt: now } }, { $inc: { count: 1 } }, { returnDocument: "after" }).lean<{ count: number }>();
    if (!doc) {
      // New window (or the old one ended): start counting again. Two requests racing here both count as first.
      doc = await RateLimit.findOneAndUpdate({ key }, { $set: { count: 1, resetAt: new Date(now.getTime() + windowSec * 1000) } }, { upsert: true, returnDocument: "after" })
        .lean<{ count: number }>()
        .catch(() => ({ count: 1 }));
    }
    return (doc?.count ?? 1) <= limit;
  } catch (e) {
    console.error("[rate-limit]", e);
    return true;
  }
}

export const TOO_MANY = "Too many attempts from your connection. Please wait a little and try again.";
