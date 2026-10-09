// Imports the previous Base44 store (muddhugumma.co) into this one: categories, products with photos, settings,
// homepage and policy pages. Safe to re-run: everything is matched by slug and photos already copied are reused.
//
//   node --env-file=.env.local --conditions=react-server --import tsx scripts/import-live.mts [--fetch] [--dry]
//
//   --fetch  refresh scripts/live-import/store.json from the live store first (otherwise uses the saved snapshot)
//   --dry        print what would change without writing to the database or ImageKit
//   --overwrite  also replace products, categories, pages and settings that already exist. Without it a re-run only
//                adds what is missing, so edits made in the admin since the first import are kept.
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { db } from "../src/lib/db.ts";
import { Bundle, Category, Lookbook, Page, Post, Product, Sale, Settings } from "../src/lib/models.ts";
import { imagekitConfigured, uploadBuffer } from "../src/lib/imagekit.ts";
import { COLOUR_HEX } from "../src/components/admin/constants.ts";

const DIR = path.join(import.meta.dirname, "live-import");
const APP_ID = "693af0cfd36c3b1495f36457";
const DRY = process.argv.includes("--dry");
const OVERWRITE = process.argv.includes("--overwrite");
const GBP_TO_INR = 112; // ₹ prices are filled from £ at this rate (rounded to ₹…99) where the live store has no ₹ price

type LiveColour = { name: string; primaryImage?: string; images?: string[] };
type LiveProduct = {
  id: string; created_date: string; name: string; description?: string; material?: string; subCategory: string;
  price: number | null; offerPrice: number | null; priceGBP: number | null; offerPriceGBP: number | null; sku: string;
  sizes: string[]; colors: LiveColour[]; stock: number; sizeStock?: Record<string, number>; isPublished: boolean;
  rating: number; reviewCount: number; isNewArrival: boolean; isBestSeller: boolean; occasion?: string[];
};
type LiveCategory = { name: string; slug: string; image?: string; isActive: boolean };
type LiveSettings = Record<string, unknown> & { bannerHeading?: string; bannerSubtext?: string; bannerImage?: string; contactEmail?: string; contactPhone?: string; contactHours?: string; contactAddress?: string };

/* ---------- 1. data ---------- */
if (process.argv.includes("--fetch")) {
  const res = await fetch(`https://base44.app/api/apps/${APP_ID}/functions/getPublicStorefront`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-App-Id": APP_ID },
    body: JSON.stringify({ action: "bootstrap" }),
  });
  if (!res.ok) throw new Error(`Live store answered ${res.status}`);
  fs.writeFileSync(path.join(DIR, "store.json"), JSON.stringify(await res.json(), null, 1));
  console.log("Fetched a fresh snapshot of the live store.");
}
const live = JSON.parse(fs.readFileSync(path.join(DIR, "store.json"), "utf8")) as { products: LiveProduct[]; categories: LiveCategory[]; settings: LiveSettings };

/* ---------- helpers ---------- */
const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const titleCase = (s: string) => clean(s).toLowerCase().replace(/(^|[\s&-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
const shorten = (s: string, max: number) => (s.length <= max ? s : s.slice(0, s.lastIndexOf("-", max) > 20 ? s.lastIndexOf("-", max) : max));

// Live category → slug and menu order here.
const CATEGORY_MAP: Record<string, { slug: string; name: string; sort: number }> = {
  Sarees: { slug: "sarees", name: "Sarees", sort: 0 },
  Halfsarees: { slug: "half-sarees", name: "Half Sarees", sort: 1 },
  "One Piece": { slug: "one-piece", name: "One Piece", sort: 2 },
  "2 Piece Sets": { slug: "2-piece-sets", name: "2 Piece Sets", sort: 3 },
  "3 Piece Sets": { slug: "3-piece-sets", name: "3 Piece Sets", sort: 4 },
  Frocks: { slug: "frocks", name: "Frocks", sort: 5 },
  Jewellery: { slug: "jewellery", name: "Jewellery", sort: 6 },
};
const catOf = (live: string) => CATEGORY_MAP[live] ?? { slug: slugify(live), name: titleCase(live), sort: 50 };

const inrFromGbp = (gbp: number) => Math.ceil((gbp * GBP_TO_INR) / 100) * 100 - 1;
const gbpFromInr = (inr: number) => Math.ceil(inr / GBP_TO_INR) - 0.01;
function prices(p: LiveProduct) {
  const pair = (full: number | null, offer: number | null) => {
    if (!full && !offer) return null;
    const now = offer && full ? Math.min(offer, full) : (offer || full)!;
    return { now, mrp: full && now < full ? full : 0 };
  };
  const uk = pair(p.priceGBP, p.offerPriceGBP);
  const inr = pair(p.price, p.offerPrice);
  return {
    in: inr ?? (uk ? { now: inrFromGbp(uk.now), mrp: uk.mrp ? inrFromGbp(uk.mrp) : 0 } : { now: 0, mrp: 0 }),
    uk: uk ?? (inr ? { now: gbpFromInr(inr.now), mrp: inr.mrp ? gbpFromInr(inr.mrp) : 0 } : { now: 0, mrp: 0 }),
  };
}

// Colour family for the shop's colour filter, from the live colour name ("Peacock green" → green).
const FAMILY: [RegExp, string][] = [
  [/maroon|rust|red|wine/, "red"],
  [/pink|rose|magenta|peach/, "pink"],
  [/orange/, "orange"],
  [/yellow|mustard|lemon/, "yellow"],
  [/green/, "green"],
  [/blue|navy|aqua/, "blue"],
  [/purple|violet|plum|lavender/, "purple"],
  [/brown/, "brown"],
  [/black/, "black"],
  [/white|ivory|cream/, "ivory"],
  [/gold/, "gold"],
];
const family = (name: string) => {
  const n = name.toLowerCase();
  if (/&| and |with/.test(n)) {
    const first = FAMILY.find(([rx]) => rx.test(n.split(/&| and |with/)[0]));
    return first?.[1] ?? "multi";
  }
  return FAMILY.find(([rx]) => rx.test(n))?.[1] ?? "";
};
const FABRICS = ["Georgette", "Organza", "Chiffon", "Silk", "Cotton", "Linen", "Viscose", "Crepe", "Net", "Velvet", "Rayon", "Chanderi", "Tissue"];
const fabricOf = (p: LiveProduct) => {
  if (clean(p.material)) return titleCase(p.material!);
  const text = `${p.name} ${p.description ?? ""}`.toLowerCase().replace("viscouse", "viscose").replace("mangalgiri", "cotton").replace("narayanpet", "cotton");
  return FABRICS.find((f) => text.includes(f.toLowerCase())) ?? "";
};
const OCCASION: Record<string, string> = { casual: "everyday", festive: "festive", "party wear": "party", "office wear": "office" };

/* ---------- 2. images: copy each Base44 photo into ImageKit once ---------- */
const cacheFile = path.join(DIR, "images.json");
const cache: Record<string, string> = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, "utf8")) : {};
let uploaded = 0;
async function copyImage(url: string | undefined, folder: string): Promise<string> {
  if (!url) return "";
  if (cache[url]) return cache[url];
  if (DRY) return `(would upload) ${url.split("/").pop()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download ${url} (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const base = (url.split("/").pop() ?? "image").split("?")[0];
  const ext = (base.match(/\.(jpe?g|png|webp|gif)$/i)?.[0] ?? ".jpg").toLowerCase();
  const name = `${slugify(base.replace(/\.[^.]+$/, "")).slice(0, 80) || "image"}${ext}`;
  const stored = await uploadBuffer(buf, name, folder);
  cache[url] = stored;
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
  uploaded++;
  return stored;
}
/** Runs fn over items, `limit` at a time. */
async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const n = i++;
      out[n] = await fn(items[n]);
    }
  }));
  return out;
}

if (!DRY && !imagekitConfigured()) throw new Error("ImageKit keys are missing in .env.local, so photos can't be copied.");
await db();

/* ---------- 3. products ---------- */
type Doc = Record<string, unknown> & { slug: string; name: string; category: string; images: string[]; createdAt: Date };
const docs: Doc[] = [];
const warnings: string[] = [];
const allUrls = live.products.flatMap((p) => p.colors.flatMap((c) => [c.primaryImage, ...(c.images ?? [])])).filter((u): u is string => !!u);
const uniqueUrls = [...new Set(allUrls)];
console.log(`Copying ${uniqueUrls.length} product photos to ImageKit (${uniqueUrls.filter((u) => cache[u]).length} already copied)…`);
await pool(uniqueUrls, 4, (u) => copyImage(u, "/live/products"));

for (const p of live.products) {
  const cat = catOf(p.subCategory);
  const jewellery = cat.slug === "jewellery";
  const freeSize = !p.sizes?.length;
  const stock: Record<string, number> = {};
  if (freeSize) stock["Free size"] = Math.max(0, p.stock || 0);
  else for (const s of ["XS", "S", "M", "L", "XL", "XXL"]) stock[s] = p.stock > 0 ? Math.max(0, p.sizeStock?.[s] ?? 0) : 0;
  if (!freeSize && p.stock === 0 && Object.values(p.sizeStock ?? {}).some((n) => n > 0)) warnings.push(`${p.sku}: total stock is 0 but sizes have stock on the live store; imported as sold out.`);

  const colours = p.colors?.length ? p.colors : [{ name: "", images: [] }];
  for (const [ci, c] of colours.entries()) {
    const urls = [...new Set([c.primaryImage, ...(c.images ?? [])].filter((u): u is string => !!u))];
    const images = await Promise.all(urls.map((u) => copyImage(u, "/live/products")));
    const multi = colours.length > 1;
    const colourName = titleCase(c.name);
    const baseName = clean(p.name);
    const name = multi && colourName ? `${baseName} – ${colourName}` : baseName;
    const slug = `${shorten(slugify(baseName), 70)}-${slugify(p.sku)}${multi ? `-${slugify(c.name) || ci + 1}` : ""}`;
    const fam = jewellery ? "" : family(c.name);
    // Jewellery "colours" on the live store are usually the piece type (Bangles, Tikka), sometimes a real colour.
    const label = jewellery && !family(c.name) ? "Piece" : "Colour";
    const details = [colourName ? `${label}: ${colourName}` : "", `SKU: ${p.sku}`].filter(Boolean);
    docs.push({
      slug,
      name,
      category: cat.slug,
      collections: [...(p.isNewArrival ? ["new"] : []), ...(p.isBestSeller ? ["bestseller"] : [])],
      fabric: jewellery ? "" : fabricOf(p),
      occasions: [...new Set((p.occasion ?? []).map((o) => OCCASION[o.toLowerCase()]).filter(Boolean))],
      colour: fam,
      hex: (fam && COLOUR_HEX[fam as keyof typeof COLOUR_HEX]) || "#cccccc",
      images,
      price: prices(p),
      freeSize,
      stock,
      tag: "",
      origin: "",
      craft: "",
      description: clean(p.description),
      details,
      care: "",
      rating: p.rating || 0,
      ratingCount: p.reviewCount || 0,
      active: p.isPublished !== false,
      madeToOrder: false,
      blouseOptions: false,
      legacyId: p.id,
      createdAt: new Date(p.created_date + "Z"),
    });
  }
}

/* ---------- 4. categories ---------- */
const counts = new Map<string, number>();
for (const d of docs) if (d.active) counts.set(d.category, (counts.get(d.category) ?? 0) + 1);
const cats = await Promise.all(
  live.categories.map(async (c) => {
    const m = catOf(c.name);
    const has = (counts.get(m.slug) ?? 0) > 0;
    return { slug: m.slug, name: m.name, sort: m.sort, image: await copyImage(c.image, "/live/categories"), active: c.isActive !== false && has, inNav: has };
  })
);
for (const slug of counts.keys()) if (!cats.some((c) => c.slug === slug)) warnings.push(`Products use category "${slug}", which the live store doesn't list.`);

/* ---------- 5. settings, homepage, pages ---------- */
const s = live.settings;
const phone = clean(s.contactPhone).replace(/^\+91\s?(\d{5})(\d{5})$/, "+91 $1 $2");
const banner = await copyImage(s.bannerImage, "/live/home");
// The live banner is a designed graphic with its own lettering, which the arched hero frame crops badly,
// so the slides use category photos (the banner is still copied to ImageKit for use in Admin → Homepage).
const imageOf = (slug: string) => cats.find((c) => c.slug === slug)?.image || banner;
const storyImage = imageOf("3-piece-sets");
const settingsPatch = {
  supportEmail: clean(s.contactEmail).toLowerCase(),
  phone,
  whatsappIn: phone,
  whatsappUk: phone,
  supportHours: clean(s.contactHours),
  address: clean(s.contactAddress),
  instagram: "houseofmuddhugumma",
  announcements: {
    in: ["Shipping across India and the UK", "Order updates on WhatsApp and email", `Questions? WhatsApp ${phone}`],
    uk: ["UK delivery: Standard £3.99 · Express £4.99", "Order updates on WhatsApp and email", `Questions? WhatsApp ${phone}`],
  },
  ticker: {
    in: ["Ethnic wear that celebrates heritage & grace", "Sarees · Half sarees · Sets · Jewellery", "Quality-checked before dispatch", "Packed with care", "WhatsApp support, 7 days a week"],
    uk: ["Ethnic wear that celebrates heritage & grace", "Sarees · Half sarees · Sets · Jewellery", "UK delivery from £3.99", "Packed with care", "WhatsApp support, 7 days a week"],
  },
  home: {
    slides: [
      {
        kicker: "House of Muddhugumma",
        title: clean(s.bannerHeading).replace(/House of Muddhugumma$/i, "").trim() || "Welcome to",
        accent: "House of Muddhugumma",
        text: clean(s.bannerSubtext),
        ctaLabel: "Shop new in",
        ctaHref: "/c/new",
        linkLabel: "Shop sarees",
        linkHref: "/c/sarees",
        image: imageOf("sarees"),
        alt: "Model in a pink saree",
      },
      {
        kicker: "Half sarees",
        title: "Langa voni,",
        accent: "made to twirl",
        text: "Georgette and silk half sarees with ruffles, borders and stitched blouses, for festivals and family functions.",
        ctaLabel: "Shop half sarees",
        ctaHref: "/c/half-sarees",
        linkLabel: "Shop all",
        linkHref: "/c/all",
        image: imageOf("half-sarees"),
        alt: "Model in a blue half saree",
      },
      {
        kicker: "Jewellery",
        title: "The finishing",
        accent: "touch",
        text: "Necksets, chokers, tikkas, bangles and more to complete every look.",
        ctaLabel: "Shop jewellery",
        ctaHref: "/c/jewellery",
        linkLabel: "Shop new in",
        linkHref: "/c/new",
        image: imageOf("jewellery"),
        alt: "Gold-toned necklace set",
      },
    ],
    story: {
      kicker: "Our story",
      title: "Ethnic wear that celebrates",
      accent: "heritage & grace",
      text:
        "House of Muddhugumma is a fashion brand born from a love for Indian craftsmanship and timeless ethnic wear. We curate and create pieces that celebrate heritage while embracing modern comfort and style.\n\nWhat began as a passion for beautiful ethnic wear has grown into a trusted online destination for women across India and the UK.",
      image: storyImage,
    },
  },
};

/** A converted live page: "## Title", optional "Last Updated" line as the intro, business details as their own section. */
function pageFrom(file: string, slug: string, opts: { intro?: string } = {}) {
  let lines = fs.readFileSync(path.join(DIR, "pages-raw", file), "utf8").replace(/\r/g, "").split("\n");
  let title = "";
  if (lines[0]?.startsWith("## ")) {
    title = lines[0].slice(3).trim();
    lines = lines.slice(1);
  }
  let body = lines.join("\n").trim();
  let intro = opts.intro ?? "";
  const updated = body.match(/^Last Updated:.*$/m);
  if (!intro && updated && body.startsWith(updated[0])) {
    intro = updated[0];
    body = body.slice(updated[0].length).trim();
  }
  if (opts.intro && body.startsWith(opts.intro)) body = body.slice(opts.intro.length).trim();
  body = body
    .replace(/\n*© House of Muddhugumma\. All rights reserved\.\s*$/, "")
    .replace(/\n\nHouse of Muddhugumma\n\nA unit of /, "\n\n## Business details\n\nHouse of Muddhugumma\n\nA unit of ")
    .replace(/\n\nUK & International Operations\n\n/, "\n\n### UK & international operations\n\n")
    .trim();
  return { slug, title, intro, body, published: true };
}
const pages = [
  pageFrom("about_us.md", "about", { intro: "House of Muddhugumma — Ethnic Wear That Celebrates Heritage, Grace & You" }),
  pageFrom("shipping_policy.md", "shipping"),
  pageFrom("returns_policy.md", "returns"),
  pageFrom("privacy_policy.md", "privacy"),
  pageFrom("terms_conditions.md", "terms"),
  { ...pageFrom("faq.md", "faq"), title: "Frequently Asked Questions", intro: "Find answers to common questions about orders, shipping, returns, and more." },
];

/* ---------- 6. write ---------- */
console.log(`\nCategories: ${cats.map((c) => `${c.name} (${counts.get(c.slug) ?? 0}${c.active ? "" : ", hidden: no products"})`).join(", ")}`);
console.log(`Products: ${docs.length} (${docs.filter((d) => d.active).length} live) from ${live.products.length} on the live store`);
console.log(`Pages: ${pages.map((p) => `${p.slug} "${p.title}"`).join(", ")}`);
const missing = docs.filter((d) => !d.images.length);
if (missing.length) warnings.push(`${missing.length} products have no photo: ${missing.map((d) => d.slug).join(", ")}`);

if (DRY) {
  console.log("\nDry run: sample product:\n", JSON.stringify(docs[0], null, 1));
  console.log("Prices sample:", docs.slice(0, 5).map((d) => `${d.name.slice(0, 30)} ${JSON.stringify(d.price)}`).join("\n"));
} else {
  // Without --overwrite, existing records are left alone ($setOnInsert only writes new ones).
  const write = <T extends object>(v: T) => (OVERWRITE ? { $set: v } : { $setOnInsert: v });
  let added = 0;
  for (const c of cats) await Category.updateOne({ slug: c.slug }, write(c), { upsert: true });
  for (const d of docs) {
    const { createdAt, ...rest } = d;
    const r = await Product.updateOne({ slug: d.slug }, OVERWRITE ? { $set: rest, $setOnInsert: { createdAt } } : { $setOnInsert: { ...rest, createdAt } }, { upsert: true, timestamps: false });
    if (r.upsertedCount) added++;
    if (r.upsertedCount || OVERWRITE) await Product.collection.updateOne({ slug: d.slug }, { $set: { createdAt, updatedAt: new Date() } });
  }
  console.log(`\nProducts added:${added}${OVERWRITE ? `, ${docs.length - added} refreshed from the live store` : `, ${docs.length - added} already here (kept as they are)`}.`);
  // Settings: fill only empty fields unless --overwrite.
  const current = (await Settings.findOne({ key: "store" }).lean<Record<string, unknown>>()) ?? {};
  const empty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.values(v as object).some((x) => !empty(x)));
  const patch = Object.fromEntries(Object.entries(settingsPatch).filter(([k]) => OVERWRITE || empty(current[k]) || (k === "supportEmail" && current[k] === "care@muddhugumma.com") || (k === "address" && String(current[k]).startsWith("Jubilee Hills"))));
  if (Object.keys(patch).length) await Settings.updateOne({ key: "store" }, { $set: { ...patch, key: "store" } }, { upsert: true });
  console.log(`Settings filled: ${Object.keys(patch).join(", ") || "none (already set)"}.`);
  for (const p of pages) await Page.updateOne({ slug: p.slug }, write(p), { upsert: true });

  // Sample content from the demo catalogue: switched off (not deleted), so it can be brought back from admin.
  const demo = await Product.updateMany({ legacyId: { $exists: false }, active: true }, { $set: { active: false } });
  const [sales, books, bundles, posts] = await Promise.all([
    Sale.updateMany({ active: true }, { $set: { active: false } }),
    Lookbook.updateMany({ active: true }, { $set: { active: false } }),
    Bundle.updateMany({ active: true }, { $set: { active: false } }),
    Post.updateMany({ status: "published" }, { $set: { status: "draft" } }),
  ]);
  console.log(`\nSwitched off demo content: ${demo.modifiedCount} products, ${sales.modifiedCount} sales, ${books.modifiedCount} lookbooks, ${bundles.modifiedCount} bundles, ${posts.modifiedCount} journal posts (now drafts).`);
  console.log(`Photos uploaded this run: ${uploaded}. Done.`);
}
if (warnings.length) console.log(`\nNotes:\n- ${warnings.join("\n- ")}`);
await mongoose.disconnect();
