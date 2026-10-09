// India and the UK hold separate stock. India's counts live in `stock` (the original field), the UK's in `stockUk`.
// Both are keyed by the canonical size (XS … XXL, "Free size"); UK 6–16 map onto those keys via canonicalSize().
import type { Region } from "./region";

export const REGIONS: Region[] = ["in", "uk"];

/** Product field holding a region's stock. */
export const stockField = (region: Region) => (region === "uk" ? "stockUk" : "stock");

/** Dotted path for a Mongo filter or $inc on one size, e.g. "stockUk.M". */
export const stockPath = (region: Region, size: string) => `${stockField(region)}.${size}`;

/** Plain size → qty record from a Mongoose Map, lean object or nothing. */
export const plainStock = (s: unknown): Record<string, number> => (s instanceof Map ? Object.fromEntries(s) : ((s as Record<string, number>) ?? {}));

/** A product's stock for one region. */
export const stockFor = (p: { stock?: unknown; stockUk?: unknown }, region: Region) => plainStock(region === "uk" ? p.stockUk : p.stock);
