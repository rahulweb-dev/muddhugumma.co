import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Product } from "@/lib/models";

// Old Base44 product links (/product/<id>) → the same piece on this store, or the full catalogue.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let to = "/c/all";
  if (/^[a-f0-9]{24}$/i.test(id)) {
    await db();
    const p = await Product.findOne({ legacyId: id }, { slug: 1 }).lean<{ slug: string }>();
    if (p) to = `/p/${p.slug}`;
  }
  return NextResponse.redirect(new URL(to, req.url), 308);
}
