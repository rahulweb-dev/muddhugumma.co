import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Product, StockLog, type ProductDoc, type StockLogDoc } from "@/lib/models";
import { getSettings } from "@/lib/settings";
import { escapeRx, first, fmtDateTime } from "@/lib/admin-data";
import { REGION_FLAG, REGION_NAME, isScope, requestedScope, scopeRegions } from "@/lib/admin-scope";
import { stockFor } from "@/lib/stock";
import { StockTable, type StockRow } from "@/components/admin/StockTable";
import type { Region } from "@/lib/region";
import { forecastFor, salesVelocity } from "@/lib/stock-forecast";

export const metadata: Metadata = { title: "Stock" };

type SP = Promise<Record<string, string | string[] | undefined>>;

const REASON_LABEL: Record<string, string> = {
  restock: "New stock arrived",
  sold_offline: "Sold in shop / offline",
  damaged: "Damaged or lost",
  correction: "Count correction",
  transfer: "Moved between India and UK",
  sale: "Sold online",
  order_cancelled: "Order cancelled (back in stock)",
  order_reopened: "Cancelled order reopened",
  return_received: "Return received (back in stock)",
  exchange_sent: "Exchange sent",
};

export default async function StockPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin("products.manage");
  const sp = await searchParams;
  const q = first(sp.q).trim().slice(0, 80);
  const showRaw = first(sp.show);
  const show = showRaw === "low" || showRaw === "out" || showRaw === "soon" ? showRaw : "";
  const storeRaw = first(sp.store);
  // ?store= (from dashboard links) overrides the top-bar switcher for this page only.
  const scope = await requestedScope(storeRaw);
  const regions = scopeRegions(scope);

  await db();
  const { lowStockThreshold: t } = await getSettings();
  const filter: Record<string, unknown> = {};
  if (q) filter.name = new RegExp(escapeRx(q), "i");
  const [docs, logs] = await Promise.all([
    Product.find(filter, { name: 1, slug: 1, images: 1, freeSize: 1, active: 1, category: 1, stock: 1, stockUk: 1 }).sort({ active: -1, name: 1 }).limit(400).lean<ProductDoc[]>(),
    StockLog.find(scope === "all" ? {} : { region: scope }).sort({ createdAt: -1 }).limit(30).lean<(StockLogDoc & { _id: unknown })[]>(),
  ]);

  const velocity = await salesVelocity(regions);
  const SIZE_KEYS = ["XS", "S", "M", "L", "XL", "XXL"];
  const rows: StockRow[] = docs
    .map((p) => ({
      id: String(p._id),
      name: p.name,
      slug: p.slug,
      image: p.images?.[0] ?? "",
      freeSize: !!p.freeSize,
      active: p.active !== false,
      stock: Object.fromEntries(regions.map((r) => [r, stockFor(p, r)])) as StockRow["stock"],
      // Soonest sell-out per store at the last 30 days' pace, and how many to add to cover the next 30 days.
      forecast: Object.fromEntries(
        regions.map((r) => {
          const f = forecastFor(p.slug, r, stockFor(p, r), p.freeSize ? ["Free size"] : SIZE_KEYS, velocity);
          const soonest = f.reduce<(typeof f)[number] | null>((a, x) => (!a || x.days < a.days ? x : a), null);
          return [r, soonest ? { days: soonest.days, size: soonest.size, restock: f.reduce((a, x) => a + x.restock, 0) } : null];
        })
      ) as StockRow["forecast"],
    }))
    .filter((row) => {
      if (!show) return true;
      const vals = (r: Region) => {
        const s = row.stock[r] ?? {};
        return row.freeSize ? [s["Free size"] ?? 0] : ["XS", "S", "M", "L", "XL", "XXL"].map((k) => s[k] ?? 0);
      };
      if (show === "soon") return regions.some((r) => (row.forecast?.[r]?.days ?? Infinity) <= 14);
      return regions.some((r) => (show === "out" ? vals(r).some((v) => v <= 0) : vals(r).some((v) => v <= t)));
    });

  const where = scope === "all" ? "India & UK" : `${REGION_FLAG[scope]} ${REGION_NAME[scope]}`;
  const tab = (s: string, label: string) => {
    const qs = new URLSearchParams({ ...(q ? { q } : {}), ...(s ? { show: s } : {}), ...(isScope(storeRaw) ? { store: storeRaw } : {}) }).toString();
    return (
      <Link className={`chip ${show === s ? "adm-chip-on" : ""}`} href={`/admin/stock${qs ? `?${qs}` : ""}`} aria-current={show === s ? "page" : undefined}>
        {label}
      </Link>
    );
  };

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">Stock & products · {where}</p>
          <h1 className="adm-title">Stock</h1>
          <p className="muted adm-small">Change any number, then press Save. India and the UK have separate stock: each site only sells its own.</p>
        </div>
        <div className="adm-row">
          <Link className="btn ghost adm-btn" href="/admin/products/import">Bulk upload (CSV)</Link>
        </div>
      </header>

      <form className="adm-filters" action="/admin/stock">
        <div className="field grow">
          <label htmlFor="stock-q">Find a product</label>
          <input id="stock-q" name="q" defaultValue={q} placeholder="e.g. georgette saree" />
        </div>
        {show && <input type="hidden" name="show" value={show} />}
        {isScope(storeRaw) && <input type="hidden" name="store" value={storeRaw} />}
        <button className="btn adm-btn" type="submit">Search</button>
        {(q || show) && <Link className="adm-more" href="/admin/stock">Clear</Link>}
      </form>

      <nav className="adm-row" aria-label="Show">
        {tab("", "All products")}
        {tab("low", `Running low (${t} or fewer)`)}
        {tab("out", "Sold out sizes")}
        {tab("soon", "Selling fast (out within 2 weeks)")}
        {(storeRaw === "in" || storeRaw === "uk") && <span className="muted adm-small">Showing {REGION_NAME[storeRaw]} only (from the dashboard) · <Link className="adm-a" href="/admin/stock">Show the top-bar store</Link></span>}
      </nav>

      <StockTable key={`${scope}|${q}|${show}`} rows={rows} regions={regions} threshold={t} />

      <section className="adm-card" aria-labelledby="hist-h">
        <div className="adm-card-head">
          <h2 className="h3" id="hist-h">Recent stock changes</h2>
          <span className="muted adm-small">Every change: edits made here, online sales, cancellations, returns and exchanges.</span>
        </div>
        {logs.length ? (
          <div className="table-wrap">
            <table className="t adm-t">
              <thead>
                <tr><th>When</th><th>Product</th><th>Store</th><th>Size</th><th className="num">Change</th><th>Why</th><th>By</th></tr>
              </thead>
              <tbody>
                {logs.map((l) => {
                  const d = l.change ?? (l.to ?? 0) - (l.from ?? 0);
                  return (
                    <tr key={String(l._id)}>
                      <td className="nowrap">{fmtDateTime(l.createdAt)}</td>
                      <td>{l.name}</td>
                      <td className="nowrap">{REGION_FLAG[l.region]} {REGION_NAME[l.region]}</td>
                      <td>{l.size}</td>
                      <td className="num nowrap"><span className={d >= 0 ? "dash-up" : "dash-down"}>{d >= 0 ? `+${d}` : d}</span> {l.from !== undefined && l.to !== undefined ? <small className="muted">({l.from} → {l.to})</small> : null}</td>
                      <td>{REASON_LABEL[l.reason] ?? l.reason}{l.note ? <small className="muted block">{l.note}</small> : null}</td>
                      <td>{l.byName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted adm-empty">No changes yet. When someone updates stock here, it is listed with who did it and why.</p>
        )}
      </section>
    </div>
  );
}
