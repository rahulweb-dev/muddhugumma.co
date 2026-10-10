import type { Metadata } from "next";
import Link from "next/link";
import mongoose from "mongoose";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Order, ReturnRequest, Review, User, type UserDoc } from "@/lib/models";
import { fmtDate, fmtDateTime, type LeanOrder } from "@/lib/admin-data";
import { REGION_FLAG, REGION_NAME, getStoreLock } from "@/lib/admin-scope";
import { orderStatusLabel, paymentStatusLabel } from "@/lib/admin-labels";
import { formatMoney, type Region } from "@/lib/region";

export const metadata: Metadata = { title: "Customer" };

const LIVE = ["placed", "confirmed", "packed", "shipped", "delivered"];

/** Everything about one customer on one page: contact, spend per country, orders, returns, reviews, addresses. */
export default async function CustomerProfile({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("customers.view");
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) notFound();
  await db();
  const u = await User.findById(id).lean<UserDoc & { _id: mongoose.Types.ObjectId }>();
  if (!u) notFound();
  const lock = await getStoreLock();
  const mine = { $or: [{ userId: id }, { email: u.email }], ...(lock ? { region: lock } : {}) };
  const [orders, returns, reviews] = await Promise.all([
    Order.find(mine).sort({ createdAt: -1 }).limit(50).lean<LeanOrder[]>(),
    ReturnRequest.countDocuments({ ...(lock ? { region: lock } : {}), $or: [{ userId: id }, { orderNumber: { $in: await Order.distinct("number", mine) } }] }),
    Review.countDocuments({ userId: id }),
  ]);

  const regions: Region[] = lock ? [lock] : ["in", "uk"];
  const spend = regions
    .map((r) => {
      const os = orders.filter((o) => (o.region === "uk" ? "uk" : "in") === r && LIVE.includes(o.status));
      return { r, n: os.length, total: os.reduce((a, o) => a + (o.total ?? 0), 0) };
    })
    .filter((s) => s.n > 0 || regions.length === 1);
  const lastOrder = orders[0];
  const phone = u.phone || lastOrder?.address?.phone || "";

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick"><Link href="/admin/customers">Customers</Link> / {u.name}</p>
          <h1 className="adm-title">{u.name}</h1>
          <p className="muted adm-small">
            Customer since {fmtDate(u.createdAt)}
            {u.role !== "customer" ? ` · staff (${u.role})` : ""}
          </p>
        </div>
        <div className="adm-row">
          <a className="btn ghost adm-btn" href={`mailto:${u.email}`}>Email</a>
          {phone && <a className="btn ghost adm-btn" href={`tel:${phone}`}>Call</a>}
        </div>
      </header>

      <section className="kpis" aria-label="Summary">
        {spend.map((s) => (
          <div key={s.r} className="kpi">
            <span>{REGION_FLAG[s.r]} Spent in {REGION_NAME[s.r]}</span>
            <b>{formatMoney(Math.round(s.total * 100) / 100, s.r)}</b>
            <small>{s.n} order{s.n === 1 ? "" : "s"}{s.n ? ` · avg ${formatMoney(Math.round((s.total / s.n) * 100) / 100, s.r)}` : ""}</small>
          </div>
        ))}
        <div className="kpi"><span>Loyalty points</span><b>{u.loyaltyPoints ?? 0}</b></div>
        <div className="kpi"><span>Returns · reviews</span><b>{returns} · {reviews}</b></div>
        <div className="kpi"><span>Wishlist</span><b>{u.wishlist?.length ?? 0}</b><small>saved pieces</small></div>
      </section>

      <div className="adm-cols wide-left">
        <section className="adm-card">
          <div className="adm-card-head">
            <h2 className="h3">Orders</h2>
            <Link className="adm-more" href={`/admin/orders?q=${encodeURIComponent(u.email)}&region=all`}>Open in orders</Link>
          </div>
          {orders.length ? (
            <div className="table-wrap">
              <table className="t adm-t">
                <thead><tr><th>Order</th><th>Placed</th><th>Payment</th><th>Status</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={String(o._id)}>
                      <td><Link className="adm-a" href={`/admin/orders/${o._id}`}>{REGION_FLAG[o.region === "uk" ? "uk" : "in"]} {o.number}</Link></td>
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
            <p className="muted adm-empty">No orders yet{lock ? ` in ${REGION_NAME[lock]}` : ""}.</p>
          )}
        </section>

        <div className="adm-stack">
          <section className="adm-card">
            <h2 className="h3">Contact</h2>
            <dl className="adm-dl">
              <div><dt>Email</dt><dd><a className="adm-a" href={`mailto:${u.email}`}>{u.email}</a></dd></div>
              <div><dt>Phone</dt><dd>{phone || "—"}</dd></div>
              {u.birthday ? <div><dt>Birthday</dt><dd>{u.birthday}</dd></div> : null}
              <div><dt>Marketing emails</dt><dd>{u.marketingOptIn ? "Yes" : "No"}</dd></div>
              <div><dt>WhatsApp updates</dt><dd>{u.whatsappOptIn ? "Yes" : "No"}</dd></div>
              {u.referralCode ? <div><dt>Referral code</dt><dd><code>{u.referralCode}</code></dd></div> : null}
            </dl>
          </section>

          <section className="adm-card">
            <h2 className="h3">Saved addresses</h2>
            {u.addresses?.length ? (
              u.addresses.map((a, i) => (
                <address key={i} className="adm-addr">
                  <b>{a.name}</b>{a.isDefault ? <> <span className="chip">Default</span></> : null}
                  <br />{a.line1}{a.line2 ? <>, {a.line2}</> : null}
                  <br />{[a.city, a.state].filter(Boolean).join(", ")} {a.postcode} · {a.region === "uk" ? "UK" : "India"}
                  {a.phone ? <><br />{a.phone}</> : null}
                </address>
              ))
            ) : (
              <p className="muted adm-small">No saved addresses.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
