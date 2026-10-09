import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LoyaltyTxn, User, type LoyaltyTxnDoc } from "@/lib/models";
import { getSettings } from "@/lib/settings";
import { getRegion } from "@/lib/queries";
import { ensureReferralCode } from "@/lib/referral";
import { siteUrl } from "@/lib/email-layout";
import { REGION_CONFIG, formatMoney } from "@/lib/region";
import { AccountNav } from "../_components/AccountNav";
import { CopyLink } from "./CopyLink";
import "@/styles/account.css";

export const metadata: Metadata = { title: "Rewards · My account", robots: { index: false, follow: false } };

export default async function RewardsPage() {
  const session = await requireUser("/account/rewards");
  await db();
  const [u, txns, s, region, code] = await Promise.all([
    User.findById(session.uid, { loyaltyPoints: 1, referredBy: 1 }).lean<{ loyaltyPoints?: number; referredBy?: string }>(),
    LoyaltyTxn.find({ userId: session.uid }).sort({ createdAt: -1 }).limit(50).lean<LoyaltyTxnDoc[]>(),
    getSettings(),
    getRegion(),
    ensureReferralCode(session.uid),
  ]);
  const points = Math.max(0, Math.floor(u?.loyaltyPoints ?? 0));
  const value = s.loyalty.pointValue[region] ?? 0;
  const f = (n: number) => formatMoney(n, region);
  const unit = region === "in" ? "₹100" : "£1";
  const per = s.loyalty.pointsPerUnit[region] ?? 1;
  const reward = s.referralReward[region] ?? 0;
  const link = code ? siteUrl(`/account/register?ref=${encodeURIComponent(code)}`) : "";
  const shareText = `I shop my sarees and kurta sets at House of Muddhugumma. Join with my code ${code} and get ${f(reward)} in points on your first order: ${link}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  const date = (d?: Date) => (d ? new Date(d).toLocaleDateString(REGION_CONFIG[region].locale, { day: "numeric", month: "short", year: "numeric" }) : "");

  return (
    <div className="pad mx-auto grid max-w-[1240px] grid-cols-1 gap-5 pt-3 pb-14 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start lg:gap-14 lg:pt-10 lg:pb-20">
      <AccountNav name={session.name} email={session.email} />
      <div className="flex min-w-0 flex-col gap-8">
        <header className="page-head !pt-0">
          <span className="kick">Muddhugumma Circle</span>
          <h1 className="h1">Your <i>rewards</i></h1>
        </header>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1 border border-line bg-stone p-5">
            <span className="text-[11px] font-bold uppercase tracking-[.14em] text-muted">Points balance</span>
            <strong className="font-display text-[34px] tracking-[.04em]">{points.toLocaleString()}</strong>
            <span className="text-[13px] text-muted">Worth {f(points * value)} on {REGION_CONFIG[region].label} orders</span>
          </div>
          <div className="flex flex-col justify-between gap-3 border border-line p-5">
            <p className="m-0 text-[13.5px]">
              Use your points on the payment step at checkout: tick <b>Use points</b> and the value comes off your order straight away.
            </p>
            <Link className="btn self-start" href="/c/new">Shop new arrivals</Link>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="h3">How points work</h2>
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 text-[13.5px] md:grid-cols-3">
            <li className="border border-line p-4"><b className="mb-1 block">Earn</b>{per} {per === 1 ? "point" : "points"} for every {unit} you spend on clothes, added when your order is delivered.</li>
            <li className="border border-line p-4"><b className="mb-1 block">Spend</b>Each point is worth {f(value)}. Use them on up to {s.loyalty.maxRedeemPct}% of an order&apos;s items.</li>
            <li className="border border-line p-4"><b className="mb-1 block">Returns</b>If an order is cancelled or returned, points earned on it are taken back and points you used are put back.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-4 border border-dashed border-bronze bg-paper p-5 md:p-6">
          <div className="flex flex-col gap-1">
            <span className="kick">Refer a friend</span>
            <h2 className="h2">Give {f(reward)}, <i>get {f(reward)}</i></h2>
          </div>
          <p className="m-0 text-[13.5px] text-muted">
            Share your code. Your friend gets {f(reward)} in points when they create an account with it, and you get {f(reward)} in points when their first order is delivered.
          </p>
          {code ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <span className="border border-line bg-stone px-4 py-2 font-display text-[18px] tracking-[.2em]">{code}</span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="sr-only" htmlFor="rw-link">Your invite link</label>
                <input id="rw-link" readOnly value={link} className="h-11 min-w-0 flex-1 border border-line bg-paper px-3 text-[13px]" />
                <div className="flex gap-2">
                  <CopyLink value={link} />
                  <a className="btn h-11 px-4" href={wa} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
                </div>
              </div>
            </>
          ) : (
            <p className="notice">We couldn&apos;t create your code just now. Refresh the page to try again.</p>
          )}
          {u?.referredBy && <p className="m-0 text-[12.5px] text-muted">You joined with code {u.referredBy}.</p>}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="h3">History</h2>
          {txns.length ? (
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr><th>Date</th><th>What for</th><th className="num">Points</th></tr>
                </thead>
                <tbody>
                  {txns.map((t) => (
                    <tr key={String(t._id)}>
                      <td className="whitespace-nowrap">{date(t.createdAt)}</td>
                      <td>
                        {t.reason}
                        {t.orderNumber && <> · <Link className="underline" href={`/account/orders/${t.orderNumber}`}>{t.orderNumber}</Link></>}
                      </td>
                      <td className={`num font-bold ${t.points >= 0 ? "text-ok" : "text-sale"}`}>{t.points > 0 ? "+" : "−"}{Math.abs(t.points).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="m-0 text-[13.5px] text-muted">No points yet. They&apos;ll appear here when your first order is delivered.</p>
          )}
        </section>
      </div>
    </div>
  );
}
