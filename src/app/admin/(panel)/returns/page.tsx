import type { Metadata } from "next";
import Link from "next/link";
import type { Types } from "mongoose";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ReturnRequest, Order, type ReturnDoc } from "@/lib/models";
import { RETURN_STATUS_LABEL } from "@/lib/returns";
import { formatMoney } from "@/lib/region";
import { escapeRx, first, fmtDateTime, qs } from "@/lib/admin-data";
import { returnTone } from "@/components/admin/content/shared";

export const metadata: Metadata = { title: "Returns" };

const PER_PAGE = 25;
const STATUSES = Object.keys(RETURN_STATUS_LABEL) as ReturnDoc["status"][];
const OPEN = ["requested", "approved", "pickup_scheduled", "picked_up", "received"];
type SP = Promise<Record<string, string | string[] | undefined>>;
type Row = Pick<ReturnDoc, "number" | "orderNumber" | "region" | "items" | "status" | "refundAmount"> & { _id: Types.ObjectId; createdAt?: Date; updatedAt?: Date };

export default async function AdminReturns({ searchParams }: { searchParams: SP }) {
  await requireAdmin("returns.manage");
  const sp = await searchParams;
  const raw = first(sp.status);
  const status = raw === "open" || (STATUSES as string[]).includes(raw) ? raw : "";
  const q = first(sp.q).trim().slice(0, 80);
  const page = Math.max(1, Math.floor(Number(first(sp.page)) || 1));

  await db();
  const filter: Record<string, unknown> = {};
  if (status === "open") filter.status = { $in: OPEN };
  else if (status) filter.status = status;
  if (q) {
    const rx = new RegExp(escapeRx(q), "i");
    const byEmail = q.includes("@") || q.length >= 3 ? await Order.find({ email: rx }, { number: 1 }).limit(200).lean<{ number: string }[]>() : [];
    filter.$or = [{ number: rx }, { orderNumber: rx }, ...(byEmail.length ? [{ orderNumber: { $in: byEmail.map((o) => o.number) } }] : [])];
  }

  const [total, rows, counts] = await Promise.all([
    ReturnRequest.countDocuments(filter),
    ReturnRequest.find(filter).sort({ createdAt: -1 }).skip((page - 1) * PER_PAGE).limit(PER_PAGE).lean<Row[]>(),
    ReturnRequest.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);
  const orders = rows.length ? await Order.find({ number: { $in: rows.map((r) => r.orderNumber) } }, { number: 1, email: 1, "address.name": 1 }).lean<{ number: string; email: string; address?: { name?: string } }[]>() : [];
  const orderOf = new Map(orders.map((o) => [o.number, o]));
  const countOf = (s: string) => counts.find((c) => c._id === s)?.n ?? 0;
  const all = counts.reduce((a, c) => a + c.n, 0);
  const open = OPEN.reduce((a, s) => a + countOf(s), 0);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const base = { status, q };

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">Customer service</p>
          <h1 className="adm-title">Returns &amp; exchanges <span className="muted">({total})</span></h1>
        </div>
      </header>

      <nav className="adm-tabs" aria-label="Filter by status">
        <Link href={`/admin/returns${qs(base, { status: undefined, page: undefined })}`} aria-current={!status ? "page" : undefined}>All <span>{all}</span></Link>
        <Link href={`/admin/returns${qs(base, { status: "open", page: undefined })}`} aria-current={status === "open" ? "page" : undefined}>Open <span>{open}</span></Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/returns${qs(base, { status: s, page: undefined })}`} aria-current={status === s ? "page" : undefined}>
            {RETURN_STATUS_LABEL[s]} <span>{countOf(s)}</span>
          </Link>
        ))}
      </nav>

      <form className="adm-filters" method="get">
        {status && <input type="hidden" name="status" value={status} />}
        <div className="field grow">
          <label htmlFor="q">Return number, order number or email</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="RT-MG2610… or name@example.com" />
        </div>
        <button className="btn ghost adm-btn">Search</button>
        {(q || status) && <Link className="adm-more" href="/admin/returns">Clear</Link>}
      </form>

      {rows.length ? (
        <>
          <div className="table-wrap adm-card flush">
            <table className="t adm-t">
              <thead>
                <tr><th>Return</th><th>Requested</th><th>Order</th><th>Customer</th><th>Items</th><th>Status</th><th className="num">Refund</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const o = orderOf.get(r.orderNumber);
                  const qty = (r.items ?? []).reduce((a, i) => a + (i.qty ?? 0), 0);
                  const kinds = new Set((r.items ?? []).map((i) => i.kind));
                  return (
                    <tr key={String(r._id)}>
                      <td><Link className="adm-a" href={`/admin/returns/${encodeURIComponent(r.number)}`}>{r.number}</Link></td>
                      <td className="nowrap">{fmtDateTime(r.createdAt)}</td>
                      <td className="nowrap">{r.orderNumber}</td>
                      <td>{o?.address?.name || "—"}<br /><small className="muted">{o?.email ?? ""}</small></td>
                      <td>{qty} item{qty === 1 ? "" : "s"}<br /><small className="muted">{[kinds.has("return") ? "Return" : "", kinds.has("exchange") ? "Exchange" : ""].filter(Boolean).join(" + ")}</small></td>
                      <td><span className={`status ${returnTone(r.status)}`}>{RETURN_STATUS_LABEL[r.status] ?? r.status}</span></td>
                      <td className="num nowrap">{r.refundAmount ? formatMoney(r.refundAmount, r.region === "uk" ? "uk" : "in") : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav className="adm-pager" aria-label="Pages">
              {page > 1 ? <Link href={`/admin/returns${qs(base, { page: page - 1 })}`}>← Newer</Link> : <span />}
              <span className="muted">Page {page} of {pages}</span>
              {page < pages ? <Link href={`/admin/returns${qs(base, { page: page + 1 })}`}>Older →</Link> : <span />}
            </nav>
          )}
        </>
      ) : (
        <div className="empty">
          <p>{all ? "No returns match these filters." : "No return or exchange requests yet. They appear here when a customer starts one from their order page."}</p>
          {all ? <Link className="btn ghost adm-btn" href="/admin/returns">Show all returns</Link> : null}
        </div>
      )}
    </div>
  );
}
