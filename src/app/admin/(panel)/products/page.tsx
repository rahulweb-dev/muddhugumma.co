import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { Product, type ProductDoc } from "@/lib/models";
import { toDTO } from "@/lib/queries";
import { stockFor } from "@/lib/stock";
import { formatMoney } from "@/lib/region";
import { categoryLabel } from "@/lib/types";
import { escapeRx, first, lowStockExpr, qs } from "@/lib/admin-data";
import { ActiveSwitch } from "@/components/admin/AdminControls";
import { Icon } from "@/components/Icon";
import { allCategories } from "@/lib/categories";
import { getAdminScope } from "@/lib/admin-scope";

export const metadata: Metadata = { title: "Products" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminProducts({ searchParams }: { searchParams: SP }) {
  await requireAdmin("products.manage");
  const scope = await getAdminScope(); // top-bar store: show only that country's stock column
  const sp = await searchParams;
  const q = first(sp.q).trim().slice(0, 80);
  const cat = first(sp.category);
  const cats = await allCategories();
  const category = cats.some((c) => c.slug === cat) ? cat : "";
  const catName = (slug: string) => cats.find((c) => c.slug === slug)?.name ?? categoryLabel(slug);
  const low = first(sp.low) === "1";
  const statusRaw = first(sp.status);
  const status = statusRaw === "live" || statusRaw === "hidden" ? statusRaw : "";
  const view = first(sp.view) === "list" ? "list" : "grid";

  await db();
  const { lowStockThreshold: t } = await getSettings();
  const filter: Record<string, unknown> = {};
  if (q) filter.name = new RegExp(escapeRx(q), "i");
  if (category) filter.category = category;
  if (low) filter.$expr = lowStockExpr(t);
  if (status) filter.active = status === "live";
  const [docs, lowCount, liveCount, hiddenCount] = await Promise.all([
    Product.find(filter).sort(low ? { active: -1, name: 1 } : { active: -1, createdAt: -1 }).limit(500).lean<ProductDoc[]>(),
    Product.countDocuments({ active: true, $expr: lowStockExpr(t) }),
    Product.countDocuments({ active: true }),
    Product.countDocuments({ active: false }),
  ]);
  const products = docs.map((d) => ({ ...toDTO(d, "in"), stockUk: stockFor(d, "uk") }));
  const base = { q, category, low: low ? "1" : undefined, status: status || undefined, view: view === "list" ? "list" : undefined };
  const regions = (["in", "uk"] as const).filter((r) => scope === "all" || r === scope);
  const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "Free size"];
  const sizesOf = (s: Record<string, number>, free: boolean) =>
    (free ? ["Free size"] : SIZE_ORDER.slice(0, 6)).map((k) => [k, Number(s[k]) || 0] as const);

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

      <div className="adm-row pg-bar">
        <nav className="adm-tabs" aria-label="Show">
          <Link href={`/admin/products${qs(base, { low: undefined, status: undefined })}`} aria-current={!low && !status ? "page" : undefined}>All <span>{liveCount + hiddenCount}</span></Link>
          <Link href={`/admin/products${qs(base, { low: undefined, status: "live" })}`} aria-current={status === "live" && !low ? "page" : undefined}>Live <span>{liveCount}</span></Link>
          <Link href={`/admin/products${qs(base, { low: undefined, status: "hidden" })}`} aria-current={status === "hidden" && !low ? "page" : undefined}>Hidden <span>{hiddenCount}</span></Link>
          <Link href={`/admin/products${qs(base, { low: "1", status: undefined })}`} aria-current={low ? "page" : undefined}>Low stock · {t} or fewer <span>{lowCount}</span></Link>
        </nav>
        <div className="pg-view" role="group" aria-label="Layout">
          <Link href={`/admin/products${qs(base, { view: undefined })}`} aria-current={view === "grid" ? "true" : undefined}><Icon name="grid" size={16} /> Grid</Link>
          <Link href={`/admin/products${qs(base, { view: "list" })}`} aria-current={view === "list" ? "true" : undefined}><Icon name="menu" size={16} /> List</Link>
        </div>
      </div>

      <form className="adm-filters" method="get">
        {low && <input type="hidden" name="low" value="1" />}
        {status && <input type="hidden" name="status" value={status} />}
        {view === "list" && <input type="hidden" name="view" value="list" />}
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
        {(q || category || low || status) && <Link className="adm-more" href={`/admin/products${view === "list" ? "?view=list" : ""}`}>Clear</Link>}
      </form>

      {products.length && view === "grid" ? (
        <ul className="pg">
          {products.map((p) => {
            const stocks = regions.map((r) => {
              const sizes = sizesOf(r === "uk" ? p.stockUk : p.stock, p.freeSize);
              return { r, sizes, total: sizes.reduce((a, [, n]) => a + Math.max(0, n), 0), low: sizes.some(([, n]) => n <= t) };
            });
            const anyLow = stocks.some((x) => x.low);
            return (
              <li key={p.id} className={`pg-card${p.active ? "" : " off"}`}>
                <Link className="pg-ph" href={`/admin/products/${p.id}`} aria-label={`Edit ${p.name}`}>
                  {p.images[0] ? <Image src={p.images[0]} alt="" fill sizes="(min-width:1200px) 20vw, (min-width:720px) 30vw, 50vw" /> : <span className="pg-noimg">No photo</span>}
                  <span className={`pg-state ${p.active ? "on" : ""}`}>{p.active ? "Live" : "Hidden"}</span>
                  {anyLow && <span className="pg-lowtag">Low stock</span>}
                </Link>
                <div className="pg-body">
                  <span className="pg-cat">{catName(p.category)}</span>
                  <Link className="pg-name" href={`/admin/products/${p.id}`}>{p.name}</Link>
                  <div className="pg-prices">
                    <span><b>{formatMoney(p.price.in.now, "in")}</b>{p.price.in.mrp ? <s>{formatMoney(p.price.in.mrp, "in")}</s> : null}</span>
                    <span><b>{formatMoney(p.price.uk.now, "uk")}</b>{p.price.uk.mrp ? <s>{formatMoney(p.price.uk.mrp, "uk")}</s> : null}</span>
                  </div>
                  {stocks.map((x) => (
                    <div key={x.r} className="pg-stock">
                      <div className="pg-stock-head"><span>{x.r === "uk" ? "🇬🇧 UK" : "🇮🇳 India"}</span><b className={x.total === 0 ? "out" : x.low ? "low" : ""}>{x.total} pcs</b></div>
                      <div className="pg-sizes">
                        {x.sizes.map(([k, n]) => (
                          <span key={k} className={n <= 0 ? "out" : n <= t ? "low" : ""} title={`${k}: ${n}`}>{k === "Free size" ? "Free" : k} <b>{n}</b></span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pg-foot">
                  <ActiveSwitch id={p.id} active={p.active} kind="product" label={p.name} />
                  <Link className="pg-btn" href={`/admin/stock?q=${encodeURIComponent(p.name)}`}>Stock</Link>
                  <Link className="pg-btn dark" href={`/admin/products/${p.id}`}><Icon name="edit" size={14} /> Edit</Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : products.length ? (
        <div className="table-wrap adm-card flush">
          <table className="t adm-t">
            <thead>
              <tr>
                <th aria-label="Image" />
                <th>Name</th>
                <th>Category</th>
                <th className="num">Price ₹</th>
                <th className="num">Price £</th>
                {low ? <th>Low sizes</th> : <>{scope !== "uk" && <th className="num">Stock 🇮🇳 India</th>}{scope !== "in" && <th className="num">Stock 🇬🇧 UK</th>}</>}
                <th>Active</th>
                <th aria-label="Edit" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const byRegion = (
                  [
                    ["IN", p.stock],
                    ["UK", p.stockUk],
                  ] as const
                ).filter(([r]) => scope === "all" || r.toLowerCase() === scope);
                const total = (s: Record<string, number>) => Object.values(s).reduce((a, b) => a + (Number(b) || 0), 0);
                const lowOf = (s: Record<string, number>) => Object.entries(s).filter(([, n]) => n <= t);
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
                          {byRegion.flatMap(([r, s]) => lowOf(s).map(([k, v]) => <span key={r + k} className={v === 0 ? "out" : ""}>{r} {k}: {v}</span>))}
                        </span>
                      </td>
                    ) : (
                      byRegion.map(([r, s]) => (
                        <td key={r} className={`num ${lowOf(s).length ? "adm-low" : ""}`} title={Object.entries(s).map(([k, v]) => `${k}: ${v}`).join(", ")}>{total(s)}</td>
                      ))
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
