import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Order, Product } from "@/lib/models";
import { formatMoney } from "@/lib/region";
import { codToCollect, fmtDateTime, isStitchingItem, startOfToday, type LeanOrder } from "@/lib/admin-data";
import { PackingQueue, type PackingRow } from "@/components/admin/PackingQueue";

export const metadata: Metadata = { title: "Packing" };

const DAY = 86_400_000;

export default async function PackingPage() {
  await requireAdmin("orders.ship");
  await db();
  const orders = await Order.find({ status: { $in: ["confirmed", "packed"] } })
    .sort({ createdAt: 1 })
    .limit(300)
    .lean<LeanOrder[]>();
  const slugs = [...new Set(orders.flatMap((o) => o.items.map((i) => i.slug ?? "")).filter(Boolean))];
  const mto = new Set<string>(slugs.length ? await Product.distinct("slug", { slug: { $in: slugs }, madeToOrder: true }) : []);
  const today = startOfToday().getTime();

  const rows: PackingRow[] = orders.map((o) => {
    const placed = o.createdAt ? new Date(o.createdAt).getTime() : today;
    const collect = codToCollect(o);
    return {
      id: String(o._id),
      number: o.number,
      status: o.status,
      placed: fmtDateTime(o.createdAt),
      ageDays: placed >= today ? 0 : Math.ceil((today - placed) / DAY),
      customer: o.address?.name || o.email,
      city: o.address?.city ?? "",
      region: o.region,
      items: o.items.map((i) => ({
        name: i.name ?? "",
        size: i.size ?? "",
        qty: i.qty ?? 1,
        note: [i.options?.blouse === "stitched" ? "stitched blouse" : i.options?.blouse ? "unstitched blouse" : "", i.options?.fallPico ? "fall & pico" : ""].filter(Boolean).join(", "),
      })),
      collect: collect ? formatMoney(collect, o.region) : "",
      giftWrap: !!o.gift?.wrap,
      stitchingWaiting: o.items.filter((i) => isStitchingItem(i, mto) && i.stitching?.status !== "ready").reduce((n, i) => n + (i.qty ?? 1), 0),
    };
  });
  const toPack = rows.filter((r) => r.status === "confirmed").length;

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">Fulfilment</p>
          <h1 className="adm-title">Packing <span className="muted">({rows.length})</span></h1>
          <p className="muted adm-small">
            Confirmed and packed orders, oldest first. {toPack} to pack, {rows.length - toPack} packed and waiting for the courier.
            Add the courier and tracking number on the order to mark it shipped.
          </p>
        </div>
      </header>
      {rows.length ? (
        <PackingQueue rows={rows} />
      ) : (
        <div className="empty">
          <p>Nothing to pack. New orders appear here once they are confirmed.</p>
          <Link className="btn ghost adm-btn" href="/admin/orders?status=placed">See placed orders</Link>
        </div>
      )}
    </div>
  );
}
