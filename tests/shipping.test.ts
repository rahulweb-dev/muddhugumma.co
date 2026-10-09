import { describe, expect, it } from "vitest";
import { COURIERS, courierById, courierName, trackingLink } from "@/lib/shipping";

describe("trackingLink", () => {
  it("prefers the link the admin pasted", () => {
    expect(trackingLink("delhivery", "123", "https://example.com/t/123")).toBe("https://example.com/t/123");
    expect(trackingLink(undefined, undefined, "https://example.com/x")).toBe("https://example.com/x");
  });
  it("uses the courier's deep link when there is an AWB", () => {
    expect(trackingLink("delhivery", "DL123")).toBe("https://www.delhivery.com/track-v2/package/DL123");
    expect(trackingLink("royalmail", "AB123456789GB")).toBe("https://www.royalmail.com/track-your-item#/tracking-results/AB123456789GB");
    expect(trackingLink("bluedart", "777")).toBe("https://www.bluedart.com/web/guest/trackdartresult?trackFor=0&trackNo=777");
  });
  it("returns nothing without an AWB, for unknown couriers, or for couriers without a link", () => {
    expect(trackingLink("delhivery", "")).toBe("");
    expect(trackingLink("delhivery")).toBe("");
    expect(trackingLink("not-a-courier", "123")).toBe("");
    expect(trackingLink("other", "123")).toBe("");
  });
  it("falls back to the courier's generic page when it has no deep link", () => {
    expect(trackingLink("dtdc", "D1")).toBe("https://www.dtdc.com/track-your-shipment/");
  });
  it("URL-encodes the AWB", () => {
    expect(trackingLink("fedex", "12 34/5")).toBe("https://www.fedex.com/fedextrack/?trknbr=12%2034%2F5");
  });
});

describe("couriers", () => {
  it("has unique ids and a region for each", () => {
    const ids = COURIERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of COURIERS) expect(c.regions.length).toBeGreaterThan(0);
  });
  it("every courier link is https", () => {
    for (const c of COURIERS) {
      const u = c.url("AWB1");
      if (u) expect(u.startsWith("https://")).toBe(true);
    }
  });
  it("Royal Mail is UK only and Delhivery India only", () => {
    expect(courierById("royalmail")?.regions).toEqual(["uk"]);
    expect(courierById("delhivery")?.regions).toEqual(["in"]);
  });
  it("names couriers, falling back to the id", () => {
    expect(courierName("bluedart")).toBe("Blue Dart");
    expect(courierName("smartr")).toBe("smartr");
    expect(courierName()).toBe("Courier");
  });
});
