"use server";
import { getListing, getProductsBySlugs, getRegion, listProducts, type ListingQuery } from "@/lib/queries";
import type { ProductDTO } from "@/lib/types";

const cleanSlugs = (slugs: unknown, max: number): string[] =>
  Array.isArray(slugs)
    ? [...new Set(slugs.filter((s): s is string => typeof s === "string" && /^[a-z0-9-]{1,120}$/.test(s)))].slice(0, max)
    : [];

/** Products for the wishlist page, in wishlist order. */
export async function getWishlistProducts(slugs: string[]): Promise<ProductDTO[]> {
  return getProductsBySlugs(cleanSlugs(slugs, 200));
}

/** Products for the "Recently viewed" rail, most recent first. */
export async function getRecentlyViewed(slugs: string[]): Promise<ProductDTO[]> {
  return getProductsBySlugs(cleanSlugs(slugs, 12));
}

/** Up to three products for the compare page, in the order they were picked. */
export async function getCompareProducts(slugs: string[]): Promise<ProductDTO[]> {
  return getProductsBySlugs(cleanSlugs(slugs, 3));
}

/** Next page of a listing for "Load more". */
export async function loadMoreProducts(query: ListingQuery): Promise<{ items: ProductDTO[]; page: number; pages: number; total: number }> {
  if (!query || typeof query.slug !== "string" || !(await getListing(query.slug))) return { items: [], page: 1, pages: 1, total: 0 };
  const region = await getRegion();
  const res = await listProducts(
    {
      slug: query.slug,
      q: typeof query.q === "string" ? query.q.slice(0, 80) : undefined,
      exact: query.exact === true,
      fabric: Array.isArray(query.fabric) ? query.fabric.map(String).slice(0, 20) : undefined,
      colour: Array.isArray(query.colour) ? query.colour.map(String).slice(0, 20) : undefined,
      occasion: Array.isArray(query.occasion) ? query.occasion.map(String).slice(0, 20) : undefined,
      size: typeof query.size === "string" ? query.size.slice(0, 20) : undefined,
      price: typeof query.price === "number" ? query.price : undefined,
      max: typeof query.max === "number" && query.max > 0 ? query.max : undefined,
      sort: query.sort,
      page: Math.max(1, Math.min(500, Math.floor(Number(query.page) || 1))),
    },
    region
  );
  return { items: res.items, page: res.page, pages: res.pages, total: res.total };
}
