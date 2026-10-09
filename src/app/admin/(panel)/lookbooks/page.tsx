import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import type { Types } from "mongoose";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Lookbook, type LookbookDoc } from "@/lib/models";
import { fmtDate } from "@/lib/admin-data";
import { Icon } from "@/components/Icon";

export const metadata: Metadata = { title: "Lookbooks" };

type Row = LookbookDoc & { _id: Types.ObjectId };

export default async function AdminLookbooks() {
  await requireAdmin("merch.manage");
  await db();
  const rows = await Lookbook.find().sort({ active: -1, sort: 1, createdAt: -1 }).lean<Row[]>();

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">Merchandising</p>
          <h1 className="adm-title">Lookbooks <span className="muted">({rows.length})</span></h1>
          <p className="muted adm-small">Festival edits: a hero image, a short intro and a hand-picked, ordered set of products.</p>
        </div>
        <Link className="btn adm-btn" href="/admin/lookbooks/new"><Icon name="plus" size={16} /> New lookbook</Link>
      </header>

      {rows.length ? (
        <div className="table-wrap adm-card flush">
          <table className="t adm-t">
            <thead><tr><th>Lookbook</th><th>Festival</th><th className="num">Products</th><th className="num">Sort</th><th>Updated</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((l) => (
                <tr key={String(l._id)} className={l.active ? "" : "off"}>
                  <td>
                    <Link href={`/admin/lookbooks/${l._id}`} className="flex items-center gap-3">
                      <span className="relative w-16 aspect-[16/9] bg-stone shrink-0 overflow-hidden">{l.hero ? <Image src={l.hero} alt="" fill sizes="64px" className="object-cover" /> : null}</span>
                      <span className="flex flex-col"><b className="adm-a self-start">{l.title || l.slug}</b><small className="muted">/{l.slug}</small></span>
                    </Link>
                  </td>
                  <td>{l.festival || "—"}</td>
                  <td className="num">{l.productSlugs?.length ?? 0}</td>
                  <td className="num">{l.sort ?? 0}</td>
                  <td className="nowrap">{fmtDate((l as Row & { updatedAt?: Date }).updatedAt)}</td>
                  <td><span className={`status ${l.active ? "text-ok" : "text-muted"}`}>{l.active ? "Live" : "Hidden"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <p>No lookbooks yet. Start with the next festival: Diwali, Durga Puja or the wedding season.</p>
          <Link className="btn adm-btn" href="/admin/lookbooks/new">Create a lookbook</Link>
        </div>
      )}
    </div>
  );
}
