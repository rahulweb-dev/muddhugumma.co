import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { Bundle, Lookbook, Post, Product } from "@/lib/models";
import { SPECIAL_LISTINGS } from "@/lib/queries";
import { activeCategories } from "@/lib/categories";
import { absImage } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3100";
  await db();
  const products = await Product.find({ active: true }, { slug: 1, updatedAt: 1, images: 1 }).lean<{ slug: string; updatedAt?: Date; images?: string[] }[]>();
  const [looks, lookbooks, posts] = await Promise.all([
    Bundle.find({ active: true }, { slug: 1, updatedAt: 1 }).lean<{ slug: string; updatedAt?: Date }[]>(),
    Lookbook.find({ active: true }, { slug: 1, updatedAt: 1 }).lean<{ slug: string; updatedAt?: Date }[]>(),
    Post.find({ status: "published" }, { slug: 1, updatedAt: 1 }).lean<{ slug: string; updatedAt?: Date }[]>(),
  ]);
  const help = ["shipping", "returns", "size-guide", "faq", "contact", "privacy", "terms", "cookies"];
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/consult`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/contact`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/track`, changeFrequency: "yearly", priority: 0.3 },
    ...[...Object.keys(SPECIAL_LISTINGS), ...(await activeCategories()).map((c) => c.slug)].map((s) => ({ url: `${base}/c/${s}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...products.map((p) => ({ url: `${base}/p/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.7, images: (p.images ?? []).slice(0, 5).map((i) => absImage(i)) })),
    { url: `${base}/lookbook`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/journal`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/look`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${base}/gift-cards`, changeFrequency: "monthly", priority: 0.5 },
    ...lookbooks.map((l) => ({ url: `${base}/lookbook/${l.slug}`, lastModified: l.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...posts.map((p) => ({ url: `${base}/journal/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "monthly" as const, priority: 0.5 })),
    ...looks.map((b) => ({ url: `${base}/look/${b.slug}`, lastModified: b.updatedAt, changeFrequency: "weekly" as const, priority: 0.5 })),
    ...help.map((h) => ({ url: `${base}/help/${h}`, changeFrequency: "yearly" as const, priority: 0.3 })),
  ];
}
