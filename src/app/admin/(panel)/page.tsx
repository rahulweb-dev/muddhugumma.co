import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { requireAdmin } from "@/lib/auth";
import { can, PERMISSIONS, type Permission } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { Booking, Order, Product, ReturnRequest, Review, User } from "@/lib/models";
import { formatMoney, type Region } from "@/lib/region";
import { dayKey, first, fmtDateTime, lowStockExpr, startOfToday, stitchingItemMatch, type LeanOrder } from "@/lib/admin-data";

export const metadata: Metadata = { title: "Dashboard" };

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LIVE = { $nin: ["cancelled", "returned"] };
const OPEN_RETURNS = ["requested", "approved", "pickup_scheduled", "picked_up", "received"];

type RegionAgg = { _id: Region; orders: number; revenue: number };
const lowSizes = (field: string, label: string, t: number) => ({
  $map: {
    input: { $filter: { input: { $objectToArray: { $ifNull: [field, {}] } }, cond: { $lte: ["$this.v", t] } } },
    in: { k: { $concat: [`${label} `, "$this.k"] }, v: "$this.v" },
  },
});
type LowStock = { _id: unknown; name: string; slug: string; images: string[]; low: { k: string; v: number }[] };
type SP = Promise<Record<string, string | string[] | undefined>>;

const none = <T,>(v: T) => Promise.resolve(v);

export default async function AdminDashboard({ searchParams }: { searchParams: SP }) {
  // Any staff member may land here (requireAdmin redirects denied pages to /admin); each section checks its own permission.
  const admin = await requireAdmin();
  const sp = await searchParams;
  const deniedRaw = first(sp.denied);
  const denied = deniedRaw in PERMISSIONS ? PERMISSIONS[deniedRaw as Permission] : deniedRaw ? "that page" : "";
  const may = (p: Permission) => can(admin.role, p);

  await db();
  const settings = await getSettings();
  const t = settings.lowStockThreshold;
  const today = startOfToday();
  const since30 = new Date(today.getTime() - 29 * DAY);
  const since14 = new Date(today.getTime() - 13 * DAY);
  const mtoSlugs = may("stitching.manage") ? await Product.distinct("slug", { madeToOrder: true }) : [];

  const [ordersToday, orders30, byRegion, daily, needsAction, needsActionCount, lowStock, recent, customers, returnsOpen, bookingsRequested, reviewsPending, stitchingOpen, toPack, packed] = await Promise.all([
    may("orders.view") ? Order.countDocuments({ createdAt: { $gte: today } }) : none(0),
    may("orders.view") ? Order.countDocuments({ createdAt: { $gte: since30 } }) : none(0),
    may("reports.view")
      ? Order.aggregate<RegionAgg>([
          { $match: { createdAt: { $gte: since30 }, status: LIVE } },
          { $group: { _id: "$region", orders: { $sum: 1 }, revenue: { $sum: { $ifNull: ["$total", 0] } } } },
        ])
      : none([] as RegionAgg[]),
    may("orders.view") ? Order.find({ createdAt: { $gte: since14 } }, { createdAt: 1 }).lean<{ createdAt: Date }[]>() : none([] as { createdAt: Date }[]),
    may("orders.view") ? Order.find({ status: { $in: ["placed", "confirmed"] } }).sort({ createdAt: 1 }).limit(8).lean<LeanOrder[]>() : none([] as LeanOrder[]),
    may("orders.view") ? Order.countDocuments({ status: { $in: ["placed", "confirmed"] } }) : none(0),
    may("products.manage")
      ? Product.aggregate<LowStock>([
          { $match: { active: true, $expr: lowStockExpr(t) } },
          // Low sizes from both countries, labelled "IN M" / "UK M".
          { $project: { name: 1, slug: 1, images: 1, low: { $concatArrays: [lowSizes("$stock", "IN", t), lowSizes("$stockUk", "UK", t)] } } },
          { $sort: { name: 1 } },
          { $limit: 12 },
        ])
      : none([] as LowStock[]),
    may("orders.view") ? Order.find().sort({ createdAt: -1 }).limit(8).lean<LeanOrder[]>() : none([] as LeanOrder[]),
    may("customers.view") ? User.countDocuments({ role: "customer" }) : none(0),
    may("returns.manage") ? ReturnRequest.countDocuments({ status: { $in: OPEN_RETURNS } }) : none(0),
    may("bookings.manage") ? Booking.countDocuments({ status: "requested" }) : none(0),
    may("reviews.manage") ? Review.countDocuments({ status: "pending" }) : none(0),
    may("stitching.manage")
      ? Order.aggregate<{ n: number }>([
          { $match: { status: { $in: ["confirmed", "packed"] } } },
          { $unwind: "$items" },
          { $match: { $and: [stitchingItemMatch(mtoSlugs, "items."), { "items.stitching.status": { $ne: "ready" } }] } },
          { $count: "n" },
        ]).then((r) => r[0]?.n ?? 0)
      : none(0),
    may("orders.ship") ? Order.countDocuments({ status: "confirmed" }) : none(0),
    may("orders.ship") ? Order.countDocuments({ status: "packed" }) : none(0),
  ]);

  const region = (r: Region) => byRegion.find((x) => x._id === r) ?? { orders: 0, revenue: 0 };

  // Daily order counts for the last 14 days, bucketed in the store's timezone.
  const days = Array.from({ length: 14 }, (_, i) => new Date(since14.getTime() + i * DAY + DAY / 2));
  const counts = new Map<string, number>(days.map((d) => [dayKey(d), 0]));
  for (const o of daily) {
    const k = dayKey(new Date(o.createdAt));
    if (counts.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const series = days.map((d) => ({ key: dayKey(d), n: counts.get(dayKey(d)) ?? 0 }));

  const todo: { label: string; n: number; href: string; note: string }[] = [];
  if (may("orders.ship")) todo.push({ label: "To dispatch", n: toPack + packed, href: "/admin/packing", note: `${packed} packed · ${toPack} still to pack` });
  if (may("returns.manage")) todo.push({ label: "Returns awaiting action", n: returnsOpen, href: "/admin/returns", note: "Requested to received" });
  if (may("stitching.manage")) todo.push({ label: "Items in stitching", n: stitchingOpen, href: "/admin/stitching", note: "Blouses and made-to-order pieces" });
  if (may("bookings.manage")) todo.push({ label: "Bookings requested", n: bookingsRequested, href: "/admin/bookings", note: "Waiting for a confirmed slot" });
  if (may("reviews.manage")) todo.push({ label: "Reviews pending", n: reviewsPending, href: "/admin/reviews", note: "Not yet on the site" });

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">Overview</p>
          <h1 className="adm-title">Dashboard</h1>
        </div>
        {may("products.manage") && <Link className="btn adm-btn" href="/admin/products/new">New product</Link>}
      </header>

      {denied ? (
        <p className="notice err" role="alert">
          You don&apos;t have access to {denied === "that page" ? "that page" : <>“{denied.toLowerCase()}”</>}. Ask the store owner to change your role if you need it.
        </p>
      ) : null}

      {todo.length ? (
        <section className="kpis" aria-label="Waiting on the team">
          {todo.map((x) => (
            <Link key={x.href} href={x.href} className={`kpi adm-kpi-link ${x.n ? "has" : ""}`}>
              <span>{x.label}</span>
              <b>{x.n}</b>
              <small>{x.note}</small>
            </Link>
          ))}
        </section>
      ) : null}

      {may("orders.view") && (
        <section className="kpis" aria-label="Key figures">
          <Kpi label="Orders today" value={String(ordersToday)} />
          <Kpi label="Orders · 30 days" value={String(orders30)} />
          {may("reports.view") &&
            (["in", "uk"] as const).map((r) => {
              const x = region(r);
              return (
                <Kpi
                  key={r}
                  label={`Revenue ${r === "in" ? "India" : "UK"} · 30 days`}
                  value={formatMoney(Math.round(x.revenue * 100) / 100, r)}
                  note={`${x.orders} orders · AOV ${formatMoney(x.orders ? Math.round((x.revenue / x.orders) * 100) / 100 : 0, r)}`}
                />
              );
            })}
          {may("customers.view") && <Kpi label="Customers" value={String(customers)} />}
        </section>
      )}

      {may("orders.view") && (
        <section className="adm-card">
          <div className="adm-card-head">
            <h2 className="h3">Orders per day · last 14 days</h2>
            <span className="muted adm-small">{daily.length} orders</span>
          </div>
          <BarChart series={series} />
        </section>
      )}

      <div className="adm-cols">
        {may("orders.view") && (
          <section className="adm-card">
            <div className="adm-card-head">
              <h2 className="h3">Needs action</h2>
              <Link className="adm-more" href="/admin/orders?status=placed">{needsActionCount} open</Link>
            </div>
            {needsAction.length ? (
              <ul className="adm-list">
                {needsAction.map((o) => (
                  <li key={String(o._id)}>
                    <Link href={`/admin/orders/${o._id}`}>
                      <div>
                        <b>{o.number}</b>
                        <small className="muted">{o.address?.name || o.email} · {fmtDateTime(o.createdAt)}</small>
                      </div>
                      <div className="adm-list-end">
                        <span>{formatMoney(o.total ?? 0, o.region)}</span>
                        <span className={`status ${o.status}`}>{o.status}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted adm-empty">Nothing waiting. All orders are packed or beyond.</p>
            )}
          </section>
        )}

        {may("products.manage") && (
          <section className="adm-card">
            <div className="adm-card-head">
              <h2 className="h3">Low stock · {t} or fewer</h2>
              <Link className="adm-more" href="/admin/products?low=1">All low stock</Link>
            </div>
            {lowStock.length ? (
              <ul className="adm-list">
                {lowStock.map((p) => (
                  <li key={String(p._id)}>
                    <Link href={`/admin/products/${p._id}`}>
                      <div className="adm-prod">
                        <span className="adm-thumb sm">{p.images?.[0] ? <Image src={p.images[0]} alt="" width={30} height={40} /> : null}</span>
                        <b>{p.name}</b>
                      </div>
                      <div className="adm-list-end adm-sizes">
                        {p.low.map((s) => (
                          <span key={s.k} className={s.v === 0 ? "out" : ""}>{s.k}: {s.v}</span>
                        ))}
                      </div>
                    </Link>
                  </li>
                ))}
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
            <h2 className="h3">Recent orders</h2>
            <Link className="adm-more" href="/admin/orders">All orders</Link>
          </div>
          {recent.length ? (
            <div className="table-wrap">
              <table className="t adm-t">
                <thead>
                  <tr><th>Order</th><th>Customer</th><th>Placed</th><th>Region</th><th>Payment</th><th>Status</th><th className="num">Total</th></tr>
                </thead>
                <tbody>
                  {recent.map((o) => (
                    <tr key={String(o._id)}>
                      <td><Link className="adm-a" href={`/admin/orders/${o._id}`}>{o.number}</Link></td>
                      <td>{o.address?.name || "—"}<br /><small className="muted">{o.email}</small></td>
                      <td className="nowrap">{fmtDateTime(o.createdAt)}</td>
                      <td>{o.region === "uk" ? "UK" : "India"}</td>
                      <td><span className={`status ${o.payment?.status ?? "pending"}`}>{o.payment?.status ?? "pending"}</span> <small className="muted">{o.payment?.method}</small></td>
                      <td><span className={`status ${o.status}`}>{o.status}</span></td>
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

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="kpi">
      <span>{label}</span>
      <b>{value}</b>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

function BarChart({ series }: { series: { key: string; n: number }[] }) {
  const max = Math.max(...series.map((s) => s.n), 0);
  // Round the axis up to a clean number so gridlines land on integers.
  const step = max <= 4 ? 1 : Math.ceil(max / 4);
  const top = Math.max(step * 4, 4);
  const ticks = [0, 1, 2, 3, 4].map((i) => i * (top / 4));
  const W = 700, H = 220, L = 34, R = 8, T = 12, B = 34;
  const iw = W - L - R, ih = H - T - B;
  const bw = iw / series.length;
  const y = (v: number) => T + ih - (v / top) * ih;
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Daily orders for the last 14 days. Highest: ${max}.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="chart-grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
            <text className="ax" x={L - 8} y={y(t) + 4} textAnchor="end">{Number.isInteger(t) ? t : t.toFixed(1)}</text>
          </g>
        ))}
        {series.map((s, i) => {
          const h = (s.n / top) * ih;
          const x = L + i * bw + bw * 0.18;
          const last = i === series.length - 1;
          const [, mm, dd] = s.key.split("-").map(Number);
          return (
            <g key={s.key}>
              <title>{`${s.key}: ${s.n} order${s.n === 1 ? "" : "s"}`}</title>
              <rect className={last ? "bar today" : "bar"} x={x} y={T + ih - h} width={bw * 0.64} height={Math.max(h, s.n ? 2 : 0)} />
              {s.n > 0 && (
                <text className="val" x={x + bw * 0.32} y={T + ih - h - 4} textAnchor="middle">{s.n}</text>
              )}
              <text className="ax" x={x + bw * 0.32} y={H - B + 16} textAnchor="middle">{dd}</text>
              {(i === 0 || dd === 1) && (
                <text className="ax mo" x={x + bw * 0.32} y={H - B + 29} textAnchor="middle">{MONTHS[(mm || 1) - 1]}</text>
              )}
            </g>
          );
        })}
        <line className="base" x1={L} x2={W - R} y1={T + ih} y2={T + ih} />
      </svg>
    </figure>
  );
}
