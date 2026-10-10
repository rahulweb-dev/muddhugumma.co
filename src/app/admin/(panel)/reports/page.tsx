import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatMoney, REGION_CONFIG, type Region } from "@/lib/region";
import { categoryLabel } from "@/lib/types";
import { first, qs } from "@/lib/admin-data";
import { Bars, Split } from "@/components/admin/Bars";
import { PRESETS, loadReport, resolveRange, type RegionReport } from "./data";
import { getAdminScope, getStoreLock } from "@/lib/admin-scope";

export const metadata: Metadata = { title: "Reports" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const pct = (n: number) => `${(n * 100).toFixed(n > 0 && n < 0.1 ? 1 : 0)}%`;
const catLabel = (k: string) => (k ? categoryLabel(k) : "Other / removed products");

export default async function ReportsPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin("reports.view");
  const sp = await searchParams;
  const range = resolveRange({ range: first(sp.range), from: first(sp.from), to: first(sp.to) });
  // No ?region: start on the store picked in the top bar (India when both are shown).
  const scope = await getAdminScope();
  const lock = await getStoreLock();
  const region: Region = lock || (first(sp.region) === "uk" ? "uk" : first(sp.region) === "in" ? "in" : scope === "uk" ? "uk" : "in");
  const data = await loadReport(range);
  const r = data[region];
  const money = (n: number) => formatMoney(Math.round(n * 100) / 100, region);
  const rangeQs = range.preset === "custom" ? { from: range.from, to: range.to } : { range: range.preset };

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">Overview</p>
          <h1 className="adm-title">Reports</h1>
          <p className="muted adm-small">{range.label} · {range.from} to {range.to} · orders by date placed, revenue excludes cancelled and returned orders.</p>
        </div>
        <a className="btn ghost adm-btn" href={`/admin/reports/export?from=${range.from}&to=${range.to}`} download>Export orders CSV</a>
      </header>

      <form className="adm-filters" method="get">
        <nav className="adm-row" aria-label="Period">
          {PRESETS.map((p) => (
            <Link key={p.key} className={`chip ${range.preset === p.key ? "adm-chip-on" : ""}`} href={`/admin/reports${qs({ region, range: p.key })}`} aria-current={range.preset === p.key ? "page" : undefined}>
              {p.label}
            </Link>
          ))}
        </nav>
        <input type="hidden" name="region" value={region} />
        <div className="field">
          <label htmlFor="from">From</label>
          <input id="from" name="from" type="date" defaultValue={range.from} />
        </div>
        <div className="field">
          <label htmlFor="to">To</label>
          <input id="to" name="to" type="date" defaultValue={range.to} />
        </div>
        <button className="btn ghost adm-btn">Show</button>
      </form>

      <section className="kpis" aria-label="Both regions">
        {(["in", "uk"] as const).map((x) => (
          <div key={x} className="kpi">
            <span>Revenue {REGION_CONFIG[x].label}</span>
            <b>{formatMoney(data[x].revenue, x)}</b>
            <small>{data[x].liveOrders} orders · AOV {formatMoney(data[x].aov, x)}</small>
          </div>
        ))}
      </section>

      <nav className="adm-tabs" aria-label="Region">
        {(["in", "uk"] as const).map((x) => (
          <Link key={x} href={`/admin/reports${qs({ ...rangeQs, region: x })}`} aria-current={region === x ? "page" : undefined}>
            {REGION_CONFIG[x].label} ({REGION_CONFIG[x].currency}) <span>{data[x].orders}</span>
          </Link>
        ))}
      </nav>

      <RegionView r={r} money={money} />
    </div>
  );
}

function RegionView({ r, money }: { r: RegionReport; money: (n: number) => string }) {
  const custHref = (email: string) => `/admin/orders?q=${encodeURIComponent(email)}`;
  return (
    <>
      <section className="kpis" aria-label="Key figures">
        <Kpi label="Orders placed" value={String(r.orders)} note={`${r.liveOrders} still live`} />
        <Kpi label="Revenue" value={money(r.revenue)} note="Order totals incl. shipping" />
        <Kpi label="Average order" value={money(r.aov)} />
        <Kpi label="Pieces sold" value={String(r.units)} />
        <Kpi label="Cancellation rate" value={pct(r.cancellationRate)} note={`${r.cancelled} cancelled`} />
        <Kpi label="Return rate" value={pct(r.returnRate)} note={`${r.returnRequests} return requests · ${r.returnedOrders} orders marked returned`} />
      </section>

      <section className="adm-card">
        <div className="adm-card-head">
          <h2 className="h3">Revenue per day</h2>
          <span className="muted adm-small">Bars to scale · highest {money(Math.max(0, ...r.daily.map((d) => d.revenue)))}</span>
        </div>
        <DailyChart daily={r.daily} money={money} />
      </section>

      <div className="adm-cols">
        <section className="adm-card">
          <h2 className="h3">Best sellers by pieces</h2>
          <Bars label="Best sellers by pieces" rows={r.bestByUnits.map((b) => ({ label: b.label, value: b.units, display: `${b.units}`, note: money(b.revenue) }))} />
        </section>
        <section className="adm-card">
          <h2 className="h3">Best sellers by revenue</h2>
          <Bars label="Best sellers by revenue" rows={r.bestByRevenue.map((b) => ({ label: b.label, value: b.revenue, display: money(b.revenue), note: `${b.units} pcs` }))} />
        </section>
        <section className="adm-card">
          <h2 className="h3">Category split</h2>
          <p className="muted adm-small">Item sales before order discounts and shipping.</p>
          <Bars label="Revenue by category" rows={r.categories.map((c) => ({ label: catLabel(c.key), value: c.revenue, display: money(c.revenue), note: `${c.units} pcs` }))} />
        </section>
        <section className="adm-card">
          <h2 className="h3">Cash on delivery vs prepaid</h2>
          <p className="adm-small m-0">By orders</p>
          <Split a={{ label: "COD", value: r.cod.orders, display: String(r.cod.orders) }} b={{ label: "Prepaid", value: r.prepaid.orders, display: String(r.prepaid.orders) }} />
          <p className="adm-small m-0">By revenue</p>
          <Split a={{ label: "COD", value: r.cod.revenue, display: money(r.cod.revenue) }} b={{ label: "Prepaid", value: r.prepaid.revenue, display: money(r.prepaid.revenue) }} />
        </section>
        <section className="adm-card">
          <h2 className="h3">Top customers</h2>
          <Bars
            label="Top customers by revenue"
            rows={r.topCustomers.map((c) => ({ label: c.name || c.email, value: c.revenue, display: money(c.revenue), note: `${c.orders} order${c.orders === 1 ? "" : "s"}`, href: custHref(c.email) }))}
          />
        </section>
        {r.margin ? (
          <section className="adm-card">
            <h2 className="h3">Margins · India only</h2>
            <p className="muted adm-small">
              Cost prices are kept in rupees, so margins are shown for India orders only. Margin = item sales − cost price × pieces, before order discounts, shipping and fees.
            </p>
            <dl className="adm-totals">
              <div><dt>Item sales (with a cost price)</dt><dd>{money(r.margin.itemRevenue)}</dd></div>
              <div><dt>Cost of those pieces</dt><dd>−{money(r.margin.cost)}</dd></div>
              <div className="grand"><dt>Gross margin</dt><dd>{money(r.margin.margin)} ({pct(r.margin.pct)})</dd></div>
            </dl>
            {r.margin.unitsWithoutCost ? (
              <p className="notice adm-small">
                {r.margin.unitsWithoutCost} piece{r.margin.unitsWithoutCost === 1 ? "" : "s"} from {r.margin.productsWithoutCost} product{r.margin.productsWithoutCost === 1 ? "" : "s"} have no cost price and are left out.
                Add cost prices on the product form or in <Link className="adm-a" href="/admin/products/import">bulk upload</Link>.
              </p>
            ) : null}
            <Bars label="Margin by product" rows={r.margin.byProduct.map((m) => ({ label: m.label, value: Math.max(0, m.margin), display: money(m.margin), note: m.revenue ? pct(m.margin / m.revenue) : "" }))} empty="No India sales with a cost price in this period." />
          </section>
        ) : (
          <section className="adm-card">
            <h2 className="h3">Margins</h2>
            <p className="muted adm-small">Margins are India-only because cost prices are kept in rupees. Switch to the India tab to see them.</p>
          </section>
        )}
      </div>
    </>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="kpi">
      <span>{label}</span>
      <b>{value}</b>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

function DailyChart({ daily, money }: { daily: { day: string; revenue: number; orders: number }[]; money: (n: number) => string }) {
  const max = Math.max(0, ...daily.map((d) => d.revenue));
  const W = 700, H = 180, L = 4, R = 4, T = 8, B = 22;
  const iw = W - L - R, ih = H - T - B;
  const bw = iw / Math.max(daily.length, 1);
  const labelEvery = Math.ceil(daily.length / 10);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Daily revenue. Highest day ${money(max)}.`}>
        <line className="chart-grid" x1={L} x2={W - R} y1={T} y2={T} />
        <line className="chart-grid" x1={L} x2={W - R} y1={T + ih / 2} y2={T + ih / 2} />
        {daily.map((d, i) => {
          const h = max ? (d.revenue / max) * ih : 0;
          const x = L + i * bw + bw * 0.12;
          return (
            <g key={d.day}>
              <title>{`${d.day}: ${money(d.revenue)} from ${d.orders} order${d.orders === 1 ? "" : "s"}`}</title>
              <rect className="bar" x={x} y={T + ih - h} width={Math.max(bw * 0.76, 0.6)} height={h} />
              {i % labelEvery === 0 ? <text className="ax" x={x + bw * 0.38} y={H - 6} textAnchor="middle">{d.day.slice(8)}/{d.day.slice(5, 7)}</text> : null}
            </g>
          );
        })}
        <line className="base" x1={L} x2={W - R} y1={T + ih} y2={T + ih} />
      </svg>
    </figure>
  );
}
