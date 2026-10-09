import "server-only";
// Renaming a product's URL slug without breaking anything: the old slug is kept on the product (old links
// 301-redirect, see /p/[slug]) and every stored reference moves to the new one.
// scripts/clean-slugs.mjs does the same updates in bulk; keep the two lists of collections in step.
import { db } from "./db";
import { Bundle, Lookbook, Order, Product, ReturnRequest, Review, Sale, StockAlert, User } from "./models";

export async function renameProductSlug(from: string, to: string) {
  if (!from || !to || from === to) return;
  await db();
  await Promise.all([
    Product.updateOne({ slug: to }, { $addToSet: { oldSlugs: from }, $pull: { oldSlugs: to } }),
    User.updateMany({ wishlist: from }, { $set: { "wishlist.$": to } }),
    User.updateMany({ "cart.slug": from }, { $set: { "cart.$[l].slug": to } }, { arrayFilters: [{ "l.slug": from }] }),
    Order.updateMany({ "items.slug": from }, { $set: { "items.$[l].slug": to } }, { arrayFilters: [{ "l.slug": from }] }),
    ReturnRequest.updateMany({ "items.slug": from }, { $set: { "items.$[l].slug": to } }, { arrayFilters: [{ "l.slug": from }] }),
    Review.updateMany({ productSlug: from }, { $set: { productSlug: to } }),
    StockAlert.updateMany({ productSlug: from }, { $set: { productSlug: to } }),
    Lookbook.updateMany({ productSlugs: from }, { $set: { "productSlugs.$": to } }),
    Bundle.updateMany({ productSlugs: from }, { $set: { "productSlugs.$": to } }),
    Sale.updateMany({ slugs: from }, { $set: { "slugs.$": to } }),
  ]);
}

/** Current slug for each old one that has been renamed (only the renamed ones are returned). */
export async function currentSlugsFor(slugs: string[]): Promise<Record<string, string>> {
  const list = [...new Set(slugs.filter((s) => typeof s === "string" && /^[a-z0-9-]{1,140}$/.test(s)))].slice(0, 300);
  if (!list.length) return {};
  await db();
  const docs = await Product.find({ oldSlugs: { $in: list } }, { slug: 1, oldSlugs: 1 }).lean<{ slug: string; oldSlugs?: string[] }[]>();
  const out: Record<string, string> = {};
  for (const d of docs) for (const old of d.oldSlugs ?? []) if (list.includes(old)) out[old] = d.slug;
  return out;
}
