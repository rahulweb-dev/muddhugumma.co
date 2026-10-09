import "server-only";
import { effectivePrice } from "@/lib/pricing";
import { getFeedProducts } from "@/lib/queries";
import { REGION_CONFIG, canonicalSize, sizesFor, type Region } from "@/lib/region";
import { getActiveSales } from "@/lib/sales";
import { categoryLabel } from "@/lib/types";
import { SITE, absImage } from "@/lib/seo";

export { SITE, absImage };

/* One row per sellable variant for shopping feeds (Google Merchant Center, Meta catalogue). */

export type FeedItem = {
  id: string;
  groupId: string;
  title: string;
  description: string;
  link: string;
  image: string;
  extraImages: string[];
  inStock: boolean;
  price: string; // "12499 INR" / "139.00 GBP"
  salePrice: string;
  saleEffective: string;
  colour: string;
  material: string;
  size: string;
  productType: string;
  googleCategory: string;
};

const amount = (n: number, region: Region) => (region === "in" ? `${Math.round(n)} INR` : `${n.toFixed(2)} GBP`);
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export async function feedItems(region: Region): Promise<FeedItem[]> {
  const [products, sales] = await Promise.all([getFeedProducts(), getActiveSales()]);
  const out: FeedItem[] = [];
  for (const p of products) {
    if (!p.images.length) continue;
    const m = effectivePrice(p, region, sales);
    const regular = m.mrp > m.now ? m.mrp : m.now;
    const onSale = m.now < regular;
    const link = `${SITE}/p/${p.slug}${region === "uk" ? "?region=uk" : ""}`;
    const description = clean(
      [p.description, p.craft && `Craft: ${p.craft}.`, p.origin && `Made in ${p.origin}.`, p.details.map((d) => d.trim().replace(/\.?$/, ".")).join(" "), p.care && `Care: ${p.care}`].filter(Boolean).join(" ")
    ).slice(0, 4900);
    const base = {
      groupId: p.slug,
      description: description || `${p.name} from House of Muddhugumma, delivered across India and the UK.`,
      link,
      image: absImage(p.images[0]),
      extraImages: p.images.slice(1, 10).map((i) => absImage(i)),
      price: amount(regular, region),
      salePrice: onSale ? amount(m.now, region) : "",
      saleEffective: m.sale ? `${new Date().toISOString().slice(0, 16)}Z/${m.sale.endsAt.slice(0, 16)}Z` : "",
      colour: p.colour.replace(/^./, (c) => c.toUpperCase()),
      material: p.fabric,
      // Google's taxonomy: jewellery is not clothing.
      googleCategory: /jewel/.test(p.category) ? "Apparel & Accessories > Jewelry" : "Apparel & Accessories > Clothing",
      productType: `Women > ${categoryLabel(p.category)}${p.collections.includes("bridal") ? " > Bridal" : ""}`,
    };
    for (const size of sizesFor(p.freeSize, region)) {
      const left = p.stock[canonicalSize(size)] ?? 0;
      out.push({
        ...base,
        id: p.freeSize ? p.slug : `${p.slug}-${canonicalSize(size).toLowerCase()}`,
        title: clean(`${p.name}${p.freeSize ? "" : ` - Size ${size}`}`).slice(0, 150),
        inStock: left > 0,
        size: p.freeSize ? "One size" : size,
      });
    }
  }
  return out;
}

export const feedHeaders = (type: string) => ({
  "Content-Type": type,
  "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=600",
});

export const regionFrom = (url: URL): Region => (url.searchParams.get("region") === "uk" ? "uk" : "in");
export const currencyOf = (region: Region) => REGION_CONFIG[region].currency;
