import { NextResponse, type NextRequest } from "next/server";
import { getRegion, searchSuggest } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Header autocomplete: GET /api/search/suggest?q=kanj → matching pieces (with sale-aware prices) and shop links. */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  try {
    const region = await getRegion();
    const data = await searchSuggest(q, region);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=60", Vary: "Cookie" } });
  } catch (e) {
    console.error("[search/suggest]", e);
    return NextResponse.json({ products: [], links: [], correction: null }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
