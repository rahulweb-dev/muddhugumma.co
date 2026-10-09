import type { Metadata } from "next";
import type { Types } from "mongoose";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Product, Supplier, type SupplierDoc } from "@/lib/models";
import { NewSupplierForm, SupplierCard, type SupplierView } from "@/components/admin/SupplierManager";

export const metadata: Metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  await requireAdmin("products.manage");
  await db();
  const [docs, counts] = await Promise.all([
    Supplier.find().sort({ name: 1 }).lean<(SupplierDoc & { _id: Types.ObjectId })[]>(),
    Product.aggregate<{ _id: string; n: number }>([{ $match: { supplierId: { $nin: ["", null] } } }, { $group: { _id: "$supplierId", n: { $sum: 1 } } }]),
  ]);
  const count = new Map(counts.map((c) => [c._id, c.n]));
  const suppliers: SupplierView[] = docs.map((s) => ({
    id: String(s._id),
    name: s.name ?? "",
    cluster: s.cluster ?? "",
    craft: s.craft ?? "",
    contact: s.contact ?? "",
    phone: s.phone ?? "",
    email: s.email ?? "",
    notes: s.notes ?? "",
    products: count.get(String(s._id)) ?? 0,
  }));

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">Catalogue</p>
          <h1 className="adm-title">Suppliers <span className="muted">({suppliers.length})</span></h1>
          <p className="muted adm-small">Weavers and workshops you buy from. Link products to them on the product form or in bulk upload.</p>
        </div>
      </header>

      <section className="adm-card">
        <h2 className="h3">New supplier</h2>
        <NewSupplierForm />
      </section>

      {suppliers.length ? (
        <ul className="adm-cols list-none m-0 p-0">
          {suppliers.map((s) => <SupplierCard key={s.id} s={s} />)}
        </ul>
      ) : (
        <div className="empty"><p>No suppliers yet. Add your first weaver or workshop above.</p></div>
      )}
    </div>
  );
}
