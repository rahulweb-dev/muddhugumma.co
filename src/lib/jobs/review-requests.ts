import "server-only";
import { db } from "../db";
import { esc, renderEmail, siteUrl } from "../email-layout";
import { Order, type OrderDoc } from "../models";
import { sendEmail } from "../notify";

/** First name for the greeting. */
const first = (name?: string) => (name ?? "").trim().split(/\s+/)[0] || "there";

/**
 * Scheduled job "review-requests": a few days after delivery, ask the customer once to review what they bought.
 * Reviews add star ratings to product pages and to Google results. Each order is asked at most once.
 */
export async function run(): Promise<string> {
  await db();
  const now = Date.now();
  // Delivered 4 to 30 days ago: time to wear it, not so long that they've forgotten.
  const orders = await Order.find(
    {
      status: "delivered",
      reviewRequestedAt: null,
      "shipment.deliveredAt": { $lte: new Date(now - 4 * 864e5), $gte: new Date(now - 30 * 864e5) },
    },
    { number: 1, email: 1, region: 1, items: 1, address: 1 }
  )
    .limit(200)
    .lean<Pick<OrderDoc, "_id" | "number" | "email" | "region" | "items" | "address">[]>();
  if (!orders.length) return "No delivered orders waiting for a review request.";

  let sent = 0;
  let failed = 0;
  for (const o of orders) {
    // Claim first so overlapping runs can't email twice.
    const claimed = await Order.updateOne({ _id: o._id, reviewRequestedAt: null }, { $set: { reviewRequestedAt: new Date() } });
    if (!claimed.modifiedCount) continue;
    const items = [...new Map((o.items ?? []).map((i) => [i.slug, i])).values()].slice(0, 4);
    const region = o.region === "uk" ? "?region=uk" : "";
    const list = items
      .map((i) => `<li style="margin:0 0 8px"><a href="${esc(siteUrl(`/p/${i.slug}${region}#reviews`))}" style="color:#5B3A22">${esc(i.name)}</a></li>`)
      .join("");
    const main = items[0];
    const { html, text } = renderEmail({
      preheader: "Two minutes to tell other shoppers how it looks and fits",
      kicker: "How did we do?",
      heading: "Tell us what you think",
      body: `<p style="margin:0 0 12px">Hi ${esc(first(o.address?.name))}, we hope you love your order ${esc(o.number)}.</p>
<p style="margin:0 0 12px">A short review helps other women choose with confidence, and a photo of how you styled it means the world to our weavers.</p>
<ul style="margin:0 0 12px;padding-left:18px">${list}</ul>`,
      cta: main ? { label: "Write a review", url: siteUrl(`/p/${main.slug}${region}#reviews`) } : undefined,
      footnote: "We only ask once per order. Something not right? Just reply to this email and we'll help.",
    });
    const res = await sendEmail({ to: o.email, subject: `How is your ${main?.name ?? "order"}?`, html, text, template: "review-request", ref: o.number });
    if (res.ok) sent++;
    else {
      failed++;
      await Order.updateOne({ _id: o._id }, { $unset: { reviewRequestedAt: "" } }); // retry next run
    }
  }
  return `Review requests: emailed ${sent}${failed ? `, failed ${failed} (will retry)` : ""}.`;
}
