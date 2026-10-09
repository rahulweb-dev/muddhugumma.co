import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { Product, type ProductDoc } from "@/lib/models";
import { toDTO } from "@/lib/queries";
import { formatMoney } from "@/lib/region";
import { categoryLabel } from "@/lib/types";
import { escapeRx, first, lowStockExpr, qs } from "@/lib/admin-data";
import { ActiveSwitch } from "@/components/admin/AdminControls";
import { Icon } from "@/components/Icon";
import { allCategories } from "@/lib/categories";

export const metadata: Metadata = { title: "Products" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminProducts({ searchParams }: { searchParams: SP }) {
  await requireAdmin("products.manage");
  const sp = await searchParams;
  const q = first(sp.q).trim().slice(0, 80);
  const cat = first(sp.category);
  const cats = await allCategories();
  const category = cats.some((c) => c.slug === cat) ? cat : "";
  const catName = (slug: string) => cats.find((c) => c.slug === slug)?.name ?? categoryLabel(slug);
  const low = first(sp.low) === "1";

  await db();
  const { lowStockThreshold: t } = await getSettings();
  const filter: Record<string, unknown> = {};
  if (q) filter.name = new RegExp(escapeRx(q), "i");
  if (category) filter.category = category;
  if (low) filter.$expr = lowStockExpr(t);
  const [docs, lowCount] = await Promise.all([
    Product.find(filter).sort(low ? { active: -1, name: 1 } : { active: -1, createdAt: -1 }).limit(500).lean<ProductDoc[]>(),
    Product.countDocuments({ active: true, $expr: lowStockExpr(t) }),
  ]);
  const products = docs.map(toDTO);
  const base = { q, category, low: low ? "1" : undefined };

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">Catalogue</p>
          <h1 className="adm-title">Products <span className="muted">({products.length})</span></h1>
        </div>
        <div className="adm-row">
          <a className="adm-more" href="/admin/products/export" download>Export CSV</a>
          <Link className="btn ghost adm-btn" href="/admin/products/import"><Icon name="upload" size={16} /> Bulk upload</Link>
          <Link className="btn adm-btn" href="/admin/products/new"><Icon name="plus" size={16} /> New product</Link>
        </div>
      </header>

      <nav className="adm-tabs" aria-label="Stock filter">
        <Link href={`/admin/products${qs(base, { low: undefined })}`} aria-current={!low ? "page" : undefined}>All</Link>
        <Link href={`/admin/products${qs(base, { low: "1" })}`} aria-current={low ? "page" : undefined}>Low stock · {t} or fewer <span>{lowCount}</span></Link>
      </nav>

      <form className="adm-filters" method="get">
        {low && <input type="hidden" name="low" value="1" />}
        <div className="field grow">
          <label htmlFor="q">Search by name</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="e.g. Banarasi" />
        </div>
        <div className="field">
          <label htmlFor="category">Category</label>
          <select id="category" name="category" defaultValue={category}>
            <option value="">All categories</option>
            {cats.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
        <button className="btn ghost adm-btn">Filter</button>
        {(q || category || low) && <Link className="adm-more" href="/admin/products">Clear</Link>}
      </form>

      {products.length ? (
        <div className="table-wrap adm-card flush">
          <table className="t adm-t">
            <thead>
              <tr>
                <th aria-label="Image" />
                <th>Name</th>
                <th>Category</th>
                <th className="num">Price ₹</th>
                <th className="num">Price £</th>
                <th>{low ? "Low sizes" : "Stock"}</th>
                <th>Active</th>
                <th aria-label="Edit" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const total = Object.values(p.stock).reduce((a, b) => a + (Number(b) || 0), 0);
                const lowSizes = Object.entries(p.stock).filter(([, n]) => n <= t);
                return (
                  <tr key={p.id} className={p.active ? "" : "off"}>
                    <td>
                      <span className="adm-thumb">{p.images[0] ? <Image src={p.images[0]} alt="" width={42} height={56} /> : null}</span>
                    </td>
                    <td>
                      <Link className="adm-a" href={`/admin/products/${p.id}`}>{p.name}</Link>
                      <br />
                      <small className="muted">/{p.slug}</small>
                    </td>
                    <td>{catName(p.category)}</td>
                    <td className="num">
                      {formatMoney(p.price.in.now, "in")}
                      {p.price.in.mrp ? <><br /><s className="muted">{formatMoney(p.price.in.mrp, "in")}</s></> : null}
                    </td>
                    <td className="num">
                      {formatMoney(p.price.uk.now, "uk")}
                      {p.price.uk.mrp ? <><br /><s className="muted">{formatMoney(p.price.uk.mrp, "uk")}</s></> : null}
                    </td>
                    {low ? (
                      <td>
                        <span className="adm-sizes adm-row">
                          {lowSizes.map(([k, v]) => <span key={k} className={v === 0 ? "out" : ""}>{k}: {v}</span>)}
                        </span>
                      </td>
                    ) : (
                      <td className={`num ${lowSizes.length ? "adm-low" : ""}`} title={Object.entries(p.stock).map(([k, v]) => `${k}: ${v}`).join(", ")}>{total}</td>
                    )}
                    <td><ActiveSwitch id={p.id} active={p.active} kind="product" label={p.name} /></td>
                    <td><Link className="adm-icon-btn" href={`/admin/products/${p.id}`} aria-label={`Edit ${p.name}`}><Icon name="edit" size={18} /></Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <p>{low && !q && !category ? `No product has a size with ${t} or fewer pieces.` : `No products match ${q ? `“${q}”` : "this filter"}.`}</p>
          <Link className="btn ghost adm-btn" href="/admin/products">Show all products</Link>
        </div>
      )}
    </div>
  );
}
