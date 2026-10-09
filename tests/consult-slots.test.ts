import { describe, expect, it } from "vitest";
import { CONSULT_SLOTS, consultDates, dayLabel, istDate, istLabel, ukLabel, whenLabel } from "@/app/(store)/consult/slots";

describe("consultDates", () => {
  it("starts tomorrow in India time and covers 30 days without Sundays", () => {
    // 9 Oct 2026 20:00 UTC is already Saturday 10 Oct in India.
    const d = consultDates(new Date("2026-10-09T20:00:00Z"));
    expect(istDate(new Date("2026-10-09T20:00:00Z"))).toBe("2026-10-10");
    expect(d[0]).toBe("2026-10-12"); // Sunday 11th skipped
    expect(d.at(-1)).toBe("2026-11-09");
    expect(d).toHaveLength(25); // 30 days minus 5 Sundays
    for (const x of d) expect(new Date(`${x}T12:00:00Z`).getUTCDay()).not.toBe(0);
  });
});

describe("slot labels", () => {
  it("shows the fixed India times", () => {
    expect(CONSULT_SLOTS.map((s) => istLabel("2026-10-12", s))).toEqual(["11:00 am IST", "1:00 pm IST", "3:00 pm IST", "5:00 pm IST"]);
  });
  it("converts to UK summer and winter time", () => {
    expect(ukLabel("2026-10-12", "11:00")).toBe("6:30 am BST");
    expect(ukLabel("2026-10-24", "17:00")).toBe("12:30 pm BST");
    expect(ukLabel("2026-10-26", "11:00")).toBe("5:30 am GMT"); // clocks go back on 25 Oct 2026
    expect(ukLabel("2026-11-09", "17:00")).toBe("11:30 am GMT");
  });
  it("labels days and full booking times", () => {
    expect(dayLabel("2026-10-12")).toBe("Mon 12 Oct");
    expect(whenLabel("2026-10-12", "15:00", "in")).toBe("Monday 12 October, 3:00 pm IST");
    expect(whenLabel("2026-10-12", "15:00", "uk")).toBe("Monday 12 October, 3:00 pm IST (10:30 am BST in the UK)");
  });
});
