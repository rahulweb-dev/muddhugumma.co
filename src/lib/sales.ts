import "server-only";
import { cache } from "react";
import { db } from "./db";
import { Sale, type SaleDoc } from "./models";
import type { ActiveSale } from "./pricing";

/** Timed sales running right now (server only, cached per request). Owner: catalogue & discovery. */
export const getActiveSales = cache(async (): Promise<ActiveSale[]> => {
  try {
    await db();
    const now = new Date();
    const docs = await Sale.find({ active: true, startsAt: { $lte: now }, endsAt: { $gt: now } }).sort({ endsAt: 1 }).lean<SaleDoc[]>();
    return docs
      .filter((s) => Number(s.percentOff) > 0 && Number(s.percentOff) < 100)
      .map((s) => ({
        id: String(s._id),
        name: s.name || "Sale",
        banner: s.banner ?? "",
        percentOff: Number(s.percentOff),
        categories: [...(s.categories ?? [])],
        collections: [...(s.collections ?? [])],
        slugs: [...(s.slugs ?? [])],
        regions: s.regions?.length ? [...s.regions] : ["in", "uk"],
        endsAt: new Date(s.endsAt).toISOString(),
      }));
  } catch (e) {
    console.error("[sales] could not load active sales", e);
    return [];
  }
});
