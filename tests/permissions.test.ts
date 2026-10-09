import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS, STAFF_ROLES, can, isStaff, type Permission } from "@/lib/permissions";

const ALL = Object.keys(PERMISSIONS) as Permission[];

describe("isStaff", () => {
  it("knows the four staff roles", () => {
    for (const r of STAFF_ROLES) expect(isStaff(r)).toBe(true);
  });
  it("rejects customers and junk", () => {
    expect(isStaff("customer")).toBe(false);
    expect(isStaff(undefined)).toBe(false);
    expect(isStaff("")).toBe(false);
    expect(isStaff("Admin")).toBe(false);
  });
});

describe("role matrix", () => {
  it("admin can do everything", () => {
    for (const p of ALL) expect(can("admin", p)).toBe(true);
  });
  it("manager can do everything except staff and settings", () => {
    for (const p of ALL) expect(can("manager", p)).toBe(p !== "staff.manage" && p !== "settings.manage");
  });
  it("packer only sees orders, ships them, handles returns and answers customer messages", () => {
    const allowed = new Set<Permission>(["dashboard.view", "orders.view", "orders.ship", "returns.manage", "enquiries.manage"]);
    for (const p of ALL) expect(can("packer", p)).toBe(allowed.has(p));
  });
  it("stylist handles bookings, stitching, reviews and customers but not money, products or staff", () => {
    const yes: Permission[] = ["bookings.manage", "stitching.manage", "reviews.manage", "customers.view", "orders.view", "dashboard.view", "enquiries.manage"];
    const no: Permission[] = ["orders.manage", "products.manage", "reports.view", "settings.manage", "staff.manage", "merch.manage"];
    for (const p of yes) expect(can("stylist", p)).toBe(true);
    for (const p of no) expect(can("stylist", p)).toBe(false);
  });
  it("customers and unknown roles can do nothing", () => {
    for (const p of ALL) {
      expect(can("customer", p)).toBe(false);
      expect(can(undefined, p)).toBe(false);
      expect(can("owner", p)).toBe(false);
    }
  });
  it("only grants permissions that exist", () => {
    for (const r of STAFF_ROLES) for (const p of ROLE_PERMISSIONS[r]) expect(ALL).toContain(p);
  });
});
