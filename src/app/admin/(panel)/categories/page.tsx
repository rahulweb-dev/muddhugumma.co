import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import type { Types } from "mongoose";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Category, Product, type CategoryDoc } from "@/lib/models";
import { Icon } from "@/components/Icon";

export const metadata: Metadata = { title: "Categories" };

type Row = CategoryDoc & { _id: Types.ObjectId };

export default async function AdminCategories() {
  await requireAdmin("products.manage");
  await db();
  const [rows, counts] = await Promise.all([
    Category.find().sort({ sort: 1, name: 1 }).lean<Row[]>(),
    Product.aggregate<{ _id: string; n: number; live: number }>([{ $group: { _id: "$category", n: { $sum: 1 }, live: { $sum: { $cond: ["$active", 1, 0] } } } }]),
  ]);
  const count = (slug: string) => counts.find((c) => c._id === slug);
  const orphans = counts.filter((c) => !rows.some((r) => r.slug === c._id));
  const liveOrphans = orphans.filter((o) => o.live > 0);
  const hiddenOrphans = orphans.filter((o) => o.live === 0);

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">Catalogue</p>
          <h1 className="adm-title">Categories <span className="muted">({rows.length})</span></h1>
        </div>
        <Link className="btn adm-btn" href="/admin/categories/new"><Icon name="plus" size={16} /> New category</Link>
      </header>
      <p className="muted adm-small m-0">
        Categories make up the shop menu, the footer, the homepage tiles and the filters. Lower numbers come first. A hidden category keeps its products but disappears from the shop.
      </p>

      {rows.length ? (
        <div className="table-wrap adm-card flush">
          <table className="t adm-t">
            <thead>
              <tr>
                <th aria-label="Image" />
                <th>Name</th>
                <th className="num">Order</th>
                <th className="num">Products</th>
                <th>In menu</th>
                <th>Status</th>
                <th aria-label="Edit" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const n = count(c.slug);
                return (
                  <tr key={String(c._id)} className={c.active ? "" : "off"}>
                    <td><span className="adm-thumb">{c.image ? <Image src={c.image} alt="" width={42} height={56} /> : null}</span></td>
                    <td>
                      <Link className="adm-a" href={`/admin/categories/${c._id}`}>{c.name}</Link>
                      <br />
                      <small className="muted">/c/{c.slug}</small>
                    </td>
                    <td className="num">{c.sort}</td>
                    <td className="num">
                      <Link className="adm-a" href={`/admin/products?category=${c.slug}`}>{n?.live ?? 0}</Link>
                      {n && n.n > n.live ? <small className="muted"> (+{n.n - n.live} hidden)</small> : null}
                    </td>
                    <td>{c.inNav ? "Yes" : "No"}</td>
                    <td><span className={`status ${c.active ? "text-ok" : "text-muted"}`}>{c.active ? "Live" : "Hidden"}</span></td>
                    <td><Link className="adm-icon-btn" href={`/admin/categories/${c._id}`} aria-label={`Edit ${c.name}`}><Icon name="edit" size={18} /></Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <h2 className="h3">No categories yet</h2>
          <p>Until you add one, the shop shows three starter categories: Sarees, Kurta Sets and Lehengas.</p>
          <Link className="btn adm-btn" href="/admin/categories/new">Add the first category</Link>
        </div>
      )}

      {liveOrphans.length ? (
        <p className="notice err">
          Live products in categories that don&apos;t exist: {liveOrphans.map((o) => `${o._id || "(none)"} (${o.live})`).join(", ")}. Shoppers can&apos;t browse to them. Create a category with that slug, or move the products.
        </p>
      ) : null}
      {hiddenOrphans.length ? (
        <p className="muted adm-small m-0">
          Hidden products from old categories: {hiddenOrphans.map((o) => `${o._id || "(none)"} (${o.n})`).join(", ")}. These are switched off and not in the shop.
        </p>
      ) : null}
    </div>
  );
}
