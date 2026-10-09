import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { preconnect } from "react-dom";
import { Cormorant_Garamond, Karla, Pinyon_Script, Tenor_Sans } from "next/font/google";
import { StoreProvider } from "@/components/StoreProvider";
import { ConsentManager } from "@/components/analytics/ConsentManager";
import { getRegion } from "@/lib/queries";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { User } from "@/lib/models";
import { CONSENT_COOKIE, parseConsent } from "@/lib/analytics";
import { activeCategories } from "@/lib/categories";
import { getSettings } from "@/lib/settings";
import { BRAND, SITE } from "@/lib/seo";
import { ogImage } from "@/lib/seo-meta";
import "./globals.css";

const tenor = Tenor_Sans({ weight: "400", subsets: ["latin"], variable: "--font-tenor", display: "swap" });
const karla = Karla({ subsets: ["latin"], variable: "--font-karla", display: "swap" });
const cormorant = Cormorant_Garamond({ weight: ["500"], style: ["normal", "italic"], subsets: ["latin"], variable: "--font-cormorant", display: "swap" });
const pinyon = Pinyon_Script({ weight: "400", subsets: ["latin"], variable: "--font-pinyon", display: "swap" });

/** ImageKit origin (e.g. https://ik.imagekit.io), so the browser opens the connection before the first product photo. */
const IMAGE_ORIGIN = (() => {
  try {
    return process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT ? new URL(process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT).origin : "";
  } catch {
    return "";
  }
})();

// Search Console ownership token (carried over from the previous store so the property stays verified).
const GOOGLE_VERIFICATION = process.env.GOOGLE_SITE_VERIFICATION ?? "yqWbn9MOyQk6fsehxWJk75CFP0B8EiwWc2kDYGf0SFQ";

/** Site-wide defaults, built from the live categories and the first homepage slide. */
export async function generateMetadata(): Promise<Metadata> {
  const [cats, settings] = await Promise.all([activeCategories(), getSettings()]);
  const names = cats.filter((c) => c.inNav).map((c) => c.name.toLowerCase());
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] ?? "ethnic wear";
  const description = `Ethnic wear that celebrates heritage, grace & you: ${list}, delivered across India and the UK.`;
  // Default share card (logo, brand line, first homepage photo) for any page that doesn't set its own.
  const card = ogImage({ title: "Ethnic wear for India & the UK", kicker: "Sarees · Half sarees · Kurta sets", image: settings.home?.slides?.[0]?.image });
  return {
    metadataBase: new URL(SITE),
    title: { default: `${BRAND} · Ethnic wear for India & the UK`, template: `%s · ${BRAND}` },
    description,
    applicationName: BRAND,
    keywords: ["ethnic wear", "sarees", "half sarees", "kurta sets", "Indian ethnic wear UK", "buy sarees online", BRAND],
    openGraph: { siteName: BRAND, type: "website", description, images: [card] },
    twitter: { card: "summary_large_image", images: [card.url] },
    verification: GOOGLE_VERIFICATION ? { google: GOOGLE_VERIFICATION } : undefined,
    // Icons come from src/app/icon.tsx and apple-icon.tsx; the web app manifest from src/app/manifest.ts.
    appleWebApp: { capable: true, title: "Muddhugumma", statusBarStyle: "default" },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = { themeColor: "#FBFAF7", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [region, session, jar] = await Promise.all([getRegion(), getSession(), cookies()]);
  let wishlist: string[] | null = null;
  if (session) {
    await db();
    const u = await User.findById(session.uid, { wishlist: 1 }).lean<{ wishlist?: string[] }>();
    wishlist = u?.wishlist ?? [];
  }
  // No crossOrigin: <img> requests are non-CORS, so a CORS preconnect would not be reused.
  if (IMAGE_ORIGIN) preconnect(IMAGE_ORIGIN);
  const consent = parseConsent(jar.get(CONSENT_COOKIE)?.value);
  return (
    <html lang={region === "uk" ? "en-GB" : "en-IN"} className={`${tenor.variable} ${karla.variable} ${cormorant.variable} ${pinyon.variable}`}>
      <body>
        <StoreProvider initialRegion={region} user={session ? { name: session.name, role: session.role } : null} serverWishlist={wishlist}>
          {children}
          <ConsentManager initial={consent} />
        </StoreProvider>
      </body>
    </html>
  );
}
