// Listing filter state shared by server pages and client controls: parse searchParams, build URLs, label chips.
import { REGION_CONFIG, canonicalSize, type Region } from "@/lib/region";
import type { ListingQuery } from "@/lib/queries";

export type SortKey = NonNullable<ListingQuery["sort"]>;

export const SORTS: { value: SortKey; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "new", label: "New arrivals" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "discount", label: "Biggest discount" },
  { value: "rating", label: "Customer rating" },
];
const SORT_KEYS = SORTS.map((s) => s.value);

export type FilterState = {
  q?: string;
  /** Search the words exactly as typed (no spelling fixes). */
  exact?: boolean;
  fabric: string[];
  colour: string[];
  occasion: string[];
  size?: string;
  price?: number;
  max?: number;
  sort?: SortKey;
  page?: number;
};

export type RawParams = Record<string, string | string[] | undefined>;

export type Facet = { value: string; count: number };
export type Facets = { fabric: Facet[]; colour: Facet[]; occasion: Facet[] };

export const EMPTY_FILTERS: FilterState = { fabric: [], colour: [], occasion: [] };

export type ListingLink = { slug: string; label: string };

/** Sidebar / filter-sheet shortcuts: the two edits, every active category, then the sale. */
export const listingLinks = (cats: { slug: string; name: string }[]): ListingLink[] => [
  { slug: "all", label: "All styles" },
  { slug: "new", label: "New in" },
  ...cats.map((c) => ({ slug: c.slug, label: c.name })),
  { slug: "sale", label: "Sale" },
];

/** Swatch colours for the colour facet (catalogue colours are plain names). */
export const COLOUR_HEX: Record<string, string> = {
  red: "#A3162C",
  maroon: "#6B1426",
  pink: "#D8457F",
  purple: "#6E2450",
  orange: "#D9532B",
  yellow: "#E2B53E",
  gold: "#C9A36B",
  ivory: "#F4EEE4",
  white: "#FFFFFF",
  cream: "#F2E9D2",
  beige: "#D9C7A7",
  green: "#2F6B45",
  mint: "#BFDCCB",
  teal: "#1F6F6B",
  blue: "#2E4E7A",
  navy: "#1E2C5C",
  black: "#1B1A18",
  grey: "#9C958A",
  brown: "#5B3A22",
  multi: "conic-gradient(#A3162C,#E2B53E,#2F6B45,#2E4E7A,#A3162C)",
};
export const swatch = (colour: string) => COLOUR_HEX[colour.toLowerCase()] ?? "#cccccc";

export const titleCase = (s: string) => s.replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());

const list = (v: string | string[] | undefined) =>
  [...new Set((Array.isArray(v) ? v : v ? [v] : []).flatMap((x) => x.split(",")).map((x) => x.trim()).filter((x) => x && x.length < 60))].slice(0, 20);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

const ALL_SIZES = [...REGION_CONFIG.in.sizes, ...REGION_CONFIG.uk.sizes];

export function parseFilters(sp: RawParams, region: Region): FilterState {
  const state: FilterState = { fabric: list(sp.fabric), colour: list(sp.colour), occasion: list(sp.occasion) };
  const q = one(sp.q);
  if (q) state.q = q.slice(0, 80);
  if (q && one(sp.exact) === "1") state.exact = true;
  const size = one(sp.size);
  if (size && ALL_SIZES.includes(size)) state.size = size;
  const price = Number(one(sp.price));
  if (one(sp.price) !== undefined && Number.isInteger(price) && price >= 0 && price < REGION_CONFIG[region].priceBands.length) state.price = price;
  const max = Number(one(sp.max));
  if (Number.isFinite(max) && max > 0) state.max = max;
  const sort = one(sp.sort) as SortKey | undefined;
  if (sort && SORT_KEYS.includes(sort)) state.sort = sort;
  const page = Number(one(sp.page));
  if (Number.isInteger(page) && page > 1) state.page = Math.min(page, 500);
  return state;
}

export function toListingQuery(slug: string, s: FilterState): ListingQuery {
  return {
    slug,
    q: s.q,
    exact: s.exact || undefined,
    fabric: s.fabric,
    colour: s.colour,
    occasion: s.occasion,
    size: s.size ? canonicalSize(s.size) : undefined,
    price: s.price,
    max: s.max,
    sort: s.sort,
    page: s.page,
  };
}

export function toParams(s: FilterState): [string, string][] {
  const out: [string, string][] = [];
  if (s.q) out.push(["q", s.q]);
  if (s.q && s.exact) out.push(["exact", "1"]);
  if (s.fabric.length) out.push(["fabric", s.fabric.join(",")]);
  if (s.colour.length) out.push(["colour", s.colour.join(",")]);
  if (s.occasion.length) out.push(["occasion", s.occasion.join(",")]);
  if (s.size) out.push(["size", s.size]);
  if (s.price !== undefined) out.push(["price", String(s.price)]);
  if (s.max) out.push(["max", String(s.max)]);
  if (s.sort && s.sort !== "relevance") out.push(["sort", s.sort]);
  if (s.page && s.page > 1) out.push(["page", String(s.page)]);
  return out;
}

/** URL for the listing with a patch applied. Any change other than `page` goes back to page 1. */
export function hrefWith(base: string, s: FilterState, patch: Partial<FilterState> = {}): string {
  const next: FilterState = { ...s, page: undefined, ...patch };
  const qs = new URLSearchParams(toParams(next)).toString();
  return qs ? `${base}?${qs}` : base;
}

export const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export const filterCount = (s: FilterState) =>
  s.fabric.length + s.colour.length + s.occasion.length + (s.size ? 1 : 0) + (s.price !== undefined ? 1 : 0) + (s.max ? 1 : 0);

/** Applied filters as removable chips. */
export function appliedChips(base: string, s: FilterState, region: Region): { key: string; label: string; href: string }[] {
  const chips: { key: string; label: string; href: string }[] = [];
  for (const k of ["fabric", "colour", "occasion"] as const)
    for (const v of s[k]) chips.push({ key: `${k}:${v}`, label: titleCase(v), href: hrefWith(base, s, { [k]: s[k].filter((x) => x !== v) }) });
  if (s.size) chips.push({ key: "size", label: `Size ${s.size}`, href: hrefWith(base, s, { size: undefined }) });
  if (s.price !== undefined) chips.push({ key: "price", label: REGION_CONFIG[region].priceBands[s.price].label, href: hrefWith(base, s, { price: undefined }) });
  if (s.max) {
    const cur = new Intl.NumberFormat(REGION_CONFIG[region].locale, { style: "currency", currency: REGION_CONFIG[region].currency, maximumFractionDigits: 0 }).format(s.max);
    chips.push({ key: "max", label: `Under ${cur}`, href: hrefWith(base, s, { max: undefined }) });
  }
  return chips;
}

/** Same listing with every filter removed (keeps search text and sort). */
export const clearedHref = (base: string, s: FilterState) => hrefWith(base, { ...EMPTY_FILTERS, q: s.q, exact: s.exact, sort: s.sort });
