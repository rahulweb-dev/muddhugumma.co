import "server-only";
// Which store the admin is looking at: both, India only or UK only. Picked with the switcher in the admin top bar,
// remembered in a cookie, and read by every admin page (orders, returns, packing, stock, dashboard, reports).
// A staff member can be locked to one country (Admin → Staff → Store access): then that country always wins,
// whatever the cookie or a ?region= link says.
// India and UK money is never added together: "all" shows the two side by side.
import { cache } from "react";
import { cookies } from "next/headers";
import { getSession } from "./auth";
import type { Region } from "./region";

export type AdminScope = "all" | Region;
export const ADMIN_SCOPE_COOKIE = "mg_adm_store";

export const isScope = (v: unknown): v is AdminScope => v === "all" || v === "in" || v === "uk";

/** The signed-in staff member's country lock ("" = may see both). */
export const getStoreLock = cache(async (): Promise<"" | Region> => {
  const s = await getSession();
  if (!s) return "";
  const { db } = await import("./db");
  const { User } = await import("./models");
  await db();
  const u = await User.findById(s.uid, { storeLock: 1 }).lean<{ storeLock?: string }>();
  return u?.storeLock === "in" || u?.storeLock === "uk" ? u.storeLock : "";
});

export async function getAdminScope(): Promise<AdminScope> {
  const lock = await getStoreLock();
  if (lock) return lock;
  const v = (await cookies()).get(ADMIN_SCOPE_COOKIE)?.value;
  return isScope(v) ? v : "all";
}

/**
 * The scope a page should use when the URL asks for one (?region= / ?store=): the request wins over the top bar,
 * except for staff locked to a country.
 */
export async function requestedScope(requested: unknown): Promise<AdminScope> {
  const lock = await getStoreLock();
  if (lock) return lock;
  return isScope(requested) ? requested : getAdminScope();
}

/** False when a staff member locked to one country opens something from the other (an order, a return). */
export async function canSeeRegion(region: string | undefined | null): Promise<boolean> {
  const lock = await getStoreLock();
  return !lock || lock === (region === "uk" ? "uk" : "in");
}

/** The regions a scope covers, in display order. */
export const scopeRegions = (s: AdminScope): Region[] => (s === "all" ? ["in", "uk"] : [s]);

/** Mongo filter on an order / return's region for a scope ({} for both). */
export const scopeFilter = (s: AdminScope): { region?: Region } => (s === "all" ? {} : { region: s });

export const REGION_NAME: Record<Region, string> = { in: "India", uk: "UK" };
export const REGION_FLAG: Record<Region, string> = { in: "🇮🇳", uk: "🇬🇧" };
