import { describe, expect, it } from "vitest";
import { toE164 } from "@/lib/notify";

describe("toE164", () => {
  it("handles Indian mobile numbers", () => {
    expect(toE164("98765 43210")).toBe("+919876543210");
    expect(toE164("9876543210", "uk")).toBe("+919876543210");
    expect(toE164("+91 98765-43210")).toBe("+919876543210");
    expect(toE164("91 9876543210")).toBe("+919876543210");
  });
  it("handles UK mobile numbers", () => {
    // A UK 07… number is also a valid Indian 7… mobile with a trunk 0, so the address region decides.
    expect(toE164("07700 900123", "uk")).toBe("+447700900123");
    expect(toE164("+44 7700 900123")).toBe("+447700900123");
    expect(toE164("44 7700 900123")).toBe("+447700900123");
    expect(toE164("(0)7700-900-123", "uk")).toBe("+447700900123");
  });
  it("keeps any number that already has a country code", () => {
    expect(toE164("+1 (415) 555-0100")).toBe("+14155550100");
  });
  it("falls back to the region for other shapes", () => {
    expect(toE164("1234567", "uk")).toBe("+441234567");
    expect(toE164("12345678901234", "in")).toBe("+915678901234");
  });
  // Known gaps in toE164 (src/lib/notify.ts), reported to its owner. The 11-digit "0…" rule and the 10-digit "6–9…" rule
  // run before the region hint, so these come out wrong today:
  it("an Indian number written with a trunk 0 stays Indian", () => expect(toE164("098765 43210", "in")).toBe("+919876543210"));
  it("a UK mobile typed without its 0 stays British", () => expect(toE164("7700 900123", "uk")).toBe("+447700900123"));
});
