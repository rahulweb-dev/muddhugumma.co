import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { requireAdmin } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { Order, Product, User, type ProductDoc } from "@/lib/models";
import { escapeRx, first, fmtDateTime, type LeanOrder } from "@/lib/admin-data";
import { REGION_FLAG, getAdminScope, scopeFilter } from "@/lib/admin-scope";
import { orderStatusLabel } from "@/lib/admin-labels";
import { formatMoney } from "@/lib/region";

export const metadata: Metadata = { title: "Search" };

type SP = Promise<Record<string, string | string[] | undefined>>;
type Customer = { _id: unknown; name: string; email: string; phone?: string; createdAt?: Date };

/** One box for everything: order numbers, customer names / emails / phones, product names. Only shows what the role may see. */
export default async function AdminSearch({ searchParams }: { searchParams: SP }) {
  const [admin, scope] = await Promise.all([requireAdmin(), getAdminScope()]);
  const q = first((await searchParams).q).trim().slice(0, 80);
  const may = (p: Parameters<typeof can>[1]) => can(admin.role, p);

  let orders: LeanOrder[] = [];
  let products: ProductDoc[] = [];
  let customers: Customer[] = [];
  if (q.length >= 2) {
    await db();
    const rx = new RegExp(escapeRx(q), "i");
    const digits = q.replace(/\D/g, "");
    const phoneRx = digits.length >= 5 ? new RegExp(digits.slice(-10)) : null;
    [orders, products, customers] = await Promise.all([
      may("orders.view")
        ? Order.find({ ...scopeFilter(scope), $or: [{ number: rx }, { email: rx }, { "address.name": rx }, ...(phoneRx ? [{ "address.phone": phoneRx }] : []), { "shipment.awb": rx }] })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean<LeanOrder[]>()
        : Promise.resolve([]),
      may("products.manage") ? Product.find({ $or: [{ name: rx }, { slug: rx }, { oldSlugs: rx }] }, { name: 1, slug: 1, images: 1, active: 1 }).limit(10).lean<ProductDoc[]>() : Promise.resolve([]),
      may("customers.view")
        ? User.find({ role: "customer", $or: [{ name: rx }, { email: rx }, ...(phoneRx ? [{ phone: phoneRx }] : [])] }, { name: 1, email: 1, phone: 1, createdAt: 1 }).limit(10).lean<Customer[]>()
        : Promise.resolve([]),
    ]);
  }
  const nothing = q.length >= 2 && !orders.length && !products.length && !customers.length;

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">Search</p>
          <h1 className="adm-title">{q ? <>Results for “{q}”</> : "Search"}</h1>
        </div>
      </header>

      <form className="adm-filters" action="/admin/search" role="search">
        <div className="field grow">
          <label htmlFor="as-q">Order number, customer name, email, phone or product</label>
          <input id="as-q" name="q" defaultValue={q} autoFocus placeholder="e.g. MG251009, Priya, 98765, georgette" />
        </div>
        <button className="btn adm-btn" type="submit">Search</button>
      </form>

      {q.length > 0 && q.length < 2 && <p className="muted">Type at least two letters or numbers.</p>}
      {nothing && <div className="adm-card"><p className="muted adm-empty">Nothing found for “{q}”{scope !== "all" ? " in this store. Try switching the store at the top to All." : "."}</p></div>}

      {orders.length > 0 && (
        <section className="adm-card">
          <div className="adm-card-head"><h2 className="h3">Orders</h2><Link className="adm-more" href={`/admin/orders?q=${encodeURIComponent(q)}`}>See all</Link></div>
          <ul className="adm-list">
            {orders.map((o) => (
              <li key={String(o._id)}>
                <Link href={`/admin/orders/${o._id}`}>
                  <div>
                    <b>{REGION_FLAG[o.region === "uk" ? "uk" : "in"]} {o.number}</b>
                    <small className="muted">{o.address?.name || o.email} · {fmtDateTime(o.createdAt)}</small>
                  </div>
                  <div className="adm-list-end">
                    <span>{formatMoney(o.total ?? 0, o.region)}</span>
                    <span className={`status ${o.status}`}>{orderStatusLabel(o.status)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {products.length > 0 && (
        <section className="adm-card">
          <div className="adm-card-head"><h2 className="h3">Products</h2><Link className="adm-more" href={`/admin/stock?q=${encodeURIComponent(q)}`}>Stock for these</Link></div>
          <ul className="adm-list">
            {products.map((p) => (
              <li key={String(p._id)}>
                <Link href={`/admin/products/${p._id}`}>
                  <div className="adm-prod">
                    <span className="adm-thumb sm">{p.images?.[0] ? <Image src={p.images[0]} alt="" width={30} height={40} /> : null}</span>
                    <span><b>{p.name}</b><small className="muted block">/{p.slug}{p.active === false ? " · hidden" : ""}</small></span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {customers.length > 0 && (
        <section className="adm-card">
          <div className="adm-card-head"><h2 className="h3">Customers</h2><Link className="adm-more" href={`/admin/customers?q=${encodeURIComponent(q)}`}>See all</Link></div>
          <ul className="adm-list">
            {customers.map((c) => (
              <li key={String(c._id)}>
                <Link href={`/admin/customers/${c._id}`}>
                  <div>
                    <b>{c.name}</b>
                    <small className="muted">{c.email}{c.phone ? ` · ${c.phone}` : ""}</small>
                  </div>
                  <div className="adm-list-end"><small className="muted">Joined {fmtDateTime(c.createdAt)}</small></div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
