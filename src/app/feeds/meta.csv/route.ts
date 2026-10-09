import { feedHeaders, feedItems, regionFrom } from "../feed-items";

/** Meta (Facebook/Instagram) catalogue feed as CSV. India prices by default; ?region=uk for GBP and UK links. */
export async function GET(req: Request) {
  const region = regionFrom(new URL(req.url));
  const items = await feedItems(region);
  const cols = [
    "id", "title", "description", "availability", "condition", "price", "sale_price", "sale_price_effective_date", "link", "image_link",
    "additional_image_link", "brand", "google_product_category", "product_type", "item_group_id", "color", "material", "size", "gender", "age_group",
  ];
  const cell = (v: string) => {
    const s = v.replace(/\r?\n/g, " ");
    // Guard against spreadsheet formula injection and quote anything with separators.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const rows = items.map((i) =>
    [
      i.id, i.title, i.description, i.inStock ? "in stock" : "out of stock", "new", i.price, i.salePrice, i.saleEffective, i.link, i.image,
      i.extraImages.join(","), "House of Muddhugumma", "Apparel & Accessories > Clothing", i.productType, i.groupId, i.colour, i.material, i.size, "female", "adult",
    ]
      .map(cell)
      .join(",")
  );
  const csv = [cols.join(","), ...rows].join("\n") + "\n";
  return new Response(csv, { headers: { ...feedHeaders("text/csv; charset=utf-8"), "Content-Disposition": `inline; filename="muddhugumma-meta-${region}.csv"` } });
}
