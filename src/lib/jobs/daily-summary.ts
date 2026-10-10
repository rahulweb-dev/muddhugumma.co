import "server-only";
import { db } from "../db";
import { esc, renderEmail, siteUrl } from "../email-layout";
import { Order, Product, ReturnRequest } from "../models";
import { sendEmail } from "../notify";
import { formatMoney, type Region } from "../region";
import { startOfToday } from "../admin-data";
import { stockFor } from "../stock";
import { forecastFor, salesVelocity } from "../stock-forecast";

const DAY = 86_400_000;
const LIVE = { $nin: ["cancelled", "returned"] };
const REGIONS: Region[] = ["in", "uk"];
const NAME: Record<Region, string> = { in: "🇮🇳 India", uk: "🇬🇧 UK" };
const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

type Sum = { _id: Region; orders: number; revenue: number };
const sums = (from: Date, to: Date) =>
  Order.aggregate<Sum>([
    { $match: { createdAt: { $gte: from, $lt: to }, status: LIVE } },
    { $group: { _id: "$region", orders: { $sum: 1 }, revenue: { $sum: { $ifNull: ["$total", 0] } } } },
  ]);

/**
 * Scheduled job "daily-summary" (08:00 IST): emails the owner yesterday's sales per country against the same day last
 * week, what is waiting today, sold-out sizes and what will sell out soon. To OWNER_EMAIL, or TEAM_EMAIL.
 */
export async function run(): Promise<string> {
  const to = process.env.OWNER_EMAIL || process.env.TEAM_EMAIL;
  await db();
  const today = startOfToday();
  const yStart = new Date(today.getTime() - DAY);
  const wStart = new Date(today.getTime() - 8 * DAY);
  const wEnd = new Date(today.getTime() - 7 * DAY);

  const [yesterday, lastWeek, toPack, packed, unpaid, returnsOpen, products, velocity] = await Promise.all([
    sums(yStart, today),
    sums(wStart, wEnd),
    Order.aggregate<{ _id: Region; n: number }>([{ $match: { status: "confirmed" } }, { $group: { _id: "$region", n: { $sum: 1 } } }]),
    Order.aggregate<{ _id: Region; n: number }>([{ $match: { status: "packed" } }, { $group: { _id: "$region", n: { $sum: 1 } } }]),
    Order.countDocuments({ status: "placed" }),
    ReturnRequest.countDocuments({ status: { $in: ["requested", "approved", "pickup_scheduled", "picked_up", "received"] } }),
    Product.find({ active: true }, { name: 1, slug: 1, freeSize: 1, stock: 1, stockUk: 1 }).lean<{ name: string; slug: string; freeSize?: boolean; stock?: unknown; stockUk?: unknown }[]>(),
    salesVelocity(REGIONS),
  ]);

  const of = <T extends { _id: Region }>(rows: T[], r: Region) => rows.find((x) => x._id === r);
  const soldOut: Record<Region, number> = { in: 0, uk: 0 };
  const fast: { name: string; region: Region; size: string; days: number }[] = [];
  for (const p of products) {
    for (const r of REGIONS) {
      const st = stockFor(p, r);
      const sizes = p.freeSize ? ["Free size"] : SIZES;
      soldOut[r] += sizes.filter((s) => (st[s] ?? 0) <= 0).length;
      for (const f of forecastFor(p.slug, r, st, sizes, velocity)) if (f.days <= 14 && f.days > 0) fast.push({ name: p.name, region: r, size: f.size, days: f.days });
    }
  }
  fast.sort((a, b) => a.days - b.days);

  const dateLabel = yStart.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });
  const totalOrders = REGIONS.reduce((a, r) => a + (of(yesterday, r)?.orders ?? 0), 0);
  const cell = 'style="padding:8px 10px;border-bottom:1px solid #E3DDD3"';
  const salesRows = REGIONS.map((r) => {
    const y = of(yesterday, r) ?? { orders: 0, revenue: 0 };
    const w = of(lastWeek, r) ?? { orders: 0, revenue: 0 };
    const change = w.revenue > 0 ? Math.round(((y.revenue - w.revenue) / w.revenue) * 100) : null;
    const trend = change === null ? "" : `<span style="color:${change >= 0 ? "#2F6B3F" : "#A3372A"}">${change >= 0 ? "▲" : "▼"} ${Math.abs(change)}%</span>`;
    return `<tr><td ${cell}><b>${NAME[r]}</b></td><td ${cell} align="right"><b>${esc(formatMoney(Math.round(y.revenue * 100) / 100, r))}</b><br><small>${y.orders} order${y.orders === 1 ? "" : "s"}</small></td><td ${cell} align="right">${esc(formatMoney(Math.round(w.revenue * 100) / 100, r))} ${trend}</td></tr>`;
  }).join("");
  const waiting = [
    ["To pack", REGIONS.map((r) => `${NAME[r]} ${of(toPack, r)?.n ?? 0}`).join(" · ")],
    ["Packed, to hand to the courier", REGIONS.map((r) => `${NAME[r]} ${of(packed, r)?.n ?? 0}`).join(" · ")],
    ["New orders not paid yet", String(unpaid)],
    ["Returns to handle", String(returnsOpen)],
    ["Sizes sold out", REGIONS.map((r) => `${NAME[r]} ${soldOut[r]}`).join(" · ")],
  ]
    .map(([k, v]) => `<tr><td ${cell}>${esc(k)}</td><td ${cell} align="right"><b>${esc(v)}</b></td></tr>`)
    .join("");
  const fastList = fast.length
    ? `<p style="margin:16px 0 6px"><b>Selling fast</b> (sells out within 2 weeks at the recent pace):</p><ul style="margin:0;padding-left:18px">${fast
        .slice(0, 8)
        .map((f) => `<li>${esc(f.name)} · ${f.size} · ${NAME[f.region]}: ~${f.days} day${f.days === 1 ? "" : "s"} left</li>`)
        .join("")}</ul>`
    : "";

  const summary = `${totalOrders} order${totalOrders === 1 ? "" : "s"} yesterday`;
  if (!to) return `${summary}. Set OWNER_EMAIL (or TEAM_EMAIL) to receive the morning summary.`;
  const { html, text } = renderEmail({
    preheader: `${summary} · ${REGIONS.map((r) => `${r.toUpperCase()} ${formatMoney(Math.round((of(yesterday, r)?.revenue ?? 0) * 100) / 100, r)}`).join(" · ")}`,
    kicker: "Good morning",
    heading: `Your store on ${dateLabel}`,
    body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">
<tr><td ${cell}><small>Store</small></td><td ${cell} align="right"><small>Yesterday</small></td><td ${cell} align="right"><small>Same day last week</small></td></tr>${salesRows}</table>
<p style="margin:16px 0 6px"><b>Waiting today</b></p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">${waiting}</table>${fastList}`,
    cta: { label: "Open the dashboard", url: siteUrl("/admin") },
    footnote: "Sent every morning at 8:00 (India time). Cancelled and returned orders are left out of sales.",
  });
  const res = await sendEmail({ to, subject: `Morning summary: ${summary}`, html, text, template: "daily-summary" });
  return res.ok ? `${summary}. Summary emailed.` : `${summary}. Email failed: ${res.status}.`;
}
