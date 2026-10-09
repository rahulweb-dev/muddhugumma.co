import "server-only";
import { cookies, headers } from "next/headers";
import type { PipelineStage } from "mongoose";
import { db } from "./db";
import { Bundle, Lookbook, Post, Product, Review, User, type BundleDoc, type LookbookDoc, type PostDoc, type ProductDoc, type UserDoc } from "./models";
import type { ActiveSale } from "./pricing";
import { REGION_CONFIG, REGION_COOKIE, isRegion, type Region } from "./region";
import { getActiveSales } from "./sales";
import { analyseSearch, searchMatch, type ParsedSearch } from "./search";
import { categoryLabel, type ProductDTO, type ReviewDTO } from "./types";
import { activeCategories, getCategory } from "./categories";
import { tidyName } from "./seo";
import { stockFor, stockPath } from "./stock";

/** Region from cookie, else from the hosting platform's country header, else India. */
export async function getRegion(): Promise<Region> {
  const c = (await cookies()).get(REGION_COOKIE)?.value;
  if (isRegion(c)) return c;
  const h = await headers();
  const country = (h.get("x-vercel-ip-country") || h.get("cf-ipcountry") || "").toUpperCase();
  return country === "GB" ? "uk" : "in";
}

export function toDTO(p: ProductDoc, region: Region): ProductDTO {
  const stock = stockFor(p, region);
  return {
    id: String(p._id),
    slug: p.slug,
    name: tidyName(p.name),
    category: p.category,
    collections: [...(p.collections ?? [])],
    fabric: p.fabric ?? "",
    occasions: [...(p.occasions ?? [])],
    colour: p.colour,
    hex: p.hex ?? "#cccccc",
    images: [...(p.images ?? [])],
    price: {
      in: { now: p.price?.in?.now ?? 0, mrp: p.price?.in?.mrp ?? 0 },
      uk: { now: p.price?.uk?.now ?? 0, mrp: p.price?.uk?.mrp ?? 0 },
    },
    freeSize: !!p.freeSize,
    stock,
    tag: p.tag ?? "",
    origin: p.origin ?? "",
    craft: p.craft ?? "",
    description: p.description ?? "",
    details: [...(p.details ?? [])],
    care: p.care ?? "",
    rating: p.rating ?? 0,
    ratingCount: p.ratingCount ?? 0,
    active: p.active !== false,
    blouseOptions: p.blouseOptions ?? p.category === "sarees",
    createdAt: (p as unknown as { createdAt?: Date }).createdAt?.toISOString() ?? "",
  };
}

/** Product plus the fields only the product page needs. */
export type ProductFull = ProductDTO & { video: string; madeToOrder: boolean };

/* ---------- listing ---------- */
export type Listing = { title: string; kicker: string; blurb: string; match: Record<string, unknown>; image?: string };

/** Listings that are not a single category. Category listings come from the Category collection (Admin → Categories). */
export const SPECIAL_LISTINGS: Record<string, Listing> = {
  all: { title: "All styles", kicker: "The full house", blurb: "Every piece in the house.", match: {} },
  new: { title: "New in", kicker: "Just landed", blurb: "The latest pieces to arrive.", match: { collections: "new" } },
  bridal: { title: "The Bridal House", kicker: "Wedding season", blurb: "Pieces for the big day and every ceremony around it.", match: { collections: "bridal" } },
  festive: { title: "The Festive Edit", kicker: "Festive", blurb: "Pieces for festival days in India and abroad.", match: { collections: "festive" } },
  sale: { title: "Sale", kicker: "Limited time", blurb: "Marked-down pieces and everything in a running sale, at their best price of the season.", match: {} },
};

/** A listing by URL slug: a special edit, or an active category. */
export async function getListing(slug: string): Promise<Listing | null> {
  if (SPECIAL_LISTINGS[slug]) return SPECIAL_LISTINGS[slug];
  const c = await getCategory(slug);
  return c ? { title: c.name, kicker: c.kicker || "Shop", blurb: c.blurb, match: { category: c.slug }, image: c.image || undefined } : null;
}

export type ListingQuery = {
  slug: string;
  q?: string;
  /** Search the words exactly as typed (no spelling fixes). */
  exact?: boolean;
  fabric?: string[];
  colour?: string[];
  occasion?: string[];
  size?: string;
  price?: number; // index into REGION_CONFIG[region].priceBands
  max?: number; // "under" budget tiles
  sort?: "relevance" | "new" | "price-asc" | "price-desc" | "discount" | "rating";
  page?: number;
};

export const PAGE_SIZE = 12;

/* Sale-aware price fields computed inside MongoDB with the same rule as effectivePrice() in src/lib/pricing.ts:
 * salePct (best matching sale), eff (price after sale), effMrp (strike-through reference) and off (discount share). */
function priceStages(region: Region, sales: ActiveSale[]): PipelineStage[] {
  const pf = `$price.${region}`;
  const live = sales.filter((s) => s.regions.includes(region) && s.percentOff > 0 && s.percentOff < 100);
  const covers = (s: ActiveSale) =>
    !s.slugs.length && !s.categories.length && !s.collections.length
      ? true
      : {
          $or: [
            { $in: ["$slug", s.slugs] },
            { $in: ["$category", s.categories] },
            { $gt: [{ $size: { $setIntersection: [{ $ifNull: ["$collections", []] }, s.collections] } }, 0] },
          ],
        };
  return [
    { $addFields: { salePct: live.length ? { $max: [0, ...live.map((s) => ({ $cond: [covers(s), s.percentOff, 0] }))] } : 0 } },
    {
      $addFields: {
        eff: {
          $cond: [
            { $gt: ["$salePct", 0] },
            { $round: [{ $multiply: [`${pf}.now`, { $subtract: [1, { $divide: ["$salePct", 100] }] }] }, region === "in" ? 0 : 2] },
            `${pf}.now`,
          ],
        },
        effMrp: { $cond: [{ $gt: ["$salePct", 0] }, { $cond: [{ $gt: [`${pf}.mrp`, 0] }, `${pf}.mrp`, `${pf}.now`] }, { $ifNull: [`${pf}.mrp`, 0] }] },
      },
    },
    { $addFields: { off: { $cond: [{ $gt: ["$effMrp", "$eff"] }, { $subtract: [1, { $divide: ["$eff", "$effMrp"] }] }, 0] } } },
  ];
}

/** Products in a listing, with filters, sort, pagination and facet counts. Prices, price filters and sorting include running sales. */
export async function listProducts(query: ListingQuery, region: Region): Promise<{
  items: ProductDTO[];
  total: number;
  page: number;
  pages: number;
  facets: { fabric: { value: string; count: number }[]; colour: { value: string; count: number }[]; occasion: { value: string; count: number }[] };
  search: ParsedSearch | null;
}> {
  await db();
  const sales = await getActiveSales();
  const search = query.q ? await analyseSearch(query.q, region, { exact: !!query.exact }) : null;

  const pre: PipelineStage[] = [
    { $match: { active: true, ...(SPECIAL_LISTINGS[query.slug]?.match ?? { category: query.slug }), ...(search ? searchMatch(search) : {}) } },
    ...priceStages(region, sales),
  ];
  // The sale listing shows marked-down pieces and everything covered by a running sale.
  if (query.slug === "sale") pre.push({ $match: { $expr: { $gt: ["$effMrp", "$eff"] } } });
  if (search && (search.min !== undefined || search.max !== undefined)) {
    pre.push({ $match: { eff: { ...(search.min !== undefined ? { $gte: search.min } : {}), ...(search.max !== undefined ? { $lte: search.max } : {}) } } });
  }

  const filters: Record<string, unknown>[] = [];
  if (query.fabric?.length) filters.push({ fabric: { $in: query.fabric } });
  if (query.colour?.length) filters.push({ colour: { $in: query.colour } });
  if (query.occasion?.length) filters.push({ occasions: { $in: query.occasion } });
  if (query.size) filters.push({ $or: [{ freeSize: true }, { [stockPath(region, query.size)]: { $gt: 0 } }] });
  const band = query.price !== undefined ? REGION_CONFIG[region].priceBands[query.price] : undefined;
  if (band) filters.push({ eff: { $gte: band.min, $lt: band.max } });
  if (query.max) filters.push({ eff: { $lt: query.max } });

  const sortStage: Record<string, 1 | -1> =
    query.sort === "new" ? { createdAt: -1 } :
    query.sort === "price-asc" ? { eff: 1 } :
    query.sort === "price-desc" ? { eff: -1 } :
    query.sort === "discount" ? { off: -1, eff: 1 } :
    query.sort === "rating" ? { rating: -1, ratingCount: -1 } :
    { ratingCount: -1, rating: -1 };

  const page = Math.max(1, query.page ?? 1);
  const [res] = await Product.aggregate<{ items: ProductDoc[]; total: { n: number }[] }>([
    ...pre,
    ...(filters.length ? [{ $match: { $and: filters } }] : []),
    { $sort: { ...sortStage, _id: 1 } },
    { $facet: { items: [{ $skip: (page - 1) * PAGE_SIZE }, { $limit: PAGE_SIZE }], total: [{ $count: "n" }] } },
  ]);

  // Facet counts are taken over the listing (before user filters) so options never disappear.
  const [facets] = await Product.aggregate<{ fabric: { _id: string; n: number }[]; colour: { _id: string; n: number }[]; occasion: { _id: string; n: number }[] }>([
    ...pre,
    {
      $facet: {
        fabric: [{ $group: { _id: "$fabric", n: { $sum: 1 } } }, { $sort: { _id: 1 } }],
        colour: [{ $group: { _id: "$colour", n: { $sum: 1 } } }, { $sort: { _id: 1 } }],
        occasion: [{ $unwind: "$occasions" }, { $group: { _id: "$occasions", n: { $sum: 1 } } }, { $sort: { _id: 1 } }],
      },
    },
  ]);

  const total = res.total[0]?.n ?? 0;
  return {
    items: res.items.map((d) => toDTO(d, region)),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    facets: {
      // Products without a fabric or colour (e.g. jewellery) are not a filter option.
      fabric: facets.fabric.filter((f) => f._id).map((f) => ({ value: f._id, count: f.n })),
      colour: facets.colour.filter((f) => f._id).map((f) => ({ value: f._id, count: f.n })),
      occasion: facets.occasion.filter((f) => f._id).map((f) => ({ value: f._id, count: f.n })),
    },
    search,
  };
}

/* ---------- search suggestions (header autocomplete) ---------- */
export type Suggestion = {
  products: { slug: string; name: string; image: string; price: number; mrp: number; sale: string; category: string }[];
  links: { label: string; href: string; note?: string }[];
  correction: string | null;
};

export async function searchSuggest(q: string, region: Region): Promise<Suggestion> {
  const text = q.trim().slice(0, 80);
  if (text.length < 2) return { products: [], links: [], correction: null };
  await db();
  const [search, sales] = await Promise.all([analyseSearch(text, region), getActiveSales()]);
  const stages: PipelineStage[] = [{ $match: { active: true, ...searchMatch(search) } }, ...priceStages(region, sales)];
  if (search.min !== undefined || search.max !== undefined)
    stages.push({ $match: { eff: { ...(search.min !== undefined ? { $gte: search.min } : {}), ...(search.max !== undefined ? { $lte: search.max } : {}) } } });
  const docs = await Product.aggregate<ProductDoc & { eff: number; effMrp: number; salePct: number }>([
    ...stages,
    { $sort: { ratingCount: -1, rating: -1, _id: 1 } },
    { $limit: 6 },
    { $project: { slug: 1, name: 1, images: 1, category: 1, eff: 1, effMrp: 1, salePct: 1 } },
  ]);
  const saleName = (pct: number) => (pct > 0 ? sales.find((s) => s.percentOff === pct)?.name ?? "Sale" : "");

  const links: Suggestion["links"] = [];
  const add = (label: string, href: string, note?: string) => {
    if (links.length < 5 && !links.some((l) => l.href === href)) links.push({ label, href, note });
  };
  const fabricParam = search.fabrics.length === 1 ? `?fabric=${encodeURIComponent(search.fabrics[0][0].toUpperCase() + search.fabrics[0].slice(1))}` : "";
  for (const c of search.categories) add(search.fabrics.length === 1 ? `${search.fabrics[0][0].toUpperCase()}${search.fabrics[0].slice(1)} ${categoryLabel(c).toLowerCase()}` : categoryLabel(c), `/c/${c}${fabricParam}`, "Category");
  if (search.occasions.includes("wedding")) add("The Bridal House", "/c/bridal", "Edit");
  if (search.occasions.includes("festive")) add("The Festive Edit", "/c/festive", "Edit");
  for (const c of search.concepts) add(c.label, `/search?q=${encodeURIComponent(c.label)}`, "Craft");
  const lower = text.toLowerCase();
  const listings: [string, string][] = [
    ...Object.entries(SPECIAL_LISTINGS).map(([slug, l]): [string, string] => [slug, l.title]),
    ...(await activeCategories()).map((c): [string, string] => [c.slug, c.name]),
  ];
  for (const [slug, title] of listings) {
    if (title.toLowerCase().split(/\s+/).some((w) => w.startsWith(lower)) || title.toLowerCase().startsWith(lower)) add(title, `/c/${slug}`, "Shop");
  }
  if (!search.categories.length && (search.fabrics.length || search.colours.length)) {
    const qs = new URLSearchParams();
    if (search.colours.length) qs.set("colour", search.colours.join(","));
    if (search.fabrics.length === 1) qs.set("fabric", search.fabrics[0][0].toUpperCase() + search.fabrics[0].slice(1));
    add(`All ${[...search.colours, ...search.fabrics].join(" ")} styles`, `/c/all?${qs.toString()}`, "Shop");
  }

  return {
    products: docs.map((d) => ({
      slug: d.slug,
      name: d.name,
      image: d.images?.[0] ?? "",
      price: d.eff,
      mrp: d.effMrp > d.eff ? d.effMrp : 0,
      sale: saleName(d.salePct),
      category: d.category ? categoryLabel(d.category) : "",
    })),
    links,
    correction: search.corrected ? search.query : null,
  };
}

/* ---------- products (stock is for the shopper's region) ---------- */
export async function getProducts(filter: Record<string, unknown> = {}, limit = 8, sort: Record<string, 1 | -1> = { ratingCount: -1 }) {
  await db();
  const [docs, region] = await Promise.all([Product.find({ active: true, ...filter }).sort(sort).limit(limit).lean<ProductDoc[]>(), getRegion()]);
  return docs.map((d) => toDTO(d, region));
}

export async function getProductsBySlugs(slugs: string[]) {
  if (!slugs.length) return [];
  await db();
  const [docs, region] = await Promise.all([Product.find({ slug: { $in: slugs }, active: true }).lean<ProductDoc[]>(), getRegion()]);
  return slugs.map((s) => docs.find((d) => d.slug === s)).filter(Boolean).map((d) => toDTO(d!, region));
}

export async function getProduct(slug: string): Promise<ProductFull | null> {
  await db();
  const [doc, region] = await Promise.all([Product.findOne({ slug, active: true }).lean<ProductDoc>(), getRegion()]);
  return doc ? { ...toDTO(doc, region), video: doc.video ?? "", madeToOrder: !!doc.madeToOrder } : null;
}

export async function getRelated(p: ProductDTO, limit = 4) {
  return getProducts({ slug: { $ne: p.slug }, category: p.category }, limit);
}

/** Pieces from other categories that share an occasion: "complete the look". */
export async function getCompleteTheLook(p: ProductDTO, limit = 4) {
  return getProducts({ slug: { $ne: p.slug }, category: { $ne: p.category }, occasions: { $in: p.occasions } }, limit);
}

/* ---------- reviews ---------- */
export type ReviewWithPhotos = ReviewDTO & { images: string[] };

/** Approved reviews only (older reviews without a status count as approved). */
export async function getReviews(slug: string): Promise<ReviewWithPhotos[]> {
  await db();
  const docs = await Review.find({ productSlug: slug, status: { $in: ["approved", null] } }).sort({ createdAt: -1 }).limit(30).lean();
  return docs.map((r) => ({
    id: String(r._id),
    name: r.name ?? "Customer",
    city: r.city ?? "",
    rating: r.rating,
    title: r.title ?? "",
    body: r.body ?? "",
    verified: !!r.verified,
    date: (r as unknown as { createdAt?: Date }).createdAt?.toISOString() ?? "",
    images: [...(r.images ?? [])].filter((i) => typeof i === "string" && i).slice(0, 3),
  }));
}

/* ---------- shop the look (bundles) ---------- */
export type BundleDTO = { slug: string; name: string; description: string; image: string; productSlugs: string[] };
const bundleDTO = (b: BundleDoc): BundleDTO => ({ slug: b.slug, name: b.name ?? "", description: b.description ?? "", image: b.image ?? "", productSlugs: [...(b.productSlugs ?? [])] });

export async function listBundles(): Promise<BundleDTO[]> {
  await db();
  return (await Bundle.find({ active: true }).sort({ createdAt: -1 }).limit(24).lean<BundleDoc[]>()).map(bundleDTO);
}

export async function getBundle(slug: string): Promise<BundleDTO | null> {
  await db();
  const b = await Bundle.findOne({ slug, active: true }).lean<BundleDoc>();
  return b ? bundleDTO(b) : null;
}

export async function getBundlesForProduct(slug: string): Promise<BundleDTO[]> {
  await db();
  return (await Bundle.find({ active: true, productSlugs: slug }).limit(4).lean<BundleDoc[]>()).map(bundleDTO);
}

/* ---------- lookbooks and journal ---------- */
export type LookbookDTO = { slug: string; title: string; festival: string; intro: string; hero: string; productSlugs: string[] };
const lookbookDTO = (l: LookbookDoc): LookbookDTO => ({ slug: l.slug, title: l.title ?? "", festival: l.festival ?? "", intro: l.intro ?? "", hero: l.hero ?? "", productSlugs: [...(l.productSlugs ?? [])] });

export async function listLookbooks(): Promise<LookbookDTO[]> {
  await db();
  return (await Lookbook.find({ active: true }).sort({ sort: 1, createdAt: -1 }).limit(50).lean<LookbookDoc[]>()).map(lookbookDTO);
}

export async function getLookbook(slug: string): Promise<LookbookDTO | null> {
  await db();
  const l = await Lookbook.findOne({ slug, active: true }).lean<LookbookDoc>();
  return l ? lookbookDTO(l) : null;
}

export type PostDTO = { slug: string; title: string; excerpt: string; body: string; cover: string; tags: string[]; author: string; publishedAt: string };
const postDTO = (p: PostDoc): PostDTO => ({
  slug: p.slug,
  title: p.title ?? "",
  excerpt: p.excerpt ?? "",
  body: p.body ?? "",
  cover: p.cover ?? "",
  tags: [...(p.tags ?? [])],
  author: p.author ?? "House of Muddhugumma",
  publishedAt: (p.publishedAt ?? p.createdAt)?.toISOString() ?? "",
});

/** Published posts, newest first (posts scheduled for the future stay hidden). */
export async function listPosts(limit = 30): Promise<PostDTO[]> {
  await db();
  const docs = await Post.find({ status: "published", $or: [{ publishedAt: { $lte: new Date() } }, { publishedAt: null }] }, { body: 0 })
    .sort({ publishedAt: -1, createdAt: -1 })
    .limit(limit)
    .lean<PostDoc[]>();
  return docs.map(postDTO);
}

export async function getPost(slug: string): Promise<PostDTO | null> {
  await db();
  const p = await Post.findOne({ slug, status: "published", $or: [{ publishedAt: { $lte: new Date() } }, { publishedAt: null }] }).lean<PostDoc>();
  return p ? postDTO(p) : null;
}

/* ---------- fit ---------- */
export type Measurements = { bust?: number; waist?: number; hip?: number; usualSize?: string; brand?: string; brandSize?: string };

/** Saved body measurements (inches) for the size finder. */
export async function getMeasurements(uid: string): Promise<Measurements | null> {
  await db();
  const u = await User.findById(uid, { measurements: 1 }).lean<Pick<UserDoc, "measurements">>().catch(() => null);
  const m = u?.measurements;
  if (!m) return null;
  const brands = m.brandSizes instanceof Map ? Object.fromEntries(m.brandSizes) : ((m.brandSizes as Record<string, string> | undefined) ?? {});
  const [brand, brandSize] = Object.entries(brands)[0] ?? [];
  const out: Measurements = { bust: m.bust || undefined, waist: m.waist || undefined, hip: m.hip || undefined, usualSize: m.usualSize || undefined, brand, brandSize };
  return out.bust || out.waist || out.hip || out.usualSize || out.brand ? out : null;
}

/* ---------- feeds ---------- */
export async function getFeedProducts(region: Region): Promise<(ProductDTO & { video: string })[]> {
  await db();
  const docs = await Product.find({ active: true }).sort({ createdAt: -1 }).limit(5000).lean<ProductDoc[]>();
  return docs.map((d) => ({ ...toDTO(d, region), video: d.video ?? "" }));
}
