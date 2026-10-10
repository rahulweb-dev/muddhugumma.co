"use server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Product, Review, type ProductDoc } from "@/lib/models";
import { reviewEligibility } from "@/lib/reviews";
import { TOO_MANY, allow } from "@/lib/rate-limit";

export type ReviewState = { ok: boolean; message: string; errors?: Partial<Record<"rating" | "title" | "body" | "city" | "images", string>> } | null;

const ReviewInput = z.object({
  slug: z.string().trim().min(1).max(120),
  rating: z.coerce.number().int().min(1, "Choose a star rating.").max(5, "Choose a star rating."),
  title: z.string().trim().min(3, "Add a short title (3+ characters).").max(80, "Keep the title under 80 characters."),
  body: z.string().trim().min(20, "Tell us a little more (20+ characters).").max(1500, "Keep your review under 1,500 characters."),
  city: z.string().trim().max(40, "City is too long.").optional().default(""),
  images: z
    .array(z.string().trim().regex(/^reviews\/[\w\-./]{1,200}$/, "One of the photos did not upload properly. Please remove it and try again.").refine((s) => !s.includes(".."), "Invalid photo."))
    .max(3, "You can add up to 3 photos."),
});

/** New reviews wait for moderation (status "pending"); the product rating is recalculated when one is approved. */
export async function submitReview(_: ReviewState, form: FormData): Promise<ReviewState> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Please sign in to write a review." };
  if (!(await allow("review", 10, 3600, session.uid))) return { ok: false, message: TOO_MANY };

  const parsed = ReviewInput.safeParse({
    slug: form.get("slug"),
    rating: form.get("rating") ?? 0,
    title: form.get("title") ?? "",
    body: form.get("body") ?? "",
    city: form.get("city") ?? "",
    images: form.getAll("images").map(String).filter(Boolean),
  });
  if (!parsed.success) {
    const errors: NonNullable<NonNullable<ReviewState>["errors"]> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0];
      if ((k === "rating" || k === "title" || k === "body" || k === "city" || k === "images") && !errors[k]) errors[k] = issue.message;
    }
    return { ok: false, message: "Please check the highlighted fields.", errors };
  }
  const { slug, rating, title, body, city, images } = parsed.data;

  await db();
  const product = await Product.findOne({ slug, active: true }, { _id: 1 }).lean<Pick<ProductDoc, "_id">>();
  if (!product) return { ok: false, message: "This product is no longer available." };

  // Reviews are for customers who received this piece (signed-in or guest orders under the same email).
  const can = await reviewEligibility(session, slug);
  if (can === "reviewed") return { ok: false, message: "You have already reviewed this piece. Thank you!" };
  if (can !== "ok") return { ok: false, message: "Only customers who have received this piece can review it." };

  await Review.create({ productSlug: slug, userId: session.uid, name: session.name, rating, title, body, city, verified: true, images: [...new Set(images)], status: "pending" });

  return { ok: true, message: "Thanks! Your review will appear after a quick check." };
}
