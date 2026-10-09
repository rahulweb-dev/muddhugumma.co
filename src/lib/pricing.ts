import type { Region } from "./region";
import type { Money, ProductDTO } from "./types";

/*
 * Effective selling price including any running timed sale. Owner: catalogue & discovery.
 * Safe for client and server: active sales are fetched on the server (getActiveSales in src/lib/sales.ts)
 * and passed in as plain data, so the checkout re-prices with exactly the same rule.
 *
 * Rule:
 *  - A sale applies to a product when the sale's regions include the region and the product matches its slugs,
 *    its categories or any of its collections. A sale with no slugs, categories or collections covers the whole store.
 *  - When several sales apply, the highest percentOff wins.
 *  - now = price.now × (1 − pct/100), rounded to whole rupees (INR) or to the penny (GBP).
 *  - mrp = the original mrp when set, otherwise the original price (so the card shows a strike-through).
 */

export type ActiveSale = { id: string; name: string; banner: string; percentOff: number; categories: string[]; collections: string[]; slugs: string[]; regions: string[]; endsAt: string };

function covers(s: ActiveSale, p: Pick<ProductDTO, "slug" | "category" | "collections">): boolean {
  const sitewide = !s.slugs.length && !s.categories.length && !s.collections.length;
  return sitewide || s.slugs.includes(p.slug) || s.categories.includes(p.category) || (p.collections ?? []).some((c) => s.collections.includes(c));
}

export function saleFor(p: Pick<ProductDTO, "slug" | "category" | "collections">, region: Region, sales: ActiveSale[]): ActiveSale | null {
  let best: ActiveSale | null = null;
  for (const s of sales) {
    if (!(s.percentOff > 0 && s.percentOff < 100)) continue;
    if (!s.regions.includes(region)) continue;
    if (!covers(s, p)) continue;
    if (!best || s.percentOff > best.percentOff) best = s;
  }
  return best;
}

const round = (n: number, region: Region) => (region === "in" ? Math.round(n) : Math.round(n * 100) / 100);

/** Price after sale. mrp stays the pre-sale reference so the card can show a strike-through. */
export function effectivePrice(p: Pick<ProductDTO, "slug" | "category" | "collections" | "price">, region: Region, sales: ActiveSale[]): Money & { sale: ActiveSale | null } {
  const base = p.price[region];
  const sale = saleFor(p, region, sales);
  if (!sale) return { now: base.now, mrp: base.mrp, sale: null };
  return { now: round(base.now * (1 - sale.percentOff / 100), region), mrp: base.mrp > 0 ? base.mrp : base.now, sale };
}

/** Both regions' prices after sales, in the shape stored on bag lines (display only; checkout re-prices on the server). */
export function salePrices(p: Pick<ProductDTO, "slug" | "category" | "collections" | "price">, sales: ActiveSale[]): Record<Region, Money> {
  const one = (r: Region): Money => {
    const { now, mrp } = effectivePrice(p, r, sales);
    return { now, mrp };
  };
  return { in: one("in"), uk: one("uk") };
}

/** Short tag for cards, e.g. "Diwali Sale −20%". */
export const saleTag = (s: ActiveSale) => `${s.name} −${s.percentOff}%`;
