import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/region";
import { Icon } from "@/components/Icon";
import { PAYMENT_LABEL, STATUS_LABEL, dateTime, getOrder, longDate } from "../../../_components/data";
import { AddressLines, StatusPill } from "../../../_components/OrderBits";
import { CancelOrder } from "../../../_components/CancelOrder";
import { ShipmentTracker } from "@/components/tracking/ShipmentTracker";
import type { OrderStatus } from "@/lib/models";
import { getReturnsForOrder, returnWindow } from "@/lib/returns";
import { ReturnCard } from "../../../_components/ReturnBits";
import { db } from "@/lib/db";
import { Review } from "@/lib/models";

type Props = { params: Promise<{ number: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { number } = await params;
  return { title: `Order ${decodeURIComponent(number)}`, robots: { index: false, follow: false } };
}

export default async function OrderDetailPage({ params }: Props) {
  const { number: raw } = await params;
  let number = raw;
  try {
    number = decodeURIComponent(raw);
  } catch {}
  const session = await requireUser(`/account/orders/${encodeURIComponent(number)}`);
  const order = await getOrder(number);
  if (!order || order.userId !== session.uid) notFound();

  const r = order.region;
  const money = (v: number) => formatMoney(v, r);
  const ended = order.status === "cancelled" || order.status === "returned";
  const endEntry = ended ? order.history.filter((h) => h.status === order.status).pop() : undefined;
  const canCancel = order.status === "placed" || order.status === "confirmed";
  const methodLabel = PAYMENT_LABEL[order.payment.method] ?? order.payment.method;
  const returns = await getReturnsForOrder(order.number);
  // Delivered pieces can be reviewed once each.
  const delivered = order.status === "delivered";
  let reviewed = new Set<string>();
  if (delivered) {
    await db();
    const mine = await Review.find({ userId: session.uid, productSlug: { $in: order.items.map((i) => i.slug) } }, { productSlug: 1 }).lean<{ productSlug: string }[]>();
    reviewed = new Set(mine.map((m) => m.productSlug));
  }
  const win = returnWindow({
    status: order.status as OrderStatus,
    region: r,
    shipment: order.shipment?.deliveredAt ? { deliveredAt: new Date(order.shipment.deliveredAt) } : undefined,
    history: order.history,
  });

  return (
    <div className="flex min-w-0 flex-col gap-7">
      <nav className="crumbs ac-crumbs" aria-label="Breadcrumb">
        <Link href="/account">Account</Link>
        <span><Link href="/account/orders">Orders</Link></span>
        <span aria-current="page">{order.number}</span>
      </nav>

      <header className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="kick">Placed {longDate(order.createdAt, r)}</span>
          <h1 className="h2">
            Order <i>{order.number}</i>
          </h1>
        </div>
        <StatusPill status={order.status} />
      </header>

      <section className="ac-panel" aria-labelledby="track-h">
        <h2 className="h3" id="track-h">Tracking</h2>
        {ended && endEntry?.note ? <p className={`ac-ended ${order.status}`}><b>{STATUS_LABEL[order.status]}</b> on {dateTime(endEntry.at, r)}. {endEntry.note}</p> : null}
        <ShipmentTracker status={order.status} region={r} shipment={order.shipment} placedAt={order.createdAt.toISOString()} />
      </section>

      <section className="ac-panel" aria-labelledby="items-h">
        <h2 className="h3" id="items-h">Items ({order.items.reduce((n, i) => n + i.qty, 0)})</h2>
        <ul className="ac-lines">
          {order.items.map((it, i) => (
            <li key={`${it.slug}-${i}`}>
              <Link className="mount" href={`/p/${it.slug}`}>
                {it.image ? <Image src={it.image} alt={it.name} fill sizes="80px" /> : null}
              </Link>
              <div className="ac-line-txt">
                <Link href={`/p/${it.slug}`}><b>{it.name}</b></Link>
                <small>
                  Size {it.size} · Qty {it.qty}
                </small>
                {it.options?.blouse && (
                  <small>Blouse: {it.options.blouse === "stitched" ? "Stitched to measure" : "Unstitched fabric"}</small>
                )}
                {it.options?.fallPico && <small>Fall and pico done</small>}
                {it.optionsPrice > 0 && <small>Add-ons {money(it.optionsPrice)} each</small>}
                {delivered &&
                  (reviewed.has(it.slug) ? (
                    <small className="text-ok">Reviewed, thank you</small>
                  ) : (
                    <Link className="link self-start text-[12px]" href={`/p/${it.slug}#reviews`}>Write a review</Link>
                  ))}
              </div>
              <strong className="ac-line-price">{money((it.unitPrice + it.optionsPrice) * it.qty)}</strong>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="ac-panel" aria-labelledby="ship-h">
          <h2 className="h3" id="ship-h">Delivery address</h2>
          <AddressLines a={order.address} />
        </section>
        <section className="ac-panel" aria-labelledby="pay-h">
          <h2 className="h3" id="pay-h">Payment</h2>
          <dl className="ac-dl">
            <div><dt>Method</dt><dd>{methodLabel}</dd></div>
            <div><dt>Status</dt><dd><span className={`status ${order.payment.status === "paid" ? "paid" : order.payment.status === "failed" ? "failed" : order.payment.status === "refunded" ? "returned" : "placed"}`}>{order.payment.status}</span></dd></div>
            {order.payment.ref && <div><dt>Reference</dt><dd className="ac-ref">{order.payment.ref}</dd></div>}
          </dl>
        </section>
      </div>

      <section className="ac-panel" aria-labelledby="sum-h">
        <h2 className="h3" id="sum-h">Order summary</h2>
        <dl className="ac-totals">
          <div><dt>Subtotal</dt><dd>{money(order.subtotal)}</dd></div>
          {order.discount > 0 && (
            <div className="save"><dt>Discount{order.coupon ? ` (${order.coupon})` : ""}</dt><dd>−{money(order.discount)}</dd></div>
          )}
          {order.prepaidDiscount > 0 && <div className="save"><dt>Prepaid discount</dt><dd>−{money(order.prepaidDiscount)}</dd></div>}
          {order.loyaltyDiscount > 0 && <div className="save"><dt>Circle points ({order.loyaltyPoints})</dt><dd>−{money(order.loyaltyDiscount)}</dd></div>}
          {order.giftWrap && <div><dt>Gift wrap</dt><dd>{order.giftWrapFee > 0 ? money(order.giftWrapFee) : "Free"}</dd></div>}
          <div><dt>Shipping</dt><dd>{order.shipping > 0 ? money(order.shipping) : "Free"}</dd></div>
          {order.codFee > 0 && <div><dt>Cash on delivery fee</dt><dd>{money(order.codFee)}</dd></div>}
          {order.giftCardAmount > 0 && <div className="save"><dt>Gift card</dt><dd>−{money(order.giftCardAmount)}</dd></div>}
          <div className="grand"><dt>Total</dt><dd>{money(order.total)}</dd></div>
        </dl>
      </section>

      {(win.open || returns.length > 0) && (
        <section className="ac-panel" aria-labelledby="ret-h">
          <div className="sec-head">
            <h2 className="h3" id="ret-h">Returns &amp; exchanges</h2>
            {returns.length > 0 && <Link className="link" href="/account/returns">All returns</Link>}
          </div>
          {win.open && win.deadline && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="m-0 text-[13.5px] text-muted">
                Not the right fit? Return or exchange by {longDate(win.deadline, r)}.
              </p>
              <Link className="btn" href={`/account/orders/${encodeURIComponent(order.number)}/return`}>Return or exchange</Link>
            </div>
          )}
          {returns.map((rt) => <ReturnCard key={rt.number} rt={rt} showOrder={false} />)}
        </section>
      )}

      <div className="ac-actions">
        {canCancel && <CancelOrder number={order.number} />}
        {order.status !== "placed" && order.status !== "cancelled" && (
          <Link className="btn ghost" href={`/account/orders/${encodeURIComponent(order.number)}/invoice`}>
            View invoice
          </Link>
        )}
        <Link className="ac-help" href="/contact">
          <Icon name="video" />
          <span>
            <b>Need help with this order?</b>
            <small>Message us about sizing, delivery or returns.</small>
          </span>
          <Icon name="chevR" />
        </Link>
      </div>
    </div>
  );
}
