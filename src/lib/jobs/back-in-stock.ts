import "server-only";
import { db } from "../db";
import { esc, renderEmail, siteUrl } from "../email-layout";
import { Product, StockAlert, type ProductDoc, type StockAlertDoc } from "../models";
import { sendEmail } from "../notify";
import { REGION_CONFIG, formatMoney, isRegion } from "../region";
import { stockFor } from "../stock";

/** Absolute image URL for emails (ImageKit when configured, the site's local copy otherwise). */
function emailImage(path: string) {
  if (/^https:\/\//.test(path)) return path;
  const ep = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT?.replace(/\/$/, "");
  return ep ? `${ep}/${path}?tr=w-480,q-80,f-auto` : siteUrl(`/img/${path}`);
}

/** Scheduled job "back-in-stock": emails shoppers whose size is back and marks their alert as sent. */
export async function run(): Promise<string> {
  await db();
  const alerts = await StockAlert.find({ notifiedAt: null }).sort({ createdAt: 1 }).limit(2000).lean<StockAlertDoc[]>();
  if (!alerts.length) return "No shoppers waiting.";

  const slugs = [...new Set(alerts.map((a) => a.productSlug))];
  const products = await Product.find({ slug: { $in: slugs } }).lean<ProductDoc[]>();
  const bySlug = new Map(products.map((p) => [p.slug, p]));

  let sent = 0;
  let failed = 0;
  let waiting = 0;
  let gone = 0;
  for (const a of alerts) {
    const p = bySlug.get(a.productSlug);
    if (!p || p.active === false) {
      gone++;
      continue;
    }
    // Only email once the size is back in the shopper's own country.
    const region = isRegion(a.region) ? a.region : "in";
    if ((stockFor(p, region)[a.size] ?? 0) <= 0) {
      waiting++;
      continue;
    }
    const url = siteUrl(`/p/${p.slug}${region === "uk" ? "?region=uk" : ""}`);
    const sizeText = a.size === "Free size" ? "" : ` in size ${esc(a.size)}${region === "uk" ? ` (UK ${({ XS: 6, S: 8, M: 10, L: 12, XL: 14, XXL: 16 } as Record<string, number>)[a.size] ?? ""})` : ""}`;
    const price = p.price?.[region]?.now;
    const img = p.images?.[0] ? emailImage(p.images[0]) : "";
    const { html, text } = renderEmail({
      preheader: `${p.name} is back in stock`,
      kicker: "Back in stock",
      heading: "It's back",
      body: `${img ? `<a href="${esc(url)}"><img src="${esc(img)}" alt="${esc(p.name)}" width="240" style="display:block;width:240px;max-width:100%;height:auto;margin:0 0 16px;border:1px solid #E3DDD3"></a>` : ""}
<p style="margin:0 0 8px"><strong>${esc(p.name)}</strong>${sizeText} is available again${price ? ` at ${esc(formatMoney(price, region))}` : ""}.</p>
<p style="margin:0">We restock handwoven pieces in small numbers, so it may not stay long. ${region === "in" ? "Cash on delivery and free shipping above " + esc(formatMoney(REGION_CONFIG.in.freeShippingAt, "in")) + " apply as usual." : "Duties are included, so there is nothing to pay at the door."}</p>`,
      cta: { label: "Shop it now", url },
      footnote: "You asked us to tell you when this piece was back. This is a one-off email; we won't send more unless you ask again.",
    });
    const res = await sendEmail({ to: a.email, subject: `Back in stock: ${p.name}`, html, text, template: "back-in-stock", ref: p.slug });
    if (res.ok) {
      await StockAlert.updateOne({ _id: a._id }, { $set: { notifiedAt: new Date() } });
      sent++;
    } else failed++;
  }
  return `Checked ${alerts.length} alert${alerts.length === 1 ? "" : "s"}: emailed ${sent}, still waiting ${waiting}${failed ? `, failed ${failed} (will retry)` : ""}${gone ? `, ${gone} for products no longer on sale` : ""}.`;
}
