import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import mongoose from "mongoose";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { Order, Product, User } from "@/lib/models";
import { formatMoney, REGION_CONFIG } from "@/lib/region";
import { STITCH_LABEL, codToCollect, fmtDateTime, isStitchingItem, type LeanOrder, type StitchStatusKey } from "@/lib/admin-data";
import { OrderStatusForm, PaymentButtons } from "@/components/admin/AdminControls";
import { ShipmentManager } from "@/components/admin/ShipmentManager";
import { toShipmentView } from "@/lib/tracking";
import type { ShipmentDoc } from "@/lib/models";

export const metadata: Metadata = { title: "Order" };

const METHOD: Record<string, string> = { cod: "Cash on delivery", razorpay: "Razorpay", stripe: "Stripe", test: "Test payment", giftcard: "Gift card" };

export default async function AdminOrder({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin("orders.view");
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) notFound();
  await db();
  const o = await Order.findById(id).lean<LeanOrder & { shipment?: ShipmentDoc }>();
  if (!o) notFound();
  const [user, prevOrders, mto] = await Promise.all([
    o.userId && mongoose.isValidObjectId(o.userId)
      ? User.findById(o.userId, { name: 1, phone: 1, createdAt: 1 }).lean<{ name?: string; phone?: string; createdAt?: Date }>()
      : Promise.resolve(null),
    Order.countDocuments({ email: o.email, _id: { $ne: o._id } }),
    Product.distinct("slug", { slug: { $in: o.items.map((i) => i.slug).filter(Boolean) }, madeToOrder: true }),
  ]);
  const mtoSet = new Set<string>(mto);
  const may = {
    manage: can(admin.role, "orders.manage"),
    ship: can(admin.role, "orders.ship"),
    stitch: can(admin.role, "stitching.manage"),
  };

  const r = o.region;
  const money = (n?: number) => formatMoney(n ?? 0, r);
  const a = o.address ?? {};
  const history = [...(o.history ?? [])].sort((x, y) => new Date(y.at ?? 0).getTime() - new Date(x.at ?? 0).getTime());
  const payStatus = o.payment?.status ?? "pending";
  const shipment = toShipmentView(o.shipment);
  const collect = codToCollect(o);

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick"><Link href="/admin/orders">Orders</Link> / {o.number}</p>
          <h1 className="adm-title">Order {o.number}</h1>
          <p className="muted adm-small">
            Placed {fmtDateTime(o.createdAt)} · {REGION_CONFIG[r].label} ({REGION_CONFIG[r].currency})
          </p>
        </div>
        <div className="adm-row">
          <span className={`status ${o.status}`}>{o.status}</span>
          <span className={`status ${payStatus}`}>{payStatus}</span>
          {may.ship && <Link className="btn ghost adm-btn" href={`/admin/orders/${o._id}/slip`} target="_blank">Packing slip</Link>}
          {may.manage && <Link className="btn ghost adm-btn" href={`/admin/orders/${o._id}/invoice`} target="_blank">Invoice</Link>}
        </div>
      </header>

      {o.gift?.wrap ? (
        <p className="notice" role="note">
          <b>Gift wrap.</b> {o.gift.message ? <>Card message: “{o.gift.message}”</> : "No card message."} Don&apos;t put prices in the parcel.
        </p>
      ) : null}

      <div className="adm-cols wide-left">
        <div className="adm-stack">
          <section className="adm-card">
            <h2 className="h3">Items</h2>
            <ul className="adm-items">
              {o.items.map((it, i) => {
                const line = ((it.unitPrice ?? 0) + (it.optionsPrice ?? 0)) * (it.qty ?? 1);
                const opts = [
                  it.options?.blouse ? `Blouse: ${it.options.blouse === "stitched" ? "stitched to measure" : "unstitched"}` : "",
                  it.options?.fallPico ? "Fall and pico done" : "",
                  it.slug && mtoSet.has(it.slug) ? "Made to order" : "",
                ].filter(Boolean);
                const stitch = isStitchingItem(it, mtoSet) ? ((it.stitching?.status as StitchStatusKey | undefined) ?? "measurements_needed") : null;
                return (
                  <li key={i}>
                    <span className="adm-thumb">{it.image ? <Image src={it.image} alt="" width={48} height={64} /> : null}</span>
                    <div className="adm-item-meta">
                      {it.slug ? <Link className="adm-a" href={`/p/${it.slug}`} target="_blank">{it.name}</Link> : <b>{it.name}</b>}
                      <small className="muted">Size {it.size} · Qty {it.qty} · {money(it.unitPrice)} each</small>
                      {opts.length ? <small>{opts.join(" · ")}{it.optionsPrice ? ` (+${money(it.optionsPrice)})` : ""}</small> : null}
                      {stitch ? (
                        <small>
                          Stitching: <span className={`status st-${stitch}`}>{STITCH_LABEL[stitch] ?? stitch}</span>
                          {it.stitching?.tailor ? ` · ${it.stitching.tailor}` : ""}
                          {may.stitch ? <> · <Link className="adm-a" href={`/admin/stitching#${o._id}-${i}`}>Board</Link></> : null}
                        </small>
                      ) : null}
                    </div>
                    <b className="num">{money(line)}</b>
                  </li>
                );
              })}
            </ul>
            <dl className="adm-totals">
              <div><dt>Subtotal</dt><dd>{money(o.subtotal)}</dd></div>
              {o.discount ? <div><dt>Discount{o.coupon ? ` (${o.coupon})` : ""}</dt><dd>−{money(o.discount)}</dd></div> : null}
              {o.prepaidDiscount ? <div><dt>Prepaid discount</dt><dd>−{money(o.prepaidDiscount)}</dd></div> : null}
              {o.loyalty?.discount ? <div><dt>Points redeemed ({o.loyalty.redeemedPoints ?? 0})</dt><dd>−{money(o.loyalty.discount)}</dd></div> : null}
              {o.gift?.fee ? <div><dt>Gift wrap</dt><dd>{money(o.gift.fee)}</dd></div> : null}
              <div><dt>Shipping</dt><dd>{o.shipping ? money(o.shipping) : "Free"}</dd></div>
              {o.codFee ? <div><dt>Cash on delivery fee</dt><dd>{money(o.codFee)}</dd></div> : null}
              {o.giftCard?.amount ? <div><dt>Gift card {o.giftCard.code}</dt><dd>−{money(o.giftCard.amount)}</dd></div> : null}
              <div className="grand"><dt>Total</dt><dd>{money(o.total)}</dd></div>
              {o.partialCod?.paidOnline ? <div><dt>Paid online (part COD)</dt><dd>{money(o.partialCod.paidOnline)}</dd></div> : null}
              {collect ? <div><dt><b>Collect on delivery</b></dt><dd><b>{money(collect)}</b></dd></div> : null}
            </dl>
          </section>

          <section className="adm-card">
            <h2 className="h3">History</h2>
            {history.length ? (
              <ol className="adm-timeline">
                {history.map((h, i) => (
                  <li key={i} className={i === 0 ? "now" : ""}>
                    <span className={`status ${(h.status ?? "").replace(/^payment /, "")}`}>{h.status}</span>
                    <time className="muted adm-small">{fmtDateTime(h.at)}</time>
                    {h.note ? <p>{h.note}</p> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted adm-small">No history recorded.</p>
            )}
          </section>
        </div>

        <div className="adm-stack">
          <section className="adm-card" id="shipment">
            <h2 className="h3">Shipment &amp; tracking</h2>
            {may.ship ? (
              <ShipmentManager orderId={String(o._id)} region={r} status={o.status} shipment={shipment} />
            ) : shipment ? (
              <dl className="adm-dl">
                <div><dt>Courier</dt><dd>{shipment.courierName}</dd></div>
                <div><dt>Tracking no.</dt><dd><code>{shipment.awb}</code></dd></div>
                {shipment.events[0] ? <div><dt>Latest</dt><dd>{shipment.events[0].label}</dd></div> : null}
              </dl>
            ) : (
              <p className="muted adm-small">Not shipped yet.</p>
            )}
          </section>

          {may.manage && (
            <section className="adm-card">
              <h2 className="h3">Update status</h2>
              <OrderStatusForm orderId={String(o._id)} status={o.status} />
            </section>
          )}

          <section className="adm-card">
            <h2 className="h3">Payment</h2>
            <dl className="adm-dl">
              <div><dt>Method</dt><dd>{METHOD[o.payment?.method ?? ""] ?? o.payment?.method ?? "—"}{o.partialCod?.paidOnline ? " (part paid online)" : ""}</dd></div>
              <div><dt>Status</dt><dd><span className={`status ${payStatus}`}>{payStatus}</span></dd></div>
              {o.payment?.ref ? <div><dt>Reference</dt><dd><code>{o.payment.ref}</code></dd></div> : null}
              {o.payment?.method === "cod" ? <div><dt>COD phone verified</dt><dd>{o.codVerified ? "Yes" : "No"}</dd></div> : null}
              <div><dt>Amount</dt><dd>{money(o.total)}</dd></div>
              {o.invoiceNumber ? <div><dt>Invoice</dt><dd>{o.invoiceNumber}</dd></div> : null}
            </dl>
            {may.manage && <PaymentButtons orderId={String(o._id)} status={payStatus} />}
          </section>

          <section className="adm-card">
            <h2 className="h3">Customer</h2>
            <dl className="adm-dl">
              <div><dt>Name</dt><dd>{user?.name || a.name || "—"}</dd></div>
              <div><dt>Email</dt><dd><a className="adm-a" href={`mailto:${o.email}`}>{o.email}</a></dd></div>
              {(a.phone || user?.phone) ? <div><dt>Phone</dt><dd><a className="adm-a" href={`tel:${a.phone || user?.phone}`}>{a.phone || user?.phone}</a></dd></div> : null}
              <div><dt>Account</dt><dd>{user ? `Registered ${fmtDateTime(user.createdAt).split(",")[0]}` : "Guest checkout"}</dd></div>
              <div><dt>Other orders</dt><dd>{prevOrders ? <Link className="adm-a" href={`/admin/orders?q=${encodeURIComponent(o.email)}`}>{prevOrders}</Link> : "First order"}</dd></div>
            </dl>
          </section>

          <section className="adm-card">
            <h2 className="h3">Ship to</h2>
            <address className="adm-addr">
              <b>{a.name}</b>
              <br />{a.line1}
              {a.line2 ? <><br />{a.line2}</> : null}
              <br />{[a.city, a.state].filter(Boolean).join(", ")} {a.postcode}
              <br />{REGION_CONFIG[r].country}
              {a.phone ? <><br />{a.phone}</> : null}
            </address>
          </section>
        </div>
      </div>
    </div>
  );
}
