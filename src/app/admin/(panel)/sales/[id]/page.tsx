import type { Metadata } from "next";
import Link from "next/link";
import mongoose, { type Types } from "mongoose";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Sale, type SaleDoc } from "@/lib/models";
import { pickedProducts, saleOverlaps, saleState } from "@/components/admin/content/data";
import { SaleForm, type SaleView } from "@/components/admin/content/MerchForms";
import { allCategories } from "@/lib/categories";

export const metadata: Metadata = { title: "Timed sale" };

type Row = SaleDoc & { _id: Types.ObjectId };
const STATE_LABEL = { running: "Running now", scheduled: "Scheduled", ended: "Ended", off: "Switched off" } as const;

/** Next midnight IST, and a week after it. */
function defaults() {
  const ist = new Date(Date.now() + 330 * 60_000);
  const day = ist.toISOString().slice(0, 10);
  const start = new Date(new Date(`${day}T00:00:00+05:30`).getTime() + 864e5);
  return { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 7 * 864e5 - 60_000).toISOString() };
}

export default async function AdminSale({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("merch.manage");
  const { id } = await params;
  let view: SaleView | null = null;
  let warnings: string[] = [];
  let state: keyof typeof STATE_LABEL | null = null;
  if (id !== "new") {
    if (!mongoose.isValidObjectId(id)) notFound();
    await db();
    const s = await Sale.findById(id).lean<Row>();
    if (!s) notFound();
    view = {
      id: String(s._id),
      name: s.name ?? "",
      banner: s.banner ?? "",
      percentOff: s.percentOff ?? 0,
      categories: s.categories ?? [],
      collections: s.collections ?? [],
      products: await pickedProducts(s.slugs ?? []),
      regions: s.regions ?? [],
      startsAt: s.startsAt ? new Date(s.startsAt).toISOString() : "",
      endsAt: s.endsAt ? new Date(s.endsAt).toISOString() : "",
      active: !!s.active,
    };
    state = saleState({ active: !!s.active, startsAt: s.startsAt, endsAt: s.endsAt });
    const others = await Sale.find({ active: true, endsAt: { $gt: new Date() } }).lean<Row[]>();
    const all = [...others.filter((o) => String(o._id) !== id), s].map((x) => ({
      id: String(x._id), name: x.name, categories: x.categories ?? [], collections: x.collections ?? [], slugs: x.slugs ?? [], regions: x.regions ?? [], startsAt: x.startsAt, endsAt: x.endsAt, active: !!x.active,
    }));
    warnings = (await saleOverlaps(all)).get(id) ?? [];
  }
  return (
    <div className="adm-page narrow">
      <header className="adm-head">
        <div>
          <p className="kick"><Link href="/admin/sales">Timed sales</Link> / {view ? "Edit" : "New"}</p>
          <h1 className="adm-title">{view ? view.name : "New sale"}</h1>
        </div>
        {state ? <span className={`status ${state === "running" ? "text-ok" : state === "scheduled" ? "text-bronze" : state === "off" ? "text-sale" : "text-muted"}`}>{STATE_LABEL[state]}</span> : null}
      </header>
      {warnings.length ? (
        <div className="notice err flex flex-col gap-1">
          <b>This sale overlaps another one</b>
          {warnings.map((w) => <span key={w}>{w}</span>)}
          <span>Shoppers get only one discount per product, so narrow the products, regions or dates.</span>
        </div>
      ) : null}
      <SaleForm key={view?.id ?? "new"} sale={view} defaults={defaults()} categories={await allCategories()} />
    </div>
  );
}
