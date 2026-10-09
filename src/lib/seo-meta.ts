import "server-only";
// Page metadata for search engines and link previews, per storefront region.
//
// India and the UK share URLs; the region comes from a cookie or the visitor's country, and an explicit ?region=uk
// renders the UK store on the server (see src/proxy.ts). So each page has two crawlable versions:
//   India (and x-default): /path          UK: /path?region=uk
// Every page points at both with hreflang and at its own version as canonical, and titles, descriptions and
// keywords name the country, so Google can show ₹ results in India and £ results in the UK.
import type { Metadata } from "next";
import { getRegion } from "./queries";
import type { Region } from "./region";
import { BRAND, SITE } from "./seo";

const LOCALE: Record<Region, string> = { in: "en_IN", uk: "en_GB" };
export const COUNTRY: Record<Region, string> = { in: "India", uk: "UK" };

/** URL of one region's version of a path (keeps any query, adds ?region=uk for the UK). */
export function regionPath(path: string, region: Region) {
  if (region === "in") return path;
  return `${path}${path.includes("?") ? "&" : "?"}region=uk`;
}

/** canonical + hreflang alternates for a path. */
export function regionAlternates(path: string, region: Region): Metadata["alternates"] {
  return {
    canonical: regionPath(path, region),
    languages: { "en-IN": regionPath(path, "in"), "en-GB": regionPath(path, "uk"), "x-default": path },
  };
}

/** Branded 1200×630 share image: logo, kicker, title and an optional photo (see src/app/og/route.tsx). */
export function ogImage(o: { title: string; kicker?: string; image?: string; price?: string }) {
  const q = new URLSearchParams({ title: o.title.slice(0, 110) });
  if (o.kicker) q.set("kicker", o.kicker.slice(0, 60));
  if (o.image) q.set("img", o.image);
  if (o.price) q.set("price", o.price);
  return { url: `/og?${q.toString()}`, width: 1200, height: 630, alt: o.title };
}

/** Search phrases people use in both countries, shared by every page. */
export const BASE_KEYWORDS: Record<Region, string[]> = {
  in: [
    "ethnic wear online India", "buy sarees online India", "silk sarees online", "kurta sets for women", "lehenga online India",
    "designer ethnic wear", "handloom sarees", "bridal wear India", "festive wear for women", "Indian traditional wear",
  ],
  uk: [
    "Indian ethnic wear UK", "buy sarees online UK", "Indian clothes UK", "sarees London", "lehenga UK", "kurta sets UK",
    "Indian wedding outfits UK", "Asian bridal wear UK", "Indian designer wear UK", "salwar kameez UK",
  ],
};

type PageMetaInput = {
  /** Page title without the brand (the root template adds " · House of Muddhugumma"). */
  title: string | Record<Region, string>;
  description: string | Record<Region, string>;
  path: string;
  keywords?: string[] | Record<Region, string[]>;
  /** Photo for the share card (ImageKit path or https URL). */
  image?: string;
  kicker?: string;
  price?: string;
  noindex?: boolean;
  type?: "website" | "article";
  region?: Region;
};

const pick = <T,>(v: T | Record<Region, T>, r: Region): T => (v && typeof v === "object" && !Array.isArray(v) && "in" in (v as object) ? (v as Record<Region, T>)[r] : (v as T));

/** Full metadata for a storefront page in the visitor's region: title, description, keywords, canonical, hreflang, OG, Twitter. */
export async function pageMeta(i: PageMetaInput): Promise<Metadata> {
  const region = i.region ?? (await getRegion());
  const title = pick(i.title, region);
  const description = pick(i.description, region).replace(/\s+/g, " ").trim().slice(0, 160);
  const keywords = [...new Set([...(i.keywords ? pick(i.keywords, region) : []), ...BASE_KEYWORDS[region].slice(0, 4), BRAND])];
  const og = ogImage({ title, kicker: i.kicker, image: i.image, price: i.price });
  const url = regionPath(i.path, region);
  return {
    title,
    description,
    keywords,
    alternates: regionAlternates(i.path, region),
    robots: i.noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      title: `${title} · ${BRAND}`,
      description,
      url,
      siteName: BRAND,
      locale: LOCALE[region],
      alternateLocale: [LOCALE[region === "in" ? "uk" : "in"]],
      type: i.type ?? "website",
      images: [og],
    },
    twitter: { card: "summary_large_image", title: `${title} · ${BRAND}`, description, images: [og.url] },
  };
}

export { SITE };

/*
 * What shoppers type into Google for each listing, per country. Used in category titles, descriptions and keywords.
 * Unknown categories (added later in Admin → Categories) fall back to phrases built from their name.
 */
type Terms = Record<Region, { title: string; desc: string; keywords: string[] }>;

const CATEGORY_TERMS: Record<string, Terms> = {
  sarees: {
    in: {
      title: "Sarees Online: Silk, Kanjeevaram, Banarasi & Cotton Sarees",
      desc: "Buy sarees online in India: pure silk, Kanjeevaram, Banarasi, tissue, georgette and handloom cotton sarees for weddings, festivals and office. Free shipping above ₹1,999, COD available.",
      keywords: ["sarees online", "buy sarees online India", "silk sarees", "Kanjeevaram sarees", "Banarasi sarees", "pure silk saree price", "wedding sarees", "party wear sarees", "cotton sarees", "handloom sarees", "designer sarees", "georgette sarees"],
    },
    uk: {
      title: "Sarees UK: Buy Silk, Banarasi & Kanjeevaram Sarees Online",
      desc: "Shop Indian sarees online in the UK: silk, Kanjeevaram, Banarasi, georgette and handloom sarees for weddings, Diwali and parties. Duties included, delivered across the UK.",
      keywords: ["sarees UK", "buy sarees online UK", "Indian sarees London", "silk sarees UK", "Banarasi saree UK", "Kanjeevaram saree UK", "wedding sarees UK", "party wear sarees UK", "saree shop UK", "designer sarees UK"],
    },
  },
  "half-sarees": {
    in: {
      title: "Half Sarees Online: Langa Voni & Pattu Half Sarees",
      desc: "Buy half sarees online in India: pattu langa voni, silk and festive half saree sets for functions, festivals and ceremonies. Free shipping above ₹1,999, COD available.",
      keywords: ["half sarees online", "half saree", "langa voni", "pattu half saree", "half saree for function", "silk half saree", "traditional half saree", "lehenga voni"],
    },
    uk: {
      title: "Half Sarees UK: Langa Voni & Pattu Half Saree Sets",
      desc: "Shop half sarees online in the UK: pattu langa voni and silk half saree sets for ceremonies, festivals and family functions. Duties included, UK delivery.",
      keywords: ["half saree UK", "langa voni UK", "pattu half saree UK", "half saree London", "South Indian half saree UK", "lehenga voni UK"],
    },
  },
  "3-piece-sets": {
    in: {
      title: "3 Piece Sets: Kurta Sets with Dupatta for Women",
      desc: "Buy 3 piece kurta sets online in India: kurta, pants and dupatta sets in silk, cotton and georgette for festive, office and everyday wear. COD available.",
      keywords: ["3 piece kurta set", "kurta set with dupatta", "salwar suit online", "kurta pant dupatta set", "women ethnic sets", "festive kurta sets", "cotton kurta set", "silk kurta set"],
    },
    uk: {
      title: "Kurta Sets UK: 3 Piece Salwar Suits with Dupatta",
      desc: "Shop 3 piece kurta sets and salwar suits online in the UK: kurta, pants and dupatta in silk, cotton and georgette for Eid, Diwali and weddings. UK delivery, duties included.",
      keywords: ["kurta sets UK", "salwar kameez UK", "salwar suits UK", "Indian suits UK", "kurta with dupatta UK", "Asian clothes UK", "Eid outfits UK"],
    },
  },
  "one-piece": {
    in: {
      title: "One Piece Dresses: Anarkali, Kurtis & Ethnic Gowns",
      desc: "Buy one piece ethnic dresses online in India: Anarkali gowns, long kurtis and flared ethnic dresses for parties and festivals. Free shipping above ₹1,999.",
      keywords: ["one piece dress", "ethnic gown", "anarkali dress", "long kurti", "ethnic dresses for women", "party wear gown", "festive dress"],
    },
    uk: {
      title: "Indian Dresses UK: Anarkali Gowns & One Piece Ethnic Dresses",
      desc: "Shop Indian one piece dresses online in the UK: Anarkali gowns, long kurtis and ethnic party dresses for weddings, Diwali and Eid. UK delivery, duties included.",
      keywords: ["Indian dresses UK", "anarkali dress UK", "ethnic gown UK", "Indian party wear UK", "long kurti UK", "Asian dresses UK"],
    },
  },
  jewellery: {
    in: {
      title: "Ethnic Jewellery Online: Temple, Kundan & Bridal Jewellery",
      desc: "Buy ethnic jewellery online in India: temple jewellery, kundan sets, jhumkas and bridal jewellery to pair with sarees and lehengas. COD available.",
      keywords: ["ethnic jewellery online", "temple jewellery", "kundan jewellery", "jhumkas", "bridal jewellery set", "saree jewellery", "traditional jewellery"],
    },
    uk: {
      title: "Indian Jewellery UK: Temple, Kundan & Bridal Jewellery",
      desc: "Shop Indian jewellery online in the UK: temple jewellery, kundan sets, jhumkas and bridal sets to match sarees and lehengas. UK delivery.",
      keywords: ["Indian jewellery UK", "kundan jewellery UK", "temple jewellery UK", "jhumkas UK", "Indian bridal jewellery UK", "Asian jewellery UK"],
    },
  },
  bridal: {
    in: {
      title: "Bridal Wear: Bridal Sarees, Lehengas & Wedding Outfits",
      desc: "Shop bridal wear online in India: Kanjeevaram and Banarasi bridal sarees, bridal lehengas and outfits for every wedding ceremony. Free video styling consult.",
      keywords: ["bridal sarees", "bridal lehenga", "wedding saree", "Kanjeevaram bridal saree", "bridal wear online", "wedding outfits for women", "reception saree", "trousseau shopping"],
    },
    uk: {
      title: "Indian Bridal Wear UK: Bridal Sarees & Lehengas",
      desc: "Shop Indian bridal wear online in the UK: bridal sarees, lehengas and wedding guest outfits, with a free video consult with our stylists. UK delivery, duties included.",
      keywords: ["Indian bridal wear UK", "bridal lehenga UK", "Asian bridal wear UK", "Indian wedding dress UK", "bridal saree UK", "wedding guest outfits UK", "Indian bridal shop London"],
    },
  },
  festive: {
    in: {
      title: "Festive Wear: Diwali, Pongal & Festival Outfits for Women",
      desc: "Shop festive wear online in India: silk sarees, kurta sets and half sarees for Diwali, Pongal, Onam, Ugadi and Navratri. Free shipping above ₹1,999, COD available.",
      keywords: ["festive wear", "Diwali outfits", "festival sarees", "Pongal saree", "Onam saree", "Navratri outfits", "festive kurta sets", "traditional wear for festivals"],
    },
    uk: {
      title: "Diwali & Festive Outfits UK: Indian Festive Wear",
      desc: "Shop Indian festive wear online in the UK: sarees, kurta sets and half sarees for Diwali, Eid, Navratri and Pongal celebrations. UK delivery, duties included.",
      keywords: ["Diwali outfits UK", "Indian festive wear UK", "Eid outfits UK", "Navratri outfits UK", "festive sarees UK", "Indian outfits for Diwali UK"],
    },
  },
  new: {
    in: {
      title: "New Arrivals: Latest Sarees, Kurta Sets & Ethnic Wear",
      desc: "The latest sarees, half sarees, kurta sets and ethnic wear at House of Muddhugumma, new every week. Free shipping across India above ₹1,999.",
      keywords: ["new arrivals ethnic wear", "latest sarees", "latest kurta sets", "new collection sarees", "trending ethnic wear"],
    },
    uk: {
      title: "New In: Latest Indian Sarees & Ethnic Wear UK",
      desc: "New Indian sarees, half sarees, kurta sets and ethnic wear just in at House of Muddhugumma, delivered across the UK with duties included.",
      keywords: ["new Indian clothes UK", "latest sarees UK", "new ethnic wear UK", "Indian fashion UK"],
    },
  },
  sale: {
    in: {
      title: "Ethnic Wear Sale: Sarees & Kurta Sets on Offer",
      desc: "Shop the House of Muddhugumma sale: sarees, half sarees and kurta sets at their best prices of the season. Free shipping above ₹1,999, COD available.",
      keywords: ["saree sale", "ethnic wear sale", "sarees offer", "discount sarees online", "kurta set sale"],
    },
    uk: {
      title: "Indian Clothes Sale UK: Sarees & Ethnic Wear Offers",
      desc: "Shop the House of Muddhugumma sale in the UK: Indian sarees, half sarees and kurta sets at their best prices of the season. Duties included.",
      keywords: ["saree sale UK", "Indian clothes sale UK", "ethnic wear sale UK", "sarees offer UK"],
    },
  },
  all: {
    in: {
      title: "Shop All Ethnic Wear: Sarees, Half Sarees & Kurta Sets",
      desc: "Every piece at House of Muddhugumma: sarees, half sarees, kurta sets, one piece dresses and jewellery, delivered across India. COD available.",
      keywords: ["ethnic wear online", "women ethnic wear", "Indian clothes online", "traditional wear online"],
    },
    uk: {
      title: "Shop Indian Ethnic Wear UK: Sarees, Kurta Sets & More",
      desc: "Every piece at House of Muddhugumma: Indian sarees, half sarees, kurta sets, dresses and jewellery, delivered across the UK with duties included.",
      keywords: ["Indian clothes UK", "Indian ethnic wear UK", "Asian clothes online UK", "Indian clothing shop UK"],
    },
  },
};

/** Titles, descriptions and keywords for a listing page, per region. */
export function listingTerms(slug: string, name: string, blurb?: string): Terms {
  const known = CATEGORY_TERMS[slug];
  if (known) return known;
  const n = name.toLowerCase();
  return {
    in: {
      title: `${name} Online: Buy ${name} in India`,
      desc: `${blurb ? `${blurb} ` : ""}Buy ${n} online at House of Muddhugumma, delivered across India. Free shipping above ₹1,999, COD available.`,
      keywords: [`${n} online`, `buy ${n} online India`, `${n} for women`, `designer ${n}`],
    },
    uk: {
      title: `${name} UK: Buy Indian ${name} Online`,
      desc: `${blurb ? `${blurb} ` : ""}Shop Indian ${n} online in the UK at House of Muddhugumma. UK delivery, duties included.`,
      keywords: [`${n} UK`, `Indian ${n} UK`, `buy ${n} online UK`, `${n} London`],
    },
  };
}

/** Search phrases for one product, per region: its name plus fabric / colour / occasion + category combinations. */
export function productKeywords(p: { name: string; fabric: string; colour: string; occasions: string[] }, category: string, region: Region): string[] {
  const cat = category.toLowerCase();
  const one = cat.replace(/s$/, "");
  const where = region === "uk" ? " UK" : " online";
  const short = p.name.split(/[,(|]/)[0].trim().split(/\s+/).slice(0, 6).join(" "); // "Soft georgette saree with checks pattern"
  return [
    short,
    `${short}${region === "uk" ? " UK" : " price"}`,
    p.fabric && `${p.fabric.toLowerCase()} ${one}`,
    p.fabric && `${p.fabric.toLowerCase()} ${cat}${where}`,
    p.colour && `${p.colour} ${one}`,
    p.colour && p.fabric && `${p.colour} ${p.fabric.toLowerCase()} ${one}`,
    ...p.occasions.map((o) => `${o} ${cat}${where}`),
    `buy ${cat}${region === "uk" ? " online UK" : " online India"}`,
  ].filter((k): k is string => !!k);
}
