import { describe, expect, it } from "vitest";
import { REGION_CONFIG, canonicalSize, deliveryWindow, formatMoney, sizesFor } from "@/lib/region";

const nbsp = (s: string) => s.replace(/ /g, " ");

describe("formatMoney", () => {
  it("formats rupees with Indian digit grouping and no paise", () => {
    expect(nbsp(formatMoney(1999, "in"))).toBe("₹1,999");
    expect(nbsp(formatMoney(125000, "in"))).toBe("₹1,25,000");
    expect(nbsp(formatMoney(1999.6, "in"))).toBe("₹2,000");
  });
  it("formats pounds, showing pence only when there are some", () => {
    expect(formatMoney(75, "uk")).toBe("£75");
    expect(formatMoney(4.95, "uk")).toBe("£4.95");
    expect(formatMoney(1234.5, "uk")).toBe("£1,234.50");
  });
});

describe("sizes", () => {
  it("maps UK sizes onto the shared India stock", () => {
    expect(canonicalSize("UK 6")).toBe("XS");
    expect(canonicalSize("UK 10")).toBe("M");
    expect(canonicalSize("UK 16")).toBe("XXL");
  });
  it("leaves India sizes and free size alone", () => {
    expect(canonicalSize("M")).toBe("M");
    expect(canonicalSize("Free size")).toBe("Free size");
  });
  it("offers the region's size run, or free size", () => {
    expect(sizesFor(false, "in")).toEqual(REGION_CONFIG.in.sizes);
    expect(sizesFor(false, "uk")).toEqual(["UK 6", "UK 8", "UK 10", "UK 12", "UK 14", "UK 16"]);
    expect(sizesFor(true, "in")).toEqual(["Free size"]);
    expect(sizesFor(true, "uk")).toEqual(["Free size"]);
  });
});

describe("deliveryWindow", () => {
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  it("counts India's 4–6 working days and skips Sundays", () => {
    // Friday 9 Oct 2026: Sat 10 (1), Sun 11 skipped, Mon 12 (2), Tue 13 (3), Wed 14 (4), Thu 15 (5), Fri 16 (6)
    const [a, b] = deliveryWindow("in", new Date(2026, 9, 9, 10));
    expect(ymd(a)).toBe("2026-10-14");
    expect(ymd(b)).toBe("2026-10-16");
  });
  it("counts the UK's 5–7 working days and skips Sundays", () => {
    // Saturday 10 Oct 2026: Mon 12 (1) … Fri 16 (5), Sat 17 (6), Sun 18 skipped, Mon 19 (7)
    const [a, b] = deliveryWindow("uk", new Date(2026, 9, 10, 10));
    expect(ymd(a)).toBe("2026-10-16");
    expect(ymd(b)).toBe("2026-10-19");
  });
  it("never lands on a Sunday", () => {
    for (let i = 0; i < 14; i++) {
      for (const r of ["in", "uk"] as const) {
        const [a, b] = deliveryWindow(r, new Date(2026, 0, 1 + i, 9));
        expect(a.getDay()).not.toBe(0);
        expect(b.getDay()).not.toBe(0);
      }
    }
  });
  it("does not change the date passed in", () => {
    const from = new Date(2026, 9, 9, 10);
    deliveryWindow("in", from);
    expect(ymd(from)).toBe("2026-10-09");
  });
});
