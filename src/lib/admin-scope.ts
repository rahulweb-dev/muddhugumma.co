import "server-only";
// Which store the admin is looking at: both, India only or UK only. Picked with the switcher in the admin top bar,
// remembered in a cookie, and read by every admin page (orders, returns, packing, stock, dashboard, reports).
// India and UK money is never added together: "all" shows the two side by side.
import { cookies } from "next/headers";
import type { Region } from "./region";

export type AdminScope = "all" | Region;
export const ADMIN_SCOPE_COOKIE = "mg_adm_store";

export const isScope = (v: unknown): v is AdminScope => v === "all" || v === "in" || v === "uk";

export async function getAdminScope(): Promise<AdminScope> {
  const v = (await cookies()).get(ADMIN_SCOPE_COOKIE)?.value;
  return isScope(v) ? v : "all";
}

/** The regions a scope covers, in display order. */
export const scopeRegions = (s: AdminScope): Region[] => (s === "all" ? ["in", "uk"] : [s]);

/** Mongo filter on an order / return's region for a scope ({} for both). */
export const scopeFilter = (s: AdminScope): { region?: Region } => (s === "all" ? {} : { region: s });

export const REGION_NAME: Record<Region, string> = { in: "India", uk: "UK" };
export const REGION_FLAG: Record<Region, string> = { in: "🇮🇳", uk: "🇬🇧" };
