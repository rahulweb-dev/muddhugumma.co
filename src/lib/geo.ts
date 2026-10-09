// Address autofill: GPS coordinates → address (OpenStreetMap Nominatim) and pincode / postcode → city + state
// (India Post via api.postalpincode.in, UK via postcodes.io). All free, no API keys; called server side only.
import { REGION_CONFIG, type Region } from "./region";
import { SITE } from "./seo";

export type GeoFill = { region: Region | null; line1?: string; line2?: string; city?: string; state?: string; postcode?: string };

const UA = `HouseOfMuddhugumma/1.0 (${SITE})`;
const TIMEOUT = 6000;

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT), next: { revalidate: 86400 } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Match a looked-up state name to the exact spelling in our India state list (the checkout select needs it). */
function matchState(name: string | undefined): string {
  if (!name) return "";
  const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "");
  const n = norm(name);
  return (REGION_CONFIG.in.states ?? []).find((s) => norm(s) === n) ?? "";
}

const join = (...parts: (string | undefined)[]) => [...new Set(parts.filter((p): p is string => !!p && p.trim() !== ""))].join(", ");

type Nominatim = {
  address?: {
    house_number?: string; building?: string; road?: string; neighbourhood?: string; suburb?: string; quarter?: string;
    city?: string; town?: string; village?: string; state_district?: string; county?: string;
    state?: string; postcode?: string; country_code?: string;
  };
};

export async function reverseGeocode(lat: number, lng: number): Promise<GeoFill | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=en&zoom=18&lat=${lat}&lon=${lng}`;
  const a = (await getJson<Nominatim>(url))?.address;
  if (!a) return null;
  const cc = a.country_code?.toLowerCase();
  const region: Region | null = cc === "in" ? "in" : cc === "gb" ? "uk" : null;
  const city = a.city || a.town || a.village || a.state_district || a.county || "";
  if (region === "uk") {
    return {
      region,
      line1: join([a.house_number, a.road].filter(Boolean).join(" ")),
      line2: join(a.neighbourhood, a.suburb),
      city,
      state: a.county && a.county !== city ? a.county : "",
      postcode: a.postcode?.toUpperCase() ?? "",
    };
  }
  // India: house / flat number is rarely mapped, so line 1 is left for the shopper; line 2 is the area and street.
  return {
    region,
    line1: join(a.building, a.house_number),
    line2: join(a.road, a.neighbourhood, a.quarter, a.suburb),
    city,
    state: matchState(a.state),
    postcode: (a.postcode ?? "").replace(/\s/g, ""),
  };
}

type IndiaPost = { Status: string; PostOffice: { Name: string; District: string; State: string }[] | null }[];
type PostcodesIo = { result?: { admin_district?: string; admin_county?: string | null; postcode?: string } };

export async function lookupPostcode(region: Region, code: string): Promise<GeoFill | null> {
  const clean = code.trim();
  if (!REGION_CONFIG[region].postPattern.test(clean)) return null;
  if (region === "in") {
    const po = (await getJson<IndiaPost>(`https://api.postalpincode.in/pincode/${clean}`))?.[0];
    const first = po?.Status === "Success" ? po.PostOffice?.[0] : undefined;
    return first ? { region, city: first.District, state: matchState(first.State), postcode: clean } : null;
  }
  const r = (await getJson<PostcodesIo>(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`))?.result;
  return r ? { region, city: r.admin_district ?? "", state: r.admin_county ?? "", postcode: r.postcode ?? clean.toUpperCase() } : null;
}
