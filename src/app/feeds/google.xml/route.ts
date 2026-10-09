import { feedHeaders, feedItems, regionFrom, SITE } from "../feed-items";

/** Google Merchant Center product feed (RSS 2.0 with g: fields). India prices by default; ?region=uk for GBP and UK links. */
export async function GET(req: Request) {
  const region = regionFrom(new URL(req.url));
  const items = await feedItems(region);
  const x = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  const tag = (name: string, v: string) => (v ? `<g:${name}>${x(v)}</g:${name}>` : "");
  const body = items
    .map(
      (i) => `<item>
${tag("id", i.id)}
<title>${x(i.title)}</title>
<description>${x(i.description)}</description>
<link>${x(i.link)}</link>
${tag("image_link", i.image)}
${i.extraImages.map((u) => tag("additional_image_link", u)).join("\n")}
${tag("availability", i.inStock ? "in_stock" : "out_of_stock")}
${tag("price", i.price)}
${tag("sale_price", i.salePrice)}
${tag("sale_price_effective_date", i.saleEffective)}
${tag("brand", "House of Muddhugumma")}
${tag("condition", "new")}
${tag("google_product_category", i.googleCategory)}
${tag("product_type", i.productType)}
${tag("gender", "female")}
${tag("age_group", "adult")}
${tag("color", i.colour)}
${tag("material", i.material)}
${tag("size", i.size)}
${region === "uk" && i.size.startsWith("UK ") ? tag("size_system", "UK") : ""}
${tag("item_group_id", i.groupId)}
${tag("identifier_exists", "no")}
${i.shipping ? `<g:shipping><g:country>${i.shipping.split(":::")[0]}</g:country><g:price>${x(i.shipping.split(":::")[1])}</g:price></g:shipping>` : ""}
</item>`.replace(/\n{2,}/g, "\n")
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>House of Muddhugumma${region === "uk" ? " (UK)" : " (India)"}</title>
<link>${x(SITE)}</link>
<description>Ethnic wear and jewellery from House of Muddhugumma, delivered across India and the UK.</description>
${body}
</channel>
</rss>
`;
  return new Response(xml, { headers: feedHeaders("application/xml; charset=utf-8") });
}
