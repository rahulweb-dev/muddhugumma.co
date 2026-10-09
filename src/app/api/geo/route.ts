import { NextResponse, type NextRequest } from "next/server";
import { lookupPostcode, reverseGeocode } from "@/lib/geo";
import { isRegion } from "@/lib/region";

export const dynamic = "force-dynamic";

/**
 * Address autofill.
 *   GET /api/geo?lat=17.43&lng=78.45        → address from the shopper's location
 *   GET /api/geo?region=in&postcode=500034  → city + state for a pincode / postcode
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const lat = Number(p.get("lat"));
  const lng = Number(p.get("lng"));
  const region = p.get("region") ?? "";
  const postcode = (p.get("postcode") ?? "").slice(0, 10);

  let fill = null;
  if (p.has("lat") && p.has("lng")) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return NextResponse.json({ error: "Invalid location" }, { status: 400 });
    }
    // Round to ~10 m: enough for a street address, and fewer distinct lookups to the free geocoder.
    fill = await reverseGeocode(Math.round(lat * 1e4) / 1e4, Math.round(lng * 1e4) / 1e4);
  } else if (isRegion(region) && postcode) {
    fill = await lookupPostcode(region, postcode);
  } else {
    return NextResponse.json({ error: "Send lat & lng, or region & postcode" }, { status: 400 });
  }

  if (!fill) return NextResponse.json({ error: "Address not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(fill, { headers: { "Cache-Control": "private, max-age=3600" } });
}
