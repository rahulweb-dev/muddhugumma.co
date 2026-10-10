import "server-only";
// "Sells out in X days": recent sales per product, size and country (last 30 days of live orders), compared with
// what's on the shelf. Simple on purpose: average daily sales, no seasonality.
import { db } from "./db";
import { Order } from "./models";
import { canonicalSize, type Region } from "./region";

export const FORECAST_DAYS = 30;
/** Restock suggestions aim to cover this many days of sales. */
export const COVER_DAYS = 30;

const LIVE = ["placed", "confirmed", "packed", "shipped", "delivered"];

export type Velocity = Map<string, number>; // `${slug}|${region}|${size}` → pieces sold per day

export const velocityKey = (slug: string, region: Region, size: string) => `${slug}|${region}|${size}`;

export async function salesVelocity(regions: Region[]): Promise<Velocity> {
  await db();
  const since = new Date(Date.now() - FORECAST_DAYS * 86_400_000);
  const rows = await Order.aggregate<{ _id: { slug: string; size: string; region: Region }; qty: number }>([
    { $match: { createdAt: { $gte: since }, status: { $in: LIVE }, region: { $in: regions } } },
    { $unwind: "$items" },
    { $group: { _id: { slug: "$items.slug", size: "$items.size", region: "$region" }, qty: { $sum: "$items.qty" } } },
  ]);
  const out: Velocity = new Map();
  for (const r of rows) {
    if (!r._id.slug) continue;
    const k = velocityKey(r._id.slug, r._id.region, canonicalSize(r._id.size ?? ""));
    out.set(k, (out.get(k) ?? 0) + (r.qty || 0) / FORECAST_DAYS);
  }
  return out;
}

export type SizeForecast = { size: string; days: number; perDay: number; restock: number };

/** Per size: days until sold out at the recent rate, and how many to add to cover COVER_DAYS. Only sizes that sell. */
export function forecastFor(slug: string, region: Region, stock: Record<string, number>, sizes: string[], v: Velocity): SizeForecast[] {
  return sizes
    .map((size) => {
      const perDay = v.get(velocityKey(slug, region, size)) ?? 0;
      const have = Math.max(0, stock[size] ?? 0);
      return { size, perDay, days: perDay > 0 ? Math.floor(have / perDay) : Infinity, restock: Math.max(0, Math.ceil(perDay * COVER_DAYS) - have) };
    })
    .filter((f) => f.perDay > 0);
}
