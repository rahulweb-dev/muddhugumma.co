// Helpers for search engines and link previews: absolute URLs and JSON-LD.

export const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3100").replace(/\/$/, "");
export const BRAND = "House of Muddhugumma";

/** Absolute page URL ("/p/x" → "https://muddhugumma.co/p/x"). */
export const absUrl = (path = "/") => `${SITE}${path.startsWith("/") ? path : `/${path}`}`;

/** Absolute image URL for an ImageKit path (or a local /img fallback). */
export function absImage(path: string, tr = "w-1200,q-85") {
  if (!path) return "";
  if (/^https?:\/\//.test(path)) return path;
  const ep = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT?.replace(/\/$/, "");
  return ep ? `${ep}/${path.replace(/^\/+/, "")}?tr=${tr}` : `${SITE}/img/${path.replace(/^\/+/, "")}`;
}

/** JSON-LD for a <script type="application/ld+json">, with "<" escaped so text can't close the tag. */
export const ldJson = (data: unknown) => JSON.stringify(data).replace(/</g, "\u003c");

/** BreadcrumbList from [name, path] pairs. */
export const breadcrumbLd = (items: [string, string][]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: absUrl(path) })),
});

/** Sentence-cases an all-lowercase or ALL-CAPS product name for titles and descriptions; mixed case is left alone. */
export function tidyName(name: string) {
  const n = name.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").replace(/\s*&\s*/g, " & ").trim();
  if (n === n.toLowerCase() || n === n.toUpperCase()) return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
  return n.charAt(0).toUpperCase() + n.slice(1);
}
