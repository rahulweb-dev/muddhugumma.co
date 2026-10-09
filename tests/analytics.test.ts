import { describe, expect, it } from "vitest";
import { META_EVENT, itemFromProduct, metaParams, parseConsent, serializeConsent, track } from "@/lib/analytics";

describe("consent cookie", () => {
  it("round-trips every combination", () => {
    for (const analytics of [true, false]) for (const marketing of [true, false]) expect(parseConsent(serializeConsent({ analytics, marketing }))).toEqual({ analytics, marketing });
  });
  it("treats missing or unknown values as undecided", () => {
    expect(parseConsent(undefined)).toBeNull();
    expect(parseConsent("")).toBeNull();
    expect(parseConsent("v0.a1.m1")).toBeNull();
    expect(parseConsent("yes")).toBeNull();
  });
});

describe("events", () => {
  it("maps GA4 events to Meta standard events", () => {
    expect(META_EVENT.view_item).toBe("ViewContent");
    expect(META_EVENT.add_to_cart).toBe("AddToCart");
    expect(META_EVENT.begin_checkout).toBe("InitiateCheckout");
    expect(META_EVENT.purchase).toBe("Purchase");
    expect(META_EVENT.search).toBe("Search");
    expect(META_EVENT.sign_up).toBe("CompleteRegistration");
    expect(META_EVENT.add_to_wishlist).toBe("AddToWishlist");
  });
  it("turns GA4 items into Meta contents", () => {
    const item = itemFromProduct({ slug: "kanchi", name: "Kanchi silk", category: "sarees", price: { in: { now: 9000, mrp: 10000 }, uk: { now: 110, mrp: 0 } } }, "in", { size: "Free size", quantity: 2 });
    expect(item).toMatchObject({ item_id: "kanchi", price: 9000, quantity: 2, discount: 1000, item_variant: "Free size" });
    const p = metaParams("add_to_cart", { currency: "INR", value: 18000, items: [item] });
    expect(p).toMatchObject({ currency: "INR", value: 18000, content_ids: ["kanchi"], content_type: "product", num_items: 2, content_name: "Kanchi silk" });
    expect(metaParams("search", { search_term: "banarasi" })).toEqual({ search_string: "banarasi" });
  });
  it("does nothing on the server", () => {
    expect(() => track("purchase", { value: 1 })).not.toThrow();
  });
});
