import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { imagekitConfigured, uploadAuth } from "@/lib/imagekit";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Short-lived signature for direct browser uploads to ImageKit. Admins only. */
export async function GET() {
  const session = await getSession();
  if (!session || (!can(session.role, "products.manage") && !can(session.role, "content.manage") && !can(session.role, "merch.manage"))) {
    return NextResponse.json({ error: "Sign in as an admin to upload images." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (!imagekitConfigured()) {
    return NextResponse.json(
      {
        error:
          "ImageKit is not configured. Set IMAGEKIT_PRIVATE_KEY, NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY and NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT, or type an image path below (for example products/my-saree.webp, with the file placed in public/img/products).",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json(uploadAuth(), { headers: { "Cache-Control": "no-store" } });
}
