import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Order } from "@/lib/models";
import { formatMoney } from "@/lib/region";
import { ORDER_STATUS_LIST, escapeRx, first, fmtDateTime, qs, type LeanOrder } from "@/lib/admin-data";

export const metadata: Metadata = { title: "Orders" };

const PER_PAGE = 25;
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminOrders({ searchParams }: { searchParams: SP }) {
  await requireAdmin("orders.view");
  const sp = await searchParams;
  const statusRaw = first(sp.status);
  const status = (ORDER_STATUS_LIST as readonly string[]).includes(statusRaw) ? statusRaw : "";
  const regionRaw = first(sp.region);
  const region = regionRaw === "in" || regionRaw === "uk" ? regionRaw : "";
  const q = first(sp.q).trim().slice(0, 80);
  const page = Math.max(1, Math.floor(Number(first(sp.page)) || 1));

  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (region) filter.region = region;
  if (q) {
    const rx = new RegExp(escapeRx(q), "i");
    filter.$or = [{ number: rx }, { email: rx }, { "shipment.awb": rx }];
  }

  await db();
  const [total, orders, counts] = await Promise.all([
    Order.countDocuments(filter),
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * PER_PAGE).limit(PER_PAGE).lean<LeanOrder[]>(),
    Order.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const base = { status, region, q };
  const countOf = (s: string) => counts.find((c) => c._id === s)?.n ?? 0;
  const all = counts.reduce((a, c) => a + c.n, 0);

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">Fulfilment</p>
          <h1 className="adm-title">Orders <span className="muted">({total})</span></h1>
        </div>
      </header>

      <nav className="adm-tabs" aria-label="Filter by status">
        <Link href={`/admin/orders${qs(base, { status: undefined, page: undefined })}`} aria-current={!status ? "page" : undefined}>All <span>{all}</span></Link>
        {ORDER_STATUS_LIST.map((s) => (
          <Link key={s} href={`/admin/orders${qs(base, { status: s, page: undefined })}`} aria-current={status === s ? "page" : undefined}>
            {s} <span>{countOf(s)}</span>
          </Link>
        ))}
      </nav>

      <form className="adm-filters" method="get">
        {status && <input type="hidden" name="status" value={status} />}
        <div className="field grow">
          <label htmlFor="q">Order number, email or tracking no.</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="MG-2610… or name@example.com" />
        </div>
        <div className="field">
          <label htmlFor="region">Region</label>
          <select id="region" name="region" defaultValue={region}>
            <option value="">India and UK</option>
            <option value="in">India (₹)</option>
            <option value="uk">UK (£)</option>
          </select>
        </div>
        <button className="btn ghost adm-btn">Apply</button>
        {(q || region || status) && <Link className="adm-more" href="/admin/orders">Clear</Link>}
      </form>

      {orders.length ? (
        <>
          <div className="table-wrap adm-card flush">
            <table className="t adm-t">
              <thead>
                <tr><th>Order</th><th>Placed</th><th>Customer</th><th>Ship to</th><th className="num">Items</th><th>Payment</th><th>Status</th><th className="num">Total</th></tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={String(o._id)}>
                    <td><Link className="adm-a" href={`/admin/orders/${o._id}`}>{o.number}</Link></td>
                    <td className="nowrap">{fmtDateTime(o.createdAt)}</td>
                    <td>{o.address?.name || "—"}<br /><small className="muted">{o.email}</small></td>
                    <td>{[o.address?.city, o.region === "uk" ? "UK" : "India"].filter(Boolean).join(", ")}</td>
                    <td className="num">{o.items?.reduce((a, i) => a + (i.qty ?? 0), 0) ?? 0}</td>
                    <td className="nowrap"><span className={`status ${o.payment?.status ?? "pending"}`}>{o.payment?.status ?? "pending"}</span><br /><small className="muted">{o.payment?.method === "cod" ? "Cash on delivery" : o.payment?.method}</small></td>
                    <td><span className={`status ${o.status}`}>{o.status}</span></td>
                    <td className="num nowrap">{formatMoney(o.total ?? 0, o.region)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav className="adm-pager" aria-label="Pages">
              {page > 1 ? <Link href={`/admin/orders${qs(base, { page: page - 1 })}`}>← Newer</Link> : <span />}
              <span className="muted">Page {page} of {pages}</span>
              {page < pages ? <Link href={`/admin/orders${qs(base, { page: page + 1 })}`}>Older →</Link> : <span />}
            </nav>
          )}
        </>
      ) : (
        <div className="empty">
          <p>{all ? "No orders match these filters." : "No orders yet."}</p>
          {all ? <Link className="btn ghost adm-btn" href="/admin/orders">Show all orders</Link> : null}
        </div>
      )}
    </div>
  );
}
