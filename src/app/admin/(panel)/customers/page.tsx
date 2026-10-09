import type { Metadata } from "next";
import Link from "next/link";
import type { Types } from "mongoose";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Order, User } from "@/lib/models";
import { formatMoney, type Region } from "@/lib/region";
import { escapeRx, first, fmtDate, qs } from "@/lib/admin-data";

export const metadata: Metadata = { title: "Customers" };

const PER_PAGE = 50;
type SP = Promise<Record<string, string | string[] | undefined>>;
type LeanUser = { _id: Types.ObjectId; name: string; email: string; phone?: string; createdAt?: Date };
type Spend = { _id: { userId: string; region: Region }; orders: number; spend: number };

export default async function AdminCustomers({ searchParams }: { searchParams: SP }) {
  await requireAdmin("customers.view");
  const sp = await searchParams;
  const q = first(sp.q).trim().slice(0, 80);
  const page = Math.max(1, Math.floor(Number(first(sp.page)) || 1));

  const filter: Record<string, unknown> = { role: "customer" };
  if (q) {
    const rx = new RegExp(escapeRx(q), "i");
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }

  await db();
  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter, { name: 1, email: 1, phone: 1, createdAt: 1 }).sort({ createdAt: -1 }).skip((page - 1) * PER_PAGE).limit(PER_PAGE).lean<LeanUser[]>(),
  ]);
  const ids = users.map((u) => String(u._id));
  // Orders count includes every order; lifetime spend leaves out cancelled and returned orders.
  const spend = ids.length
    ? await Order.aggregate<Spend>([
        { $match: { userId: { $in: ids } } },
        {
          $group: {
            _id: { userId: "$userId", region: "$region" },
            orders: { $sum: 1 },
            spend: { $sum: { $cond: [{ $in: ["$status", ["cancelled", "returned"]] }, 0, { $ifNull: ["$total", 0] }] } },
          },
        },
      ])
    : [];
  const statsFor = (uid: string) => {
    const rows = spend.filter((s) => s._id.userId === uid);
    return {
      orders: rows.reduce((a, s) => a + s.orders, 0),
      byRegion: (["in", "uk"] as const).map((r) => ({ r, row: rows.find((s) => s._id.region === r) })).filter((x) => x.row),
    };
  };
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">People</p>
          <h1 className="adm-title">Customers <span className="muted">({total})</span></h1>
        </div>
      </header>

      <form className="adm-filters" method="get">
        <div className="field grow">
          <label htmlFor="q">Search name, email or phone</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="e.g. priya or @gmail.com" />
        </div>
        <button className="btn ghost adm-btn">Search</button>
        {q && <Link className="adm-more" href="/admin/customers">Clear</Link>}
      </form>

      {users.length ? (
        <>
          <div className="table-wrap adm-card flush">
            <table className="t adm-t">
              <thead>
                <tr><th>Name</th><th>Email</th><th>Phone</th><th>Joined</th><th className="num">Orders</th><th className="num">Lifetime spend</th></tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const s = statsFor(String(u._id));
                  return (
                    <tr key={String(u._id)}>
                      <td>{u.name}</td>
                      <td><a className="adm-a" href={`mailto:${u.email}`}>{u.email}</a></td>
                      <td className="nowrap">{u.phone || <span className="muted">—</span>}</td>
                      <td className="nowrap">{fmtDate(u.createdAt)}</td>
                      <td className="num">{s.orders ? <Link className="adm-a" href={`/admin/orders?q=${encodeURIComponent(u.email)}`}>{s.orders}</Link> : 0}</td>
                      <td className="num nowrap">
                        {s.byRegion.length
                          ? s.byRegion.map(({ r, row }) => <div key={r}>{formatMoney(Math.round((row?.spend ?? 0) * 100) / 100, r)} <small className="muted">· {row?.orders}</small></div>)
                          : <span className="muted">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav className="adm-pager" aria-label="Pages">
              {page > 1 ? <Link href={`/admin/customers${qs({ q }, { page: page - 1 })}`}>← Newer</Link> : <span />}
              <span className="muted">Page {page} of {pages}</span>
              {page < pages ? <Link href={`/admin/customers${qs({ q }, { page: page + 1 })}`}>Older →</Link> : <span />}
            </nav>
          )}
        </>
      ) : (
        <div className="empty"><p>{q ? `No customers match “${q}”.` : "No customer accounts yet."}</p></div>
      )}
    </div>
  );
}
