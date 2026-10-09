import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { BRAND, SITE, absImage } from "@/lib/seo";

/*
 * Branded share card (1200×630) for WhatsApp, Facebook, X, LinkedIn and Google Discover:
 *   /og?title=Kanjeevaram silk sarees&kicker=Shop&img=products/x.webp&price=₹12,999
 * Logo and name on the paper colour, with the product or category photo on the left when there is one.
 * Pages get the URL from ogImage() in src/lib/seo-meta.ts.
 */
export const runtime = "nodejs";

const PAPER = "#FBFAF7";
const INK = "#1B1A18";
const COCOA = "#5B3A22";
const BRONZE = "#9A744A";
const MUTED = "#7A746B";

const IK = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT?.replace(/\/$/, "") ?? "";

/** Only our own images (ImageKit paths or URLs on our ImageKit / site), as PNG/JPEG that the renderer can decode. */
function photoUrl(img: string | null): string {
  if (!img) return "";
  if (/^https:\/\//.test(img)) {
    const ok = (IK && img.startsWith(`${IK}/`)) || img.startsWith(`${SITE}/`);
    return ok ? img : "";
  }
  if (!/^[\w\-./]+$/.test(img) || img.includes("..")) return "";
  return absImage(img, "w-480,h-630,fo-auto,q-80,f-jpg");
}

let serif: ArrayBuffer | null | undefined;
/** Cormorant Garamond (the site's display serif) from Google Fonts; falls back to the default font if unreachable. */
async function loadSerif(): Promise<ArrayBuffer | null> {
  if (serif !== undefined) return serif;
  try {
    // A non-browser user agent makes Google Fonts answer with one TTF, which the renderer can read (not WOFF2).
    const css = await fetch("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500", { headers: { "User-Agent": "curl/8" } }).then((r) => r.text());
    const src = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
    serif = src ? await fetch(src).then((r) => r.arrayBuffer()) : null;
  } catch {
    serif = null;
  }
  return serif ?? null;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const title = (q.get("title") || `${BRAND}`).slice(0, 110);
  const kicker = (q.get("kicker") || "").slice(0, 60);
  const price = (q.get("price") || "").slice(0, 24);
  const photo = photoUrl(q.get("img"));
  const logo = absImage("brand/logo.webp", "w-240,h-240,q-90,f-png");
  const font = await loadSerif();
  const display = font ? "Cormorant" : "serif";
  const titleSize = title.length > 70 ? 46 : title.length > 40 ? 56 : 66;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: PAPER, color: INK }}>
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" width={480} height={630} style={{ width: 480, height: 630, objectFit: "cover" }} />
        )}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: photo ? "54px 60px" : "64px 90px", borderLeft: photo ? `6px solid ${BRONZE}` : "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt="" width={92} height={92} style={{ width: 92, height: 92, borderRadius: 46, border: `2px solid ${BRONZE}`, background: "#fff" }} />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 17, letterSpacing: 7, color: MUTED }}>HOUSE OF</span>
              <span style={{ fontFamily: display, fontSize: 44, color: COCOA, lineHeight: 1.05 }}>Muddhugumma</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {kicker && <span style={{ fontSize: 20, letterSpacing: 5, textTransform: "uppercase", color: BRONZE }}>{kicker}</span>}
            <span style={{ fontFamily: display, fontSize: titleSize, lineHeight: 1.08, color: INK, display: "flex" }}>{title}</span>
            {price && <span style={{ fontSize: 34, color: COCOA, fontWeight: 600 }}>{price}</span>}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid #E3DDD3`, paddingTop: 20, fontSize: 21, color: MUTED }}>
            <span>Handwoven ethnic wear · India &amp; UK delivery</span>
            <span style={{ color: COCOA }}>{SITE.replace(/^https?:\/\//, "")}</span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: font ? [{ name: "Cormorant", data: font, weight: 500, style: "normal" }] : undefined,
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400" },
    }
  );
}
