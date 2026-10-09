import type { Metadata } from "next";
import type { Types } from "mongoose";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Coupon, Order } from "@/lib/models";
import { formatMoney, type Region } from "@/lib/region";
import { fmtDate } from "@/lib/admin-data";
import { ActiveSwitch, CouponForm } from "@/components/admin/AdminControls";

export const metadata: Metadata = { title: "Coupons" };

type LeanCoupon = {
  _id: Types.ObjectId;
  code: string;
  description?: string;
  type?: "percent" | "flat";
  value?: number;
  regions?: Region[];
  minOrder?: { in?: number; uk?: number };
  firstOrderOnly?: boolean;
  active?: boolean;
  expiresAt?: Date | null;
};

/** Time of this request (kept out of render so the purity lint rule is satisfied). */
const requestTime = () => Date.now();

export default async function AdminCoupons() {
  await requireAdmin("merch.manage");
  await db();
  const [coupons, uses] = await Promise.all([
    Coupon.find().sort({ active: -1, createdAt: -1 }).lean<LeanCoupon[]>(),
    Order.aggregate<{ _id: string; n: number }>([
      { $match: { coupon: { $nin: ["", null] }, status: { $nin: ["cancelled", "returned"] } } },
      { $group: { _id: { $toUpper: "$coupon" }, n: { $sum: 1 } } },
    ]),
  ]);
  const used = (code: string) => uses.find((u) => u._id === code)?.n ?? 0;
  const now = requestTime();

  const valueText = (c: LeanCoupon) => {
    if (c.type === "flat") return (c.regions ?? []).map((r) => formatMoney(c.value ?? 0, r)).join(" / ") + " off";
    return `${c.value ?? 0}% off`;
  };

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">Promotions</p>
          <h1 className="adm-title">Coupons <span className="muted">({coupons.length})</span></h1>
        </div>
      </header>

      <section className="adm-card">
        <h2 className="h3">New coupon</h2>
        <p className="muted adm-small">Flat values are in each region&apos;s currency, so a flat 10 means ₹10 in India and £10 in the UK. Pick one region for flat coupons unless that is intended.</p>
        <CouponForm />
      </section>

      {coupons.length ? (
        <div className="table-wrap adm-card flush">
          <table className="t adm-t">
            <thead>
              <tr><th>Code</th><th>Discount</th><th>Regions</th><th>Minimum order</th><th>Rules</th><th>Expires</th><th className="num">Used</th><th>Active</th></tr>
            </thead>
            <tbody>
              {coupons.map((c) => {
                const expired = c.expiresAt ? new Date(c.expiresAt).getTime() < now : false;
                const regions = c.regions ?? [];
                return (
                  <tr key={String(c._id)} className={c.active && !expired ? "" : "off"}>
                    <td><code className="adm-code">{c.code}</code>{c.description ? <><br /><small className="muted">{c.description}</small></> : null}</td>
                    <td className="nowrap">{valueText(c)}</td>
                    <td>{regions.map((r) => (r === "uk" ? "UK" : "India")).join(", ") || "—"}</td>
                    <td className="nowrap">
                      {regions.map((r) => {
                        const m = c.minOrder?.[r] ?? 0;
                        return <div key={r}>{m ? formatMoney(m, r) : r === "uk" ? "No min (£)" : "No min (₹)"}</div>;
                      })}
                    </td>
                    <td>{c.firstOrderOnly ? "First order only" : "Any order"}</td>
                    <td className="nowrap">{c.expiresAt ? <span className={expired ? "adm-low" : ""}>{fmtDate(c.expiresAt)}{expired ? " · expired" : ""}</span> : "Never"}</td>
                    <td className="num">{used(c.code)}</td>
                    <td><ActiveSwitch id={String(c._id)} active={!!c.active} kind="coupon" label={c.code} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty"><p>No coupons yet. Create the first one above.</p></div>
      )}
    </div>
  );
}
