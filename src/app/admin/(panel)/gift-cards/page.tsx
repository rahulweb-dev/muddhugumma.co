import type { Metadata } from "next";
import Link from "next/link";
import type { Types } from "mongoose";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { GiftCard, type GiftCardDoc } from "@/lib/models";
import { formatMoney } from "@/lib/region";
import { escapeRx, first, fmtDate, qs } from "@/lib/admin-data";
import { IssueGiftCardForm } from "@/components/admin/content/GiftCardForms";

export const metadata: Metadata = { title: "Gift cards" };

const PER_PAGE = 30;
type SP = Promise<Record<string, string | string[] | undefined>>;
type Row = GiftCardDoc & { _id: Types.ObjectId };

export default async function AdminGiftCards({ searchParams }: { searchParams: SP }) {
  await requireAdmin("merch.manage");
  const sp = await searchParams;
  const q = first(sp.q).trim().slice(0, 80);
  const activeRaw = first(sp.active);
  const active = activeRaw === "yes" || activeRaw === "no" ? activeRaw : "";
  const balRaw = first(sp.balance);
  const balance = balRaw === "yes" || balRaw === "no" ? balRaw : "";
  const regionRaw = first(sp.region);
  const region = regionRaw === "in" || regionRaw === "uk" ? regionRaw : "";
  const page = Math.max(1, Math.floor(Number(first(sp.page)) || 1));

  const filter: Record<string, unknown> = {};
  if (q) {
    const rx = new RegExp(escapeRx(q), "i");
    filter.$or = [{ code: new RegExp(escapeRx(q.toUpperCase().replace(/\s/g, "")), "i") }, { recipientEmail: rx }, { purchaserEmail: rx }, { recipientName: rx }, { orderNumber: rx }];
  }
  if (active) filter.active = active === "yes";
  if (balance) filter.balance = balance === "yes" ? { $gt: 0 } : { $lte: 0 };
  if (region) filter.region = region;

  await db();
  const [total, rows, totals] = await Promise.all([
    GiftCard.countDocuments(filter),
    GiftCard.find(filter, { redemptions: 0 }).sort({ createdAt: -1 }).skip((page - 1) * PER_PAGE).limit(PER_PAGE).lean<Row[]>(),
    GiftCard.aggregate<{ _id: string; outstanding: number; n: number }>([{ $match: { active: true, balance: { $gt: 0 } } }, { $group: { _id: "$region", outstanding: { $sum: "$balance" }, n: { $sum: 1 } } }]),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const base = { q, active, balance, region };
  const now = Date.now();

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">Merchandising</p>
          <h1 className="adm-title">Gift cards <span className="muted">({total})</span></h1>
          <p className="muted adm-small">
            Unspent balance:{" "}
            {(["in", "uk"] as const).map((r, i) => {
              const t = totals.find((x) => x._id === r);
              return <span key={r}>{i ? " · " : ""}{formatMoney(t?.outstanding ?? 0, r)} on {t?.n ?? 0} card{t?.n === 1 ? "" : "s"}</span>;
            })}
          </p>
        </div>
      </header>

      <details className="adm-card group">
        <summary className="h3 cursor-pointer list-none flex justify-between items-center">Issue a gift card manually <span className="adm-more group-open:hidden">Open</span></summary>
        <p className="muted adm-small">For goodwill gestures, giveaways or cards paid for outside the website. Cards bought at checkout and store-credit refunds are issued automatically.</p>
        <IssueGiftCardForm />
      </details>

      <form className="adm-filters" method="get">
        <div className="field grow">
          <label htmlFor="q">Code, email or name</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="MG-7KQ2-X9PA or name@example.com" />
        </div>
        <div className="field">
          <label htmlFor="active">Status</label>
          <select id="active" name="active" defaultValue={active}>
            <option value="">Any</option>
            <option value="yes">Active</option>
            <option value="no">Deactivated</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="balance">Balance</label>
          <select id="balance" name="balance" defaultValue={balance}>
            <option value="">Any</option>
            <option value="yes">Has balance</option>
            <option value="no">Fully used</option>
          </select>
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
        {(q || active || balance || region) && <Link className="adm-more" href="/admin/gift-cards">Clear</Link>}
      </form>

      {rows.length ? (
        <>
          <div className="table-wrap adm-card flush">
            <table className="t adm-t">
              <thead><tr><th>Code</th><th>Issued</th><th>Recipient</th><th>Source</th><th className="num">Value</th><th className="num">Balance</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((g) => {
                  const r = g.region === "uk" ? "uk" : "in";
                  const expired = g.expiresAt ? new Date(g.expiresAt).getTime() < now : false;
                  const usable = g.active && !expired && (g.balance ?? 0) > 0;
                  return (
                    <tr key={String(g._id)} className={usable ? "" : "off"}>
                      <td><Link href={`/admin/gift-cards/${g._id}`}><code className="adm-code">{g.code}</code></Link></td>
                      <td className="nowrap">{fmtDate(g.createdAt)}</td>
                      <td>{g.recipientName || "—"}<br /><small className="muted">{g.recipientEmail || g.purchaserEmail || ""}</small></td>
                      <td>{g.orderNumber ? <small>Order {g.orderNumber}</small> : <small className="muted">Issued by staff</small>}</td>
                      <td className="num nowrap">{formatMoney(g.initial ?? 0, r)}</td>
                      <td className="num nowrap"><b>{formatMoney(g.balance ?? 0, r)}</b></td>
                      <td>
                        <span className={`status ${!g.active ? "text-sale" : expired ? "text-muted" : (g.balance ?? 0) > 0 ? "text-ok" : "text-muted"}`}>
                          {!g.active ? "Deactivated" : expired ? "Expired" : (g.balance ?? 0) > 0 ? "Active" : "Used up"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav className="adm-pager" aria-label="Pages">
              {page > 1 ? <Link href={`/admin/gift-cards${qs(base, { page: page - 1 })}`}>← Newer</Link> : <span />}
              <span className="muted">Page {page} of {pages}</span>
              {page < pages ? <Link href={`/admin/gift-cards${qs(base, { page: page + 1 })}`}>Older →</Link> : <span />}
            </nav>
          )}
        </>
      ) : (
        <div className="empty"><p>{q || active || balance || region ? "No gift cards match these filters." : "No gift cards yet."}</p></div>
      )}
    </div>
  );
}
