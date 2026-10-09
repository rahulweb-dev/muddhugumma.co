import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { imagekitConfigured, uploadAuth } from "@/lib/imagekit";

export const dynamic = "force-dynamic";

/** Short-lived signature so a signed-in customer can upload review photos straight to ImageKit (folder /reviews). */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Please sign in to add photos to your review." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (!imagekitConfigured()) {
    return NextResponse.json({ error: "Photo uploads are switched off right now. You can still post your review without photos." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ ...uploadAuth(), folder: "/reviews" }, { headers: { "Cache-Control": "no-store" } });
}
