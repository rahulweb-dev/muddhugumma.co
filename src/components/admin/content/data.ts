import "server-only";
import { db } from "@/lib/db";
import { Product } from "@/lib/models";
import type { PickedProduct } from "./shared";

/* Server-only helpers for the content & merchandising admin pages and actions. */

type LeanPick = { slug: string; name: string; images?: string[]; active?: boolean };

/** Products for the given slugs in the same order; unknown slugs come back flagged as missing. */
export async function pickedProducts(slugs: string[]): Promise<PickedProduct[]> {
  if (!slugs.length) return [];
  await db();
  const rows = await Product.find({ slug: { $in: slugs } }, { slug: 1, name: 1, images: 1, active: 1 }).lean<LeanPick[]>();
  const by = new Map(rows.map((r) => [r.slug, r]));
  return slugs.map((slug) => {
    const r = by.get(slug);
    return r
      ? { slug, name: r.name, image: r.images?.[0] ?? "", active: r.active !== false }
      : { slug, name: `${slug} (no longer in the catalogue)`, image: "", active: false, missing: true };
  });
}

/* ---------- timed sales ---------- */
export type SaleLike = {
  id: string;
  name: string;
  categories: string[];
  collections: string[];
  slugs: string[];
  regions: string[];
  startsAt: Date | string;
  endsAt: Date | string;
  active: boolean;
};

export type SaleState = "off" | "scheduled" | "running" | "ended";

export function saleState(s: Pick<SaleLike, "active" | "startsAt" | "endsAt">, now = Date.now()): SaleState {
  const start = new Date(s.startsAt).getTime();
  const end = new Date(s.endsAt).getTime();
  if (end <= now) return "ended";
  if (!s.active) return "off";
  return start > now ? "scheduled" : "running";
}

type CatalogueRow = { slug: string; category: string; collections?: string[] };

const targets = (s: SaleLike, catalogue: CatalogueRow[]) =>
  new Set(
    catalogue
      .filter((p) => s.categories.includes(p.category) || (p.collections ?? []).some((c) => s.collections.includes(c)) || s.slugs.includes(p.slug))
      .map((p) => p.slug)
  );

/**
 * For each active, not-yet-ended sale: the other sales that run at the same time, in a shared region,
 * on at least one of the same products. Map of sale id → readable warnings.
 */
export async function saleOverlaps(sales: SaleLike[], now = Date.now()): Promise<Map<string, string[]>> {
  const live = sales.filter((s) => s.active && new Date(s.endsAt).getTime() > now);
  const out = new Map<string, string[]>();
  if (live.length < 2) return out;
  await db();
  const catalogue = await Product.find({}, { slug: 1, category: 1, collections: 1 }).lean<CatalogueRow[]>();
  const sets = new Map(live.map((s) => [s.id, targets(s, catalogue)]));
  for (const a of live) {
    for (const b of live) {
      if (a.id === b.id) continue;
      const timeOverlap = new Date(a.startsAt).getTime() < new Date(b.endsAt).getTime() && new Date(b.startsAt).getTime() < new Date(a.endsAt).getTime();
      if (!timeOverlap) continue;
      const regions = a.regions.filter((r) => b.regions.includes(r));
      if (!regions.length) continue;
      const sa = sets.get(a.id)!;
      const shared = [...sets.get(b.id)!].filter((slug) => sa.has(slug));
      if (!shared.length) continue;
      const list = out.get(a.id) ?? [];
      list.push(`Overlaps "${b.name}" on ${shared.length} product${shared.length === 1 ? "" : "s"} (${regions.map((r) => (r === "uk" ? "UK" : "India")).join(", ")}).`);
      out.set(a.id, list);
    }
  }
  return out;
}
