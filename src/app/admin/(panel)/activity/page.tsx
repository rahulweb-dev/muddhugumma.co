import type { Metadata } from "next";
import Link from "next/link";
import type { Types } from "mongoose";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Activity } from "@/lib/models";
import { escapeRx, first, fmtDateTime, qs } from "@/lib/admin-data";

export const metadata: Metadata = { title: "Activity" };

const PER_PAGE = 50;
type SP = Promise<Record<string, string | string[] | undefined>>;
type Row = { _id: Types.ObjectId; actorId?: string; actorName?: string; action: string; target?: string; targetId?: string; meta?: Record<string, string> | Map<string, string>; createdAt?: Date };

const AREA_LABEL: Record<string, string> = {
  order: "Orders", product: "Products", coupon: "Coupons", staff: "Staff", supplier: "Suppliers", settings: "Settings", stitching: "Stitching",
  return: "Returns", review: "Reviews", booking: "Bookings", post: "Journal", lookbook: "Lookbooks", sale: "Sales", bundle: "Bundles", giftcard: "Gift cards",
};

/** Where an entry's target lives in the admin, when we know. */
function targetHref(r: Row): string | null {
  const area = r.action.split(".")[0];
  if (!r.targetId || !/^[0-9a-f]{24}$/i.test(r.targetId)) return null;
  if (area === "order" || area === "stitching") return `/admin/orders/${r.targetId}`;
  if (area === "product") return `/admin/products/${r.targetId}`;
  return null;
}

export default async function ActivityPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin("activity.view");
  const sp = await searchParams;
  const area = first(sp.area).replace(/[^a-z_-]/gi, "").slice(0, 30);
  const actor = first(sp.actor).slice(0, 40);
  const q = first(sp.q).trim().slice(0, 80);
  const page = Math.max(1, Math.floor(Number(first(sp.page)) || 1));

  const filter: Record<string, unknown> = {};
  if (area) filter.action = new RegExp(`^${escapeRx(area)}\\.`);
  if (actor) filter.actorId = actor;
  if (q) {
    const rx = new RegExp(escapeRx(q), "i");
    filter.$or = [{ target: rx }, { action: rx }];
  }

  await db();
  const [total, rows, actions, actors] = await Promise.all([
    Activity.countDocuments(filter),
    Activity.find(filter).sort({ createdAt: -1 }).skip((page - 1) * PER_PAGE).limit(PER_PAGE).lean<Row[]>(),
    Activity.distinct("action"),
    Activity.aggregate<{ _id: string; name: string }>([{ $group: { _id: "$actorId", name: { $last: "$actorName" } } }, { $sort: { name: 1 } }]),
  ]);
  const areas = [...new Set((actions as string[]).map((a) => a.split(".")[0]).filter(Boolean))].sort();
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const base = { area, actor, q };

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">Admin</p>
          <h1 className="adm-title">Activity <span className="muted">({total})</span></h1>
          <p className="muted adm-small">Every change made in the admin, newest first.</p>
        </div>
      </header>

      <form className="adm-filters" method="get">
        <div className="field">
          <label htmlFor="area">Area</label>
          <select id="area" name="area" defaultValue={area}>
            <option value="">All areas</option>
            {areas.map((a) => <option key={a} value={a}>{AREA_LABEL[a] ?? a}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="actor">Person</label>
          <select id="actor" name="actor" defaultValue={actor}>
            <option value="">Everyone</option>
            {actors.filter((x) => x._id).map((x) => <option key={x._id} value={x._id}>{x.name || x._id}</option>)}
          </select>
        </div>
        <div className="field grow">
          <label htmlFor="q">Order, product or action</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="MG-2610… or status" />
        </div>
        <button className="btn ghost adm-btn">Filter</button>
        {(area || actor || q) && <Link className="adm-more" href="/admin/activity">Clear</Link>}
      </form>

      {rows.length ? (
        <>
          <div className="table-wrap adm-card flush">
            <table className="t adm-t">
              <thead>
                <tr><th>When</th><th>Who</th><th>Action</th><th>On</th><th>Details</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const meta = r.meta instanceof Map ? Object.fromEntries(r.meta) : r.meta ?? {};
                  const href = targetHref(r);
                  return (
                    <tr key={String(r._id)}>
                      <td className="nowrap">{fmtDateTime(r.createdAt)}</td>
                      <td>{r.actorName || "System"}</td>
                      <td><code>{r.action}</code></td>
                      <td>{href ? <Link className="adm-a" href={href}>{r.target || r.targetId}</Link> : r.target || <span className="muted">—</span>}</td>
                      <td className="adm-small">
                        {Object.keys(meta).length ? (
                          Object.entries(meta).map(([k, v]) => (
                            <span key={k} className="adm-meta"><span className="muted">{k}</span> {String(v)}</span>
                          ))
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav className="adm-pager" aria-label="Pages">
              {page > 1 ? <Link href={`/admin/activity${qs(base, { page: page - 1 })}`}>← Newer</Link> : <span />}
              <span className="muted">Page {page} of {pages}</span>
              {page < pages ? <Link href={`/admin/activity${qs(base, { page: page + 1 })}`}>Older →</Link> : <span />}
            </nav>
          )}
        </>
      ) : (
        <div className="empty"><p>{total === 0 && !area && !actor && !q ? "Nothing logged yet. Changes made in the admin will show up here." : "No activity matches these filters."}</p></div>
      )}
    </div>
  );
}
