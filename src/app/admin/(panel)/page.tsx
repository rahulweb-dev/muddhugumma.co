import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { requireAdmin } from "@/lib/auth";
import { can, PERMISSIONS, type Permission } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { Booking, Order, Product, ReturnRequest, Review } from "@/lib/models";
import { formatMoney, type Region } from "@/lib/region";
import { dayKey, first, fmtDateTime, startOfToday, stitchingItemMatch, type LeanOrder } from "@/lib/admin-data";
import { REGION_FLAG, REGION_NAME, getAdminScope, scopeFilter, scopeRegions } from "@/lib/admin-scope";
import { orderStatusLabel, paymentStatusLabel } from "@/lib/admin-labels";
import { stockField } from "@/lib/stock";

export const metadata: Metadata = { title: "Dashboard" };

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LIVE = { $nin: ["cancelled", "returned"] };
const OPEN_RETURNS = ["requested", "approved", "pickup_scheduled", "picked_up", "received"];

type SP = Promise<Record<string, string | string[] | undefined>>;
type Sales = { _id: { region: Region; bucket: string }; orders: number; revenue: number };
type StockHealth = { _id: null; inStock: number; low: number; soldOut: number; outSizes: number };
type LowRow = { _id: unknown; name: string; images: string[]; low: { k: string; v: number }[] };

const none = <T,>(v: T) => Promise.resolve(v);

/** Product sizes at or below the threshold in one region's stock field, as [{ k: "M", v: 1 }]. */
const lowSizes = (field: string, t: number) => ({
  $filter: { input: { $objectToArray: { $ifNull: [`$${field}`, {}] } }, cond: { $lte: ["$$this.v", t] } },
});

/** In stock / running low / sold out for one region's stock field. */
function healthPipeline(field: string, t: number) {
  const sizes = { $objectToArray: { $ifNull: [`$${field}`, {}] } };
  return [
    { $match: { active: true } },
    {
      $project: {
        any: { $anyElementTrue: [{ $map: { input: sizes, in: { $gt: ["$$this.v", 0] } } }] },
        low: { $anyElementTrue: [{ $map: { input: sizes, in: { $and: [{ $gt: ["$$this.v", 0] }, { $lte: ["$$this.v", t] }] } } }] },
        outSizes: { $size: { $filter: { input: sizes, cond: { $lte: ["$$this.v", 0] } } } },
      },
    },
    {
      $group: {
        _id: null,
        inStock: { $sum: { $cond: ["$any", 1, 0] } },
        low: { $sum: { $cond: ["$low", 1, 0] } },
        soldOut: { $sum: { $cond: ["$any", 0, 1] } },
        outSizes: { $sum: "$outSizes" },
      },
    },
  ];
}

/** "Good morning" in the store's timezone. */
function greeting(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "numeric", hourCycle: "h23" }).format(now));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function AdminDashboard({ searchParams }: { searchParams: SP }) {
  // Any staff member may land here (requireAdmin redirects denied pages to /admin); each section checks its own permission.
  const [admin, scope] = await Promise.all([requireAdmin(), getAdminScope()]);
  const sp = await searchParams;
  const deniedRaw = first(sp.denied);
  const denied = deniedRaw in PERMISSIONS ? PERMISSIONS[deniedRaw as Permission] : deniedRaw ? "that page" : "";
  const may = (p: Permission) => can(admin.role, p);
  const regions = scopeRegions(scope);
  const inScope = scopeFilter(scope);

  await db();
  const settings = await getSettings();
  const t = settings.lowStockThreshold;
  const today = startOfToday();
  const since7 = new Date(today.getTime() - 6 * DAY);
  const since14 = new Date(today.getTime() - 13 * DAY);
  const since30 = new Date(today.getTime() - 29 * DAY);
  const mtoSlugs = may("stitching.manage") ? await Product.distinct("slug", { madeToOrder: true }) : [];

  const bucket = {
    $switch: {
      branches: [
        { case: { $gte: ["$createdAt", today] }, then: "today" },
        { case: { $gte: ["$createdAt", since7] }, then: "week" },
        { case: { $gte: ["$createdAt", since14] }, then: "prevWeek" },
      ],
      default: "older",
    },
  };

  const [sales, daily, waiting, waitingCount, recent, newOrders, toPack, packed, returnsOpen, bookingsRequested, reviewsPending, stitchingOpen, health, lowLists] = await Promise.all([
    may("reports.view")
      ? Order.aggregate<Sales>([
          { $match: { ...inScope, createdAt: { $gte: since30 }, status: LIVE } },
          { $group: { _id: { region: "$region", bucket }, orders: { $sum: 1 }, revenue: { $sum: { $ifNull: ["$total", 0] } } } },
        ])
      : none([] as Sales[]),
    may("orders.view") ? Order.find({ ...inScope, createdAt: { $gte: since14 } }, { createdAt: 1, region: 1 }).lean<{ createdAt: Date; region: Region }[]>() : none([] as { createdAt: Date; region: Region }[]),
    may("orders.view") ? Order.find({ ...inScope, status: { $in: ["placed", "confirmed"] } }).sort({ createdAt: 1 }).limit(6).lean<LeanOrder[]>() : none([] as LeanOrder[]),
    may("orders.view") ? Order.countDocuments({ ...inScope, status: { $in: ["placed", "confirmed"] } }) : none(0),
    may("orders.view") ? Order.find(inScope).sort({ createdAt: -1 }).limit(8).lean<LeanOrder[]>() : none([] as LeanOrder[]),
    may("orders.view") ? Order.countDocuments({ ...inScope, status: "placed" }) : none(0),
    may("orders.ship") ? Order.countDocuments({ ...inScope, status: "confirmed" }) : none(0),
    may("orders.ship") ? Order.countDocuments({ ...inScope, status: "packed" }) : none(0),
    may("returns.manage") ? ReturnRequest.countDocuments({ ...inScope, status: { $in: OPEN_RETURNS } }) : none(0),
    may("bookings.manage") ? Booking.countDocuments({ ...inScope, status: "requested" }) : none(0),
    may("reviews.manage") ? Review.countDocuments({ status: "pending" }) : none(0),
    may("stitching.manage")
      ? Order.aggregate<{ n: number }>([
          { $match: { ...inScope, status: { $in: ["confirmed", "packed"] } } },
          { $unwind: "$items" },
          { $match: { $and: [stitchingItemMatch(mtoSlugs, "items."), { "items.stitching.status": { $ne: "ready" } }] } },
          { $count: "n" },
        ]).then((r) => r[0]?.n ?? 0)
      : none(0),
    may("products.manage")
      ? Promise.all(regions.map((r) => Product.aggregate<StockHealth>(healthPipeline(stockField(r), t)).then((x) => [r, x[0] ?? { inStock: 0, low: 0, soldOut: 0, outSizes: 0 }] as const)))
      : none([] as (readonly [Region, StockHealth])[]),
    may("products.manage")
      ? Promise.all(
          regions.map((r) =>
            Product.aggregate<LowRow>([
              { $match: { active: true } },
              { $project: { name: 1, images: 1, low: lowSizes(stockField(r), t) } },
              { $match: { "low.0": { $exists: true } } },
              { $sort: { name: 1 } },
              { $limit: 6 },
            ]).then((rows) => [r, rows] as const)
          )
        )
      : none([] as (readonly [Region, LowRow[]])[]),
  ]);

  const money = (r: Region, n: number) => formatMoney(Math.round(n * 100) / 100, r);
  const sum = (r: Region, buckets: string[]) => {
    const rows = sales.filter((s) => s._id.region === r && buckets.includes(s._id.bucket));
    return { orders: rows.reduce((a, s) => a + s.orders, 0), revenue: rows.reduce((a, s) => a + s.revenue, 0) };
  };
  const soldOutSizes = health.reduce((a, [, h]) => a + h.outSizes, 0);

  // Daily orders for the last 14 days, per region, bucketed in the store's timezone.
  const days = Array.from({ length: 14 }, (_, i) => new Date(since14.getTime() + i * DAY + DAY / 2));
  const series = days.map((d) => {
    const key = dayKey(d);
    const of = (r: Region) => daily.filter((o) => o.region === r && dayKey(new Date(o.createdAt)) === key).length;
    return { key, in: regions.includes("in") ? of("in") : 0, uk: regions.includes("uk") ? of("uk") : 0 };
  });

  const where = scope === "all" ? "India & UK" : `${REGION_FLAG[scope]} ${REGION_NAME[scope]}`;
  const todo: { label: string; n: number; href: string; note: string; tone: "act" | "warn" }[] = [];
  if (may("orders.ship")) todo.push({ label: "To pack", n: toPack, href: "/admin/packing", note: toPack ? "Paid or COD orders ready to pack" : "Nothing to pack", tone: "act" });
  if (may("orders.ship")) todo.push({ label: "Packed, to dispatch", n: packed, href: "/admin/packing", note: packed ? "Hand these to the courier" : "Nothing waiting", tone: "act" });
  if (may("orders.view")) todo.push({ label: "New, not paid yet", n: newOrders, href: "/admin/orders?status=placed", note: newOrders ? "Online payment still pending" : "None", tone: "warn" });
  if (may("returns.manage")) todo.push({ label: "Returns to handle", n: returnsOpen, href: "/admin/returns", note: returnsOpen ? "Requested, collected or received" : "None open", tone: "act" });
  if (may("products.manage")) todo.push({ label: "Sizes sold out", n: soldOutSizes, href: "/admin/stock?show=out", note: soldOutSizes ? "Restock or hide them" : "Everything in stock", tone: "warn" });
  if (may("stitching.manage")) todo.push({ label: "In tailoring", n: stitchingOpen, href: "/admin/stitching", note: "Blouses and made-to-order", tone: "act" });
  if (may("bookings.manage")) todo.push({ label: "Video consults to confirm", n: bookingsRequested, href: "/admin/bookings", note: "Waiting for a time slot", tone: "act" });
  if (may("reviews.manage")) todo.push({ label: "Reviews to approve", n: reviewsPending, href: "/admin/reviews", note: "Not on the site yet", tone: "act" });

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">{where} · {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })}</p>
          <h1 className="adm-title">{greeting()}, {admin.name.split(" ")[0]}</h1>
        </div>
        <div className="adm-row">
          {may("products.manage") && <Link className="btn ghost adm-btn" href="/admin/stock">Update stock</Link>}
          {may("products.manage") && <Link className="btn adm-btn" href="/admin/products/new">Add a product</Link>}
        </div>
      </header>

      {denied ? (
        <p className="notice err" role="alert">
          You don&apos;t have access to {denied === "that page" ? "that page" : <>“{denied.toLowerCase()}”</>}. Ask the store owner to change your role if you need it.
        </p>
      ) : null}

      {todo.length > 0 && (
        <section aria-labelledby="todo-h" className="dash-sec">
          <h2 className="dash-h" id="todo-h">Waiting for you</h2>
          <div className="dash-todo">
            {todo.map((x) => (
              <Link key={x.label} href={x.href} className={`dash-task ${x.n ? x.tone : "done"}`}>
                <b>{x.n}</b>
                <span>{x.label}</span>
                <small>{x.note}</small>
              </Link>
            ))}
          </div>
        </section>
      )}

      {may("reports.view") && (
        <section className="adm-card" aria-labelledby="sales-h">
          <div className="adm-card-head">
            <h2 className="h3" id="sales-h">Sales</h2>
            <Link className="adm-more" href="/admin/reports">Full report</Link>
          </div>
          <div className="table-wrap">
            <table className="t adm-t dash-sales">
              <thead>
                <tr><th>Store</th><th className="num">Today</th><th className="num">Last 7 days</th><th className="num">Last 30 days</th></tr>
              </thead>
              <tbody>
                {regions.map((r) => {
                  const d = sum(r, ["today"]);
                  const w = sum(r, ["today", "week"]);
                  const pw = sum(r, ["prevWeek"]);
                  const m = sum(r, ["today", "week", "prevWeek", "older"]);
                  const change = pw.revenue > 0 ? Math.round(((w.revenue - pw.revenue) / pw.revenue) * 100) : null;
                  return (
                    <tr key={r}>
                      <th scope="row">{REGION_FLAG[r]} {REGION_NAME[r]}</th>
                      <td className="num"><b>{money(r, d.revenue)}</b><small className="muted block">{d.orders} order{d.orders === 1 ? "" : "s"}</small></td>
                      <td className="num">
                        <b>{money(r, w.revenue)}</b>
                        <small className="block">
                          {change === null ? <span className="muted">{w.orders} orders</span> : <span className={change >= 0 ? "dash-up" : "dash-down"}>{change >= 0 ? "▲" : "▼"} {Math.abs(change)}% vs week before</span>}
                        </small>
                      </td>
                      <td className="num"><b>{money(r, m.revenue)}</b><small className="muted block">{m.orders} orders · avg {money(r, m.orders ? m.revenue / m.orders : 0)}</small></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted adm-small">Cancelled and returned orders are left out. Rupees and pounds are never added together.</p>
        </section>
      )}

      {may("orders.view") && (
        <section className="adm-card" aria-labelledby="daily-h">
          <div className="adm-card-head">
            <h2 className="h3" id="daily-h">Orders per day · last 14 days</h2>
            <span className="dash-legend">
              {regions.includes("in") && <span className="in">India</span>}
              {regions.includes("uk") && <span className="uk">UK</span>}
            </span>
          </div>
          <BarChart series={series} />
        </section>
      )}

      {may("products.manage") && health.length > 0 && (
        <section className="adm-card" aria-labelledby="health-h">
          <div className="adm-card-head">
            <h2 className="h3" id="health-h">Stock health</h2>
            <Link className="adm-more" href="/admin/stock">Open stock</Link>
          </div>
          <div className={`dash-health ${health.length > 1 ? "two" : ""}`}>
            {health.map(([r, h]) => (
              <div key={r}>
                <h3 className="dash-h">{REGION_FLAG[r]} {REGION_NAME[r]}</h3>
                <dl>
                  <div className="ok"><dt>In stock</dt><dd>{h.inStock} products</dd></div>
                  <div className={h.low ? "warn" : "ok"}><dt>Running low ({t} or fewer)</dt><dd><Link href={`/admin/stock?show=low&store=${r}`}>{h.low} products</Link></dd></div>
                  <div className={h.soldOut ? "bad" : "ok"}><dt>Completely sold out</dt><dd><Link href={`/admin/stock?show=out&store=${r}`}>{h.soldOut} products</Link></dd></div>
                </dl>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="adm-cols">
        {may("orders.view") && (
          <section className="adm-card">
            <div className="adm-card-head">
              <h2 className="h3">Orders waiting</h2>
              <Link className="adm-more" href="/admin/orders">{waitingCount} open</Link>
            </div>
            {waiting.length ? (
              <ul className="adm-list">
                {waiting.map((o) => (
                  <li key={String(o._id)}>
                    <Link href={`/admin/orders/${o._id}`}>
                      <div>
                        <b>{REGION_FLAG[o.region === "uk" ? "uk" : "in"]} {o.number}</b>
                        <small className="muted">{o.address?.name || o.email} · {fmtDateTime(o.createdAt)}</small>
                      </div>
                      <div className="adm-list-end">
                        <span>{formatMoney(o.total ?? 0, o.region)}</span>
                        <span className={`status ${o.status}`}>{orderStatusLabel(o.status)}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted adm-empty">All caught up: every order is packed or on its way.</p>
            )}
          </section>
        )}

        {may("products.manage") && (
          <section className="adm-card">
            <div className="adm-card-head">
              <h2 className="h3">Running low · {t} or fewer</h2>
              <Link className="adm-more" href="/admin/stock?show=low">Restock</Link>
            </div>
            {lowLists.some(([, rows]) => rows.length) ? (
              <ul className="adm-list">
                {lowLists.flatMap(([r, rows]) =>
                  rows.map((p) => (
                    <li key={`${r}-${String(p._id)}`}>
                      <Link href={`/admin/stock?q=${encodeURIComponent(p.name)}&store=${r}`}>
                        <div className="adm-prod">
                          <span className="adm-thumb sm">{p.images?.[0] ? <Image src={p.images[0]} alt="" width={30} height={40} /> : null}</span>
                          <span><b>{p.name}</b><small className="muted block">{REGION_FLAG[r]} {REGION_NAME[r]}</small></span>
                        </div>
                        <div className="adm-list-end adm-sizes">
                          {p.low.map((s) => (
                            <span key={s.k} className={s.v <= 0 ? "out" : ""}>{s.k}: {s.v}</span>
                          ))}
                        </div>
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            ) : (
              <p className="muted adm-empty">Every live size has more than {t} pieces.</p>
            )}
          </section>
        )}
      </div>

      {may("orders.view") && (
        <section className="adm-card">
          <div className="adm-card-head">
            <h2 className="h3">Latest orders</h2>
            <Link className="adm-more" href="/admin/orders">All orders</Link>
          </div>
          {recent.length ? (
            <div className="table-wrap">
              <table className="t adm-t">
                <thead>
                  <tr><th>Order</th><th>Customer</th><th>Placed</th><th>Payment</th><th>Status</th><th className="num">Total</th></tr>
                </thead>
                <tbody>
                  {recent.map((o) => (
                    <tr key={String(o._id)}>
                      <td><Link className="adm-a" href={`/admin/orders/${o._id}`}>{REGION_FLAG[o.region === "uk" ? "uk" : "in"]} {o.number}</Link></td>
                      <td>{o.address?.name || "—"}<br /><small className="muted">{o.email}</small></td>
                      <td className="nowrap">{fmtDateTime(o.createdAt)}</td>
                      <td><span className={`status ${o.payment?.status ?? "pending"}`}>{paymentStatusLabel(o.payment?.status)}</span></td>
                      <td><span className={`status ${o.status}`}>{orderStatusLabel(o.status)}</span></td>
                      <td className="num">{formatMoney(o.total ?? 0, o.region)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted adm-empty">No orders yet. They will appear here as soon as the first checkout completes.</p>
          )}
        </section>
      )}
    </div>
  );
}

/** Stacked daily bars: India (dark) and UK (bronze). */
function BarChart({ series }: { series: { key: string; in: number; uk: number }[] }) {
  const max = Math.max(...series.map((s) => s.in + s.uk), 0);
  // Round the axis up to a clean number so gridlines land on integers.
  const step = max <= 4 ? 1 : Math.ceil(max / 4);
  const top = Math.max(step * 4, 4);
  const ticks = [0, 1, 2, 3, 4].map((i) => i * (top / 4));
  const W = 700, H = 220, L = 34, R = 8, T = 12, B = 34;
  const iw = W - L - R, ih = H - T - B;
  const bw = iw / series.length;
  const y = (v: number) => T + ih - (v / top) * ih;
  const total = series.reduce((a, s) => a + s.in + s.uk, 0);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Orders per day for the last 14 days: ${total} in total, highest ${max} in a day.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="chart-grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
            <text className="ax" x={L - 8} y={y(t) + 4} textAnchor="end">{Number.isInteger(t) ? t : t.toFixed(1)}</text>
          </g>
        ))}
        {series.map((s, i) => {
          const hIn = (s.in / top) * ih;
          const hUk = (s.uk / top) * ih;
          const n = s.in + s.uk;
          const x = L + i * bw + bw * 0.18;
          const [, mm, dd] = s.key.split("-").map(Number);
          return (
            <g key={s.key}>
              <title>{`${s.key}: ${s.in} India, ${s.uk} UK`}</title>
              {s.in > 0 && <rect className="bar bar-in" x={x} y={T + ih - hIn} width={bw * 0.64} height={Math.max(hIn, 2)} />}
              {s.uk > 0 && <rect className="bar bar-uk" x={x} y={T + ih - hIn - hUk} width={bw * 0.64} height={Math.max(hUk, 2)} />}
              {n > 0 && <text className="val" x={x + bw * 0.32} y={T + ih - hIn - hUk - 4} textAnchor="middle">{n}</text>}
              <text className="ax" x={x + bw * 0.32} y={H - B + 16} textAnchor="middle">{dd}</text>
              {(i === 0 || dd === 1) && <text className="ax mo" x={x + bw * 0.32} y={H - B + 29} textAnchor="middle">{MONTHS[(mm || 1) - 1]}</text>}
            </g>
          );
        })}
        <line className="base" x1={L} x2={W - R} y1={T + ih} y2={T + ih} />
      </svg>
    </figure>
  );
}
