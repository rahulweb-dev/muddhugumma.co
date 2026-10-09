import { describe, expect, it } from "vitest";
import { effectivePrice, saleFor, type ActiveSale } from "@/lib/pricing";

/*
 * The one rule for sale prices (cards, PDP and checkout):
 *  - a sale matches a product by slug, category or collection, and only in the regions listed on the sale;
 *  - when several match, the highest percentage wins;
 *  - INR rounds to whole rupees, GBP to 2 decimals;
 *  - mrp is the product's original mrp if set, otherwise its original price; with no sale the price is unchanged.
 */

const sale = (over: Partial<ActiveSale>): ActiveSale => ({
  id: over.id ?? "s",
  name: over.name ?? "TEST sale",
  banner: "",
  percentOff: 10,
  categories: [],
  collections: [],
  slugs: [],
  regions: ["in", "uk"],
  endsAt: "2099-01-01T00:00:00.000Z",
  ...over,
});

const saree = {
  slug: "test-kanchi-silk",
  category: "sarees" as const,
  collections: ["festive", "bridal"],
  price: { in: { now: 12999, mrp: 15999 }, uk: { now: 159.99, mrp: 0 } },
};
const kurta = { slug: "test-chikan-kurta", category: "kurta-sets" as const, collections: ["everyday"], price: { in: { now: 2499, mrp: 0 }, uk: { now: 33, mrp: 0 } } };

describe("saleFor", () => {
  it("returns null when nothing is running", () => {
    expect(saleFor(saree, "in", [])).toBeNull();
  });
  it("matches by slug, category or collection", () => {
    expect(saleFor(saree, "in", [sale({ id: "a", slugs: ["test-kanchi-silk"] })])?.id).toBe("a");
    expect(saleFor(saree, "in", [sale({ id: "b", categories: ["sarees"] })])?.id).toBe("b");
    expect(saleFor(saree, "in", [sale({ id: "c", collections: ["bridal"] })])?.id).toBe("c");
  });
  it("ignores sales for other products", () => {
    const s = [sale({ categories: ["lehengas"], collections: ["office"], slugs: ["other"] })];
    expect(saleFor(saree, "in", s)).toBeNull();
    expect(saleFor(kurta, "uk", s)).toBeNull();
  });
  it("only applies in the sale's regions", () => {
    const ukOnly = [sale({ id: "uk", categories: ["sarees"], regions: ["uk"] })];
    expect(saleFor(saree, "in", ukOnly)).toBeNull();
    expect(saleFor(saree, "uk", ukOnly)?.id).toBe("uk");
  });
  it("picks the highest percentage when several match", () => {
    const s = [sale({ id: "low", percentOff: 10, categories: ["sarees"] }), sale({ id: "high", percentOff: 25, collections: ["festive"] }), sale({ id: "mid", percentOff: 15, slugs: ["test-kanchi-silk"] })];
    expect(saleFor(saree, "in", s)?.id).toBe("high");
  });
  it("skips a bigger sale that is not valid in the region", () => {
    const s = [sale({ id: "in20", percentOff: 20, categories: ["sarees"], regions: ["in"] }), sale({ id: "all10", percentOff: 10, categories: ["sarees"] })];
    expect(saleFor(saree, "uk", s)?.id).toBe("all10");
  });
});

describe("effectivePrice", () => {
  it("leaves the price alone without a sale", () => {
    const p = effectivePrice(saree, "in", []);
    expect(p.now).toBe(12999);
    expect(p.mrp).toBe(15999);
    expect(p.sale).toBeNull();
  });
  it("takes the percentage off the original price and rounds rupees to whole numbers", () => {
    const p = effectivePrice(saree, "in", [sale({ id: "d", percentOff: 15, categories: ["sarees"] })]);
    expect(p.now).toBe(11049); // 12999 × 0.85 = 11049.15
    expect(Number.isInteger(p.now)).toBe(true);
    expect(p.sale?.id).toBe("d");
  });
  it("rounds pounds to pence", () => {
    const p = effectivePrice(saree, "uk", [sale({ percentOff: 15, categories: ["sarees"] })]);
    expect(p.now).toBe(135.99); // 159.99 × 0.85 = 135.9915
  });
  it("keeps the original mrp as the strike-through when one is set", () => {
    const p = effectivePrice(saree, "in", [sale({ percentOff: 10, categories: ["sarees"] })]);
    expect(p.mrp).toBe(15999);
  });
  it("uses the original price as the strike-through when there is no mrp", () => {
    const p = effectivePrice(kurta, "in", [sale({ percentOff: 20, collections: ["everyday"] })]);
    expect(p.now).toBe(1999); // 2499 × 0.8 = 1999.2
    expect(p.mrp).toBe(2499);
    const u = effectivePrice(saree, "uk", [sale({ percentOff: 10, slugs: ["test-kanchi-silk"] })]);
    expect(u.mrp).toBe(159.99);
  });
  it("uses the best matching sale", () => {
    const p = effectivePrice(kurta, "uk", [sale({ percentOff: 10, categories: ["kurta-sets"] }), sale({ percentOff: 30, slugs: ["test-chikan-kurta"] })]);
    expect(p.now).toBe(23.1); // 33 × 0.7
  });
});
