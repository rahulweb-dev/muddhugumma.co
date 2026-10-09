import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import type { Types } from "mongoose";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Bundle, type BundleDoc } from "@/lib/models";
import { fmtDate } from "@/lib/admin-data";
import { Icon } from "@/components/Icon";

export const metadata: Metadata = { title: "Bundles" };

type Row = BundleDoc & { _id: Types.ObjectId };

export default async function AdminBundles() {
  await requireAdmin("merch.manage");
  await db();
  const rows = await Bundle.find().sort({ active: -1, createdAt: -1 }).lean<Row[]>();

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">Merchandising</p>
          <h1 className="adm-title">Bundles <span className="muted">({rows.length})</span></h1>
          <p className="muted adm-small">Shop-the-look sets of two or more products shown together.</p>
        </div>
        <Link className="btn adm-btn" href="/admin/bundles/new"><Icon name="plus" size={16} /> New bundle</Link>
      </header>

      <p className="notice">Bundle discounts aren&apos;t applied at checkout yet: shoppers pay the normal price for each item. Use a coupon or a timed sale if the set should be cheaper.</p>

      {rows.length ? (
        <div className="table-wrap adm-card flush">
          <table className="t adm-t">
            <thead><tr><th>Bundle</th><th className="num">Products</th><th>Updated</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={String(b._id)} className={b.active ? "" : "off"}>
                  <td>
                    <Link href={`/admin/bundles/${b._id}`} className="flex items-center gap-3">
                      <span className="adm-thumb">{b.image ? <Image src={b.image} alt="" width={42} height={56} /> : null}</span>
                      <span className="flex flex-col min-w-0"><b className="adm-a self-start">{b.name || b.slug}</b><small className="muted truncate">{b.description || `/${b.slug}`}</small></span>
                    </Link>
                  </td>
                  <td className="num">{b.productSlugs?.length ?? 0}</td>
                  <td className="nowrap">{fmtDate((b as Row & { updatedAt?: Date }).updatedAt)}</td>
                  <td><span className={`status ${b.active ? "text-ok" : "text-muted"}`}>{b.active ? "Live" : "Hidden"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <p>No bundles yet. Pair a saree with its blouse and dupatta, or a lehenga with jewellery-friendly accessories.</p>
          <Link className="btn adm-btn" href="/admin/bundles/new">Create a bundle</Link>
        </div>
      )}
    </div>
  );
}
