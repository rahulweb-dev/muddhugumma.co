import type { Metadata } from "next";
import Link from "next/link";
import mongoose, { type Types } from "mongoose";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Activity, GiftCard, Order, type GiftCardDoc } from "@/lib/models";
import { formatMoney, REGION_CONFIG } from "@/lib/region";
import { fmtDate, fmtDateTime } from "@/lib/admin-data";
import { GiftCardStatus } from "@/components/admin/content/GiftCardForms";

export const metadata: Metadata = { title: "Gift card" };

type Row = GiftCardDoc & { _id: Types.ObjectId };

export default async function AdminGiftCard({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("merch.manage");
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) notFound();
  await db();
  const g = await GiftCard.findById(id).lean<Row>();
  if (!g) notFound();
  const r = g.region === "uk" ? "uk" : "in";
  const money = (n?: number) => formatMoney(n ?? 0, r);
  const redemptions = [...(g.redemptions ?? [])].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const numbers = [...new Set([g.orderNumber, ...redemptions.map((x) => x.orderNumber)].filter(Boolean) as string[])];
  const [orders, log] = await Promise.all([
    numbers.length ? Order.find({ number: { $in: numbers } }, { number: 1 }).lean<{ _id: Types.ObjectId; number: string }[]>() : [],
    Activity.find({ action: /^giftcard\./, targetId: id }).sort({ createdAt: -1 }).limit(20).lean<{ _id: Types.ObjectId; action: string; actorName?: string; createdAt?: Date; meta?: Record<string, string> }[]>(),
  ]);
  const orderLink = (n: string) => {
    const o = orders.find((x) => x.number === n);
    return o ? <Link className="adm-a" href={`/admin/orders/${o._id}`}>{n}</Link> : <span>{n}</span>;
  };
  const used = (g.initial ?? 0) - (g.balance ?? 0);
  const expired = g.expiresAt ? new Date(g.expiresAt).getTime() < Date.now() : false;

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick"><Link href="/admin/gift-cards">Gift cards</Link> / {g.code}</p>
          <h1 className="adm-title"><code className="adm-code text-[0.8em]">{g.code}</code></h1>
          <p className="muted adm-small">Issued {fmtDateTime(g.createdAt)} · {REGION_CONFIG[r].label} ({REGION_CONFIG[r].currency})</p>
        </div>
        <span className={`status ${!g.active ? "text-sale" : expired ? "text-muted" : (g.balance ?? 0) > 0 ? "text-ok" : "text-muted"}`}>
          {!g.active ? "Deactivated" : expired ? "Expired" : (g.balance ?? 0) > 0 ? "Active" : "Used up"}
        </span>
      </header>

      <div className="adm-cols wide-left">
        <div className="adm-stack">
          <section className="adm-card">
            <h2 className="h3">Balance</h2>
            <dl className="adm-totals">
              <div><dt>Original value</dt><dd>{money(g.initial)}</dd></div>
              <div><dt>Used</dt><dd>−{money(used)}</dd></div>
              <div className="grand"><dt>Balance</dt><dd>{money(g.balance)}</dd></div>
            </dl>
          </section>

          <section className="adm-card">
            <h2 className="h3">Redemptions ({redemptions.length})</h2>
            {redemptions.length ? (
              <div className="table-wrap">
                <table className="t adm-t min-w-0!">
                  <thead><tr><th>Date</th><th>Order</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {redemptions.map((x, i) => (
                      <tr key={i}>
                        <td className="nowrap">{fmtDateTime(x.at)}</td>
                        <td>{x.orderNumber ? orderLink(x.orderNumber) : "—"}</td>
                        <td className={`num nowrap ${x.amount < 0 ? "text-ok" : ""}`}>{x.amount < 0 ? `+${money(-x.amount)} restored` : money(x.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted adm-small">Not used yet.</p>
            )}
          </section>

          {log.length ? (
            <section className="adm-card">
              <h2 className="h3">Staff actions</h2>
              <ol className="adm-timeline">
                {log.map((a, i) => (
                  <li key={String(a._id)} className={i === 0 ? "now" : ""}>
                    <b>{a.action.replace("giftcard.", "").replace(/^\w/, (c) => c.toUpperCase())}</b>
                    <time className="muted adm-small">{fmtDateTime(a.createdAt)} · {a.actorName ?? "Staff"}</time>
                    {a.meta?.reason ? <p>{a.meta.reason}</p> : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>

        <div className="adm-stack">
          <section className="adm-card">
            <h2 className="h3">Details</h2>
            <dl className="adm-dl">
              <div><dt>Recipient</dt><dd>{g.recipientName || "—"}</dd></div>
              <div><dt>Recipient email</dt><dd>{g.recipientEmail ? <a className="adm-a" href={`mailto:${g.recipientEmail}`}>{g.recipientEmail}</a> : "—"}</dd></div>
              {g.purchaserEmail ? <div><dt>Bought by</dt><dd><a className="adm-a" href={`mailto:${g.purchaserEmail}`}>{g.purchaserEmail}</a></dd></div> : null}
              <div><dt>Source</dt><dd>{g.orderNumber ? <>Order {orderLink(g.orderNumber)}</> : "Issued by staff"}</dd></div>
              <div><dt>Expires</dt><dd>{g.expiresAt ? fmtDate(g.expiresAt) : "Never"}</dd></div>
            </dl>
            {g.message ? <blockquote className="m-0 border-l-2 border-bronze pl-3 font-serif italic text-[17px]">{g.message}</blockquote> : null}
          </section>
          <section className="adm-card">
            <h2 className="h3">{g.active ? "Deactivate" : "Reactivate"}</h2>
            <GiftCardStatus id={String(g._id)} active={!!g.active} code={g.code} />
          </section>
        </div>
      </div>
    </div>
  );
}
