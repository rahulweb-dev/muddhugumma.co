import "server-only";
import { db } from "../db";
import { Product } from "../models";
import { getSettings } from "../settings";
import { sendEmail } from "../notify";
import { esc, renderEmail, siteUrl } from "../email-layout";
import { lowStockExpr, stockOf } from "../admin-data";

type Row = { _id: unknown; name: string; slug: string; stock?: Record<string, number> | Map<string, number>; stockUk?: Record<string, number> | Map<string, number> };

/** Scheduled job "low-stock": emails TEAM_EMAIL a list of live products with any size at or below the threshold. */
export async function run(): Promise<string> {
  await db();
  const { lowStockThreshold: t } = await getSettings();
  const rows = await Product.find({ active: true, $expr: lowStockExpr(t) }, { name: 1, slug: 1, stock: 1, stockUk: 1 }).sort({ name: 1 }).limit(500).lean<Row[]>();
  if (!rows.length) return `No live product has a size at ${t} or fewer pieces.`;

  const lines = rows.map((p) => {
    const low = ([["IN", p.stock], ["UK", p.stockUk]] as const).flatMap(([r, s]) =>
      Object.entries(stockOf(s)).filter(([, v]) => v <= t).map(([k, v]) => [`${r} ${k}`, v] as [string, number])
    );
    return { name: p.name, id: String(p._id), low, out: low.filter(([, v]) => v === 0).length };
  });
  const outCount = lines.filter((l) => l.out).length;
  const summary = `${rows.length} product${rows.length === 1 ? "" : "s"} low on stock (threshold ${t})${outCount ? `, ${outCount} with a size sold out` : ""}.`;

  const to = process.env.TEAM_EMAIL;
  if (!to) return `${summary} TEAM_EMAIL is not set, so no email was sent.`;

  const body =
    `<p>${esc(summary)}</p><table role="presentation" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px">` +
    lines
      .map(
        (l) =>
          `<tr><td style="border-bottom:1px solid #E3DDD3"><a href="${siteUrl(`/admin/products/${l.id}`)}" style="color:#1B1A18">${esc(l.name)}</a></td>` +
          `<td style="border-bottom:1px solid #E3DDD3;text-align:right;white-space:nowrap">${l.low.map(([k, v]) => `${esc(k)}: <b style="color:${v === 0 ? "#A3372A" : "#5B3A22"}">${v}</b>`).join(" &nbsp; ")}</td></tr>`
      )
      .join("") +
    `</table>`;
  const { html, text } = renderEmail({
    preheader: summary,
    kicker: "Stock alert",
    heading: "Low stock today",
    body,
    cta: { label: "Open low stock", url: siteUrl("/admin/products?low=1") },
    footnote: `You get this because TEAM_EMAIL is set to this address. Change the threshold in Admin → Settings.`,
  });
  const res = await sendEmail({ to, subject: `Low stock: ${rows.length} product${rows.length === 1 ? "" : "s"}`, html, text, template: "low-stock" });
  return `${summary} Email ${res.status} to ${to}.`;
}
