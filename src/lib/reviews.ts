import "server-only";
import { db } from "./db";
import { Order, Product, Review } from "./models";

/* Review helpers. Owner: catalogue & discovery. */

/** Approved reviews (older reviews saved before moderation existed have no status and count as approved). */
export const APPROVED_REVIEW = { status: { $in: ["approved", null] } } as const;

/** Recomputes product.rating / ratingCount from approved reviews (call after moderation). */
export async function recalcProductRating(slug: string): Promise<void> {
  if (!slug) return;
  await db();
  const [agg] = await Review.aggregate<{ avg: number; n: number }>([
    { $match: { productSlug: slug, ...APPROVED_REVIEW } },
    { $group: { _id: null, avg: { $avg: "$rating" }, n: { $sum: 1 } } },
  ]);
  const n = agg?.n ?? 0;
  const rating = n ? Math.round(agg!.avg * 10) / 10 : 0;
  await Product.updateOne({ slug }, { $set: { rating, ratingCount: n } });
}

const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Only customers who received the piece can review it: a delivered order that contains the product,
 * placed while signed in or as a guest with the same email address.
 */
export type ReviewEligibility = "signed-out" | "not-bought" | "reviewed" | "ok";

export async function reviewEligibility(session: { uid: string; email: string } | null, slug: string): Promise<ReviewEligibility> {
  if (!session) return "signed-out";
  await db();
  if (await Review.exists({ productSlug: slug, userId: session.uid })) return "reviewed";
  const bought = await Order.exists({
    status: "delivered",
    "items.slug": slug,
    $or: [{ userId: session.uid }, ...(session.email ? [{ email: new RegExp(`^${escapeRx(session.email.trim())}$`, "i") }] : [])],
  });
  return bought ? "ok" : "not-bought";
}
