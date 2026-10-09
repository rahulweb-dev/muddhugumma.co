import type { Metadata } from "next";
import mongoose from "mongoose";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Order, Product, User } from "@/lib/models";
import { fmtDate, fmtDateTime, isStitchingItem, stitchingItemMatch, STITCH_STATUSES, type LeanOrder, type StitchStatusKey } from "@/lib/admin-data";
import { StitchingBoard, type StitchCard } from "@/components/admin/StitchingBoard";

export const metadata: Metadata = { title: "Stitching" };

const OPEN = ["confirmed", "packed"];
const DONE = ["shipped", "delivered"];
const asRecord = (m: unknown): Record<string, string> => (m instanceof Map ? Object.fromEntries(m) : ((m as Record<string, string>) ?? {}));

export default async function StitchingPage() {
  await requireAdmin("stitching.manage");
  await db();
  const mtoSlugs: string[] = await Product.distinct("slug", { madeToOrder: true });
  const mto = new Set(mtoSlugs);
  // Orders still with us, plus shipped ones whose item somehow never reached "Ready" (so nothing is lost).
  const orders = await Order.find({
    $or: [{ status: { $in: OPEN } }, { status: { $in: DONE }, items: { $elemMatch: { "stitching.status": { $exists: true, $ne: "ready" } } } }],
    items: { $elemMatch: stitchingItemMatch(mtoSlugs) },
  })
    .sort({ createdAt: 1 })
    .limit(400)
    .lean<LeanOrder[]>();

  const userIds = [...new Set(orders.map((o) => o.userId).filter((u): u is string => !!u && mongoose.isValidObjectId(u)))];
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } }, { measurements: 1 }).lean<{ _id: mongoose.Types.ObjectId; measurements?: { bust?: number; waist?: number; hip?: number; usualSize?: string } }[]>()
    : [];
  const saved = new Map(users.map((u) => [String(u._id), u.measurements ?? {}]));

  const cards: StitchCard[] = [];
  const tailors = new Set<string>();
  for (const o of orders) {
    o.items.forEach((it, index) => {
      if (!isStitchingItem(it, mto)) return;
      const status = ((it.stitching?.status as StitchStatusKey | undefined) ?? "measurements_needed") as StitchStatusKey;
      if (DONE.includes(o.status) && status === "ready") return;
      if (!(STITCH_STATUSES as readonly string[]).includes(status)) return;
      if (it.stitching?.tailor) tailors.add(it.stitching.tailor);
      const prof = o.userId ? saved.get(o.userId) : undefined;
      cards.push({
        key: `${o._id}-${index}`,
        orderId: String(o._id),
        index,
        slug: it.slug ?? "",
        orderNumber: o.number,
        orderStatus: o.status,
        customer: o.address?.name || o.email,
        placed: fmtDate(o.createdAt),
        name: it.name ?? "",
        size: it.size ?? "",
        qty: it.qty ?? 1,
        reason: it.slug && mto.has(it.slug) ? "Made to order" : "Stitched blouse",
        status,
        measurements: asRecord(it.stitching?.measurements),
        saved: prof ? { Bust: prof.bust ? String(prof.bust) : "", Waist: prof.waist ? String(prof.waist) : "", Hip: prof.hip ? String(prof.hip) : "", Usual: prof.usualSize ?? "" } : {},
        tailor: it.stitching?.tailor ?? "",
        notes: it.stitching?.notes ?? "",
        updated: it.stitching?.updatedAt ? fmtDateTime(it.stitching.updatedAt) : "",
      });
    });
  }
  const open = cards.filter((c) => c.status !== "ready").length;

  return (
    <div className="adm-page adm-page-wide">
      <header className="adm-head">
        <div>
          <p className="kick">Orders</p>
          <h1 className="adm-title">Stitching <span className="muted">({open} in progress)</span></h1>
          <p className="muted adm-small">
            Stitched blouses and made-to-order pieces from confirmed orders, oldest first. Record measurements in Details; a full set moves the piece to “Measurements in”.
          </p>
        </div>
      </header>
      {cards.length ? (
        <StitchingBoard cards={cards} tailors={[...tailors].sort()} />
      ) : (
        <div className="empty"><p>No pieces to stitch right now. Orders with a stitched blouse or a made-to-order product appear here once confirmed.</p></div>
      )}
    </div>
  );
}
