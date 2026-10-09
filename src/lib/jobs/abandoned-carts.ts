import "server-only";
import { db } from "../db";
import { Order, Product, User, type CartItemDoc, type OrderDoc, type ProductDoc, type UserDoc } from "../models";
import { getSettings } from "../settings";
import { sendEmail } from "../notify";
import { siteUrl } from "../email-layout";
import { abandonedBag } from "../messages/account";
import { formatMoney, REGION_CONFIG, type Region } from "../region";
import { optionsPrice } from "../checkout-pricing";
import type { LineItem } from "../messages/shared";
import { effectivePrice } from "../pricing";
import { getActiveSales } from "../sales";

const MAX_AGE_MS = 7 * 864e5;
const BATCH = 200;

/** Scheduled job "abandoned-carts": one reminder per abandoned bag for opted-in, signed-in shoppers. */
export async function run(): Promise<string> {
  await db();
  const settings = await getSettings();
  const hours = Math.max(1, Number(settings.abandonedCartHours) || 24);
  const now = Date.now();
  const sales = await getActiveSales();

  const users = await User.find(
    {
      "cart.0": { $exists: true },
      cartUpdatedAt: { $lte: new Date(now - hours * 36e5), $gte: new Date(now - MAX_AGE_MS) },
      cartRemindedAt: { $exists: false },
      marketingOptIn: true,
    },
    { name: 1, email: 1, cart: 1, cartUpdatedAt: 1 }
  )
    .limit(BATCH)
    .lean<Pick<UserDoc, "_id" | "name" | "email" | "cart" | "cartUpdatedAt">[]>();

  let sent = 0;
  let skipped = 0;
  for (const u of users) {
    try {
      // Claim first: only one run can remind this bag; a cart change clears cartRemindedAt again.
      const claimed = await User.updateOne({ _id: u._id, cartUpdatedAt: u.cartUpdatedAt, cartRemindedAt: { $exists: false } }, { $set: { cartRemindedAt: new Date() } });
      if (!claimed.modifiedCount) continue;

      const cart: CartItemDoc[] = u.cart ?? [];
      const last = await Order.findOne({ userId: String(u._id) }, { region: 1 }).sort({ createdAt: -1 }).lean<Pick<OrderDoc, "region">>();
      const region: Region = last?.region === "uk" ? "uk" : "in";
      const products = await Product.find({ slug: { $in: cart.map((c) => c.slug) }, active: true }, { slug: 1, name: 1, images: 1, price: 1, category: 1, collections: 1 }).lean<Pick<ProductDoc, "slug" | "name" | "images" | "price" | "category" | "collections">[]>();
      const bySlug = new Map(products.map((p) => [p.slug, p]));

      let subtotal = 0;
      const items: LineItem[] = [];
      for (const c of cart) {
        const p = bySlug.get(c.slug);
        if (!p) continue; // no longer on sale
        const unit = (Number(effectivePrice({ ...p, collections: p.collections ?? [] }, region, sales).now) || 0) + optionsPrice(c.options as Parameters<typeof optionsPrice>[0], region);
        subtotal += unit * c.qty;
        items.push({ name: p.name, image: p.images?.[0], size: c.size, qty: c.qty, price: unit * c.qty, url: siteUrl(`/p/${p.slug}`) });
      }
      if (!items.length) {
        skipped++;
        continue;
      }
      const cfg = REGION_CONFIG[region];
      const freeShip =
        subtotal >= cfg.freeShippingAt
          ? `Your bag qualifies for free delivery${region === "uk" ? " across the UK, with duties included" : " anywhere in India"}.`
          : `Add ${formatMoney(cfg.freeShippingAt - subtotal, region)} more for free delivery.`;
      const msg = abandonedBag(u.name, items, region, freeShip);
      await sendEmail({ to: u.email, subject: msg.subject, html: msg.html, text: msg.text, template: "abandoned_cart" });
      sent++;
    } catch (e) {
      console.error("[jobs:abandoned-carts] failed for", u.email, e);
    }
  }
  return `${users.length} abandoned bag${users.length === 1 ? "" : "s"} found, ${sent} reminder${sent === 1 ? "" : "s"} sent${skipped ? `, ${skipped} skipped (items no longer available)` : ""}`;
}
