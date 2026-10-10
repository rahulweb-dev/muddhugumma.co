import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Types } from "mongoose";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Order, ReturnRequest, type ReturnDoc } from "@/lib/models";
import { RETURN_STATUS_LABEL } from "@/lib/returns";
import { formatMoney, REGION_CONFIG } from "@/lib/region";
import { courierName, trackingLink } from "@/lib/shipping";
import { dayKey, fmtDate, fmtDateTime } from "@/lib/admin-data";
import { ReturnActions } from "@/components/admin/content/ReturnActions";
import { returnTone } from "@/components/admin/content/shared";
import { canSeeRegion } from "@/lib/admin-scope";

export const metadata: Metadata = { title: "Return" };

type LeanReturn = ReturnDoc & { _id: Types.ObjectId };
type LeanOrderLite = { _id: Types.ObjectId; number: string; email: string; createdAt?: Date; status: string; payment?: { method?: string; status?: string }; address?: { name?: string; phone?: string; city?: string; postcode?: string }; shipment?: { deliveredAt?: Date } };

const REFUND_METHOD: Record<string, string> = { original: "Original payment method", store_credit: "Store credit (gift card)", bank: "Bank transfer" };
const PAYMENT: Record<string, string> = { cod: "Cash on delivery", cashfree: "Cashfree", razorpay: "Razorpay", stripe: "Stripe", test: "Test payment", giftcard: "Gift card" };

export default async function AdminReturn({ params }: { params: Promise<{ number: string }> }) {
  await requireAdmin("returns.manage");
  const { number: raw } = await params;
  const number = decodeURIComponent(raw).slice(0, 60);
  await db();
  const r = await ReturnRequest.findOne({ number }).lean<LeanReturn>();
  if (!r || !(await canSeeRegion(r.region))) notFound();
  const o = await Order.findOne({ number: r.orderNumber }, { number: 1, email: 1, createdAt: 1, status: 1, payment: 1, address: 1, "shipment.deliveredAt": 1 }).lean<LeanOrderLite>();

  const region = r.region === "uk" ? "uk" : "in";
  const money = (n: number) => formatMoney(n, region);
  const items = r.items ?? [];
  const returnItems = items.filter((i) => i.kind !== "exchange");
  const suggested = Math.round(returnItems.reduce((a, i) => a + (i.unitPrice ?? 0) * (i.qty ?? 1), 0) * 100) / 100;
  const history = [...(r.history ?? [])].sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime());
  const pickupLink = r.pickup?.awb ? trackingLink(r.pickup.courier, r.pickup.awb) : "";

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick"><Link href="/admin/returns">Returns</Link> / {r.number}</p>
          <h1 className="adm-title">Return {r.number}</h1>
          <p className="muted adm-small">Requested {fmtDateTime(r.createdAt)} · {REGION_CONFIG[region].label} ({REGION_CONFIG[region].currency})</p>
        </div>
        <span className={`status ${returnTone(r.status)}`}>{RETURN_STATUS_LABEL[r.status] ?? r.status}</span>
      </header>

      <div className="adm-cols wide-left">
        <div className="adm-stack">
          <section className="adm-card">
            <h2 className="h3">Items</h2>
            <ul className="adm-items">
              {items.map((it, i) => (
                <li key={i}>
                  <span className="adm-thumb">{it.image ? <Image src={it.image} alt="" width={48} height={64} /> : null}</span>
                  <div className="adm-item-meta">
                    {it.slug ? <Link className="adm-a" href={`/p/${it.slug}`} target="_blank">{it.name}</Link> : <b>{it.name}</b>}
                    <small className="muted">Size {it.size} · Qty {it.qty} · {money(it.unitPrice ?? 0)} each</small>
                    <small>
                      <b className={it.kind === "exchange" ? "text-bronze" : ""}>{it.kind === "exchange" ? `Exchange${it.exchangeSize ? ` for size ${it.exchangeSize}` : ""}` : "Return for refund"}</b>
                      {" · "}Reason: {it.reason || "Not given"}
                    </small>
                  </div>
                  <b className="num">{money((it.unitPrice ?? 0) * (it.qty ?? 1))}</b>
                </li>
              ))}
            </ul>
            {r.comments ? (
              <div className="flex flex-col gap-1">
                <span className="text-[10.5px] font-bold tracking-[.14em] uppercase text-muted">Customer&apos;s comments</span>
                <p className="m-0 whitespace-pre-line">{r.comments}</p>
              </div>
            ) : null}
            <dl className="adm-totals">
              <div><dt>Value of items returned for refund</dt><dd>{money(suggested)}</dd></div>
              {r.refundAmount ? <div className="grand"><dt>Refunded ({REFUND_METHOD[r.refundMethod] ?? r.refundMethod})</dt><dd>{money(r.refundAmount)}</dd></div> : null}
            </dl>
          </section>

          <section className="adm-card">
            <h2 className="h3">History</h2>
            {history.length ? (
              <ol className="adm-timeline">
                {history.map((h, i) => (
                  <li key={i} className={i === 0 ? "now" : ""}>
                    <span className={`status ${returnTone(h.status)}`}>{RETURN_STATUS_LABEL[h.status as ReturnDoc["status"]] ?? h.status}</span>
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
          <section className="adm-card">
            <h2 className="h3">Next step</h2>
            <ReturnActions
              number={r.number}
              status={r.status}
              region={region}
              suggestedRefund={suggested}
              hasReturns={returnItems.length > 0}
              hasExchanges={items.some((i) => i.kind === "exchange")}
              pickup={{ courier: r.pickup?.courier ?? "", awb: r.pickup?.awb ?? "", date: r.pickup?.date ? dayKey(new Date(r.pickup.date)) : "" }}
              todayIst={dayKey(new Date())}
            />
          </section>

          {r.pickup?.courier || r.pickup?.date ? (
            <section className="adm-card">
              <h2 className="h3">Pickup</h2>
              <dl className="adm-dl">
                <div><dt>Courier</dt><dd>{courierName(r.pickup.courier)}</dd></div>
                <div><dt>AWB</dt><dd>{r.pickup.awb ? (pickupLink ? <a className="adm-a" href={pickupLink} target="_blank" rel="noreferrer">{r.pickup.awb}</a> : <code>{r.pickup.awb}</code>) : "—"}</dd></div>
                <div><dt>Date</dt><dd>{fmtDate(r.pickup.date)}</dd></div>
              </dl>
            </section>
          ) : null}

          <section className="adm-card">
            <h2 className="h3">Order &amp; customer</h2>
            {o ? (
              <dl className="adm-dl">
                <div><dt>Order</dt><dd><Link className="adm-a" href={`/admin/orders/${o._id}`}>{o.number}</Link></dd></div>
                <div><dt>Placed</dt><dd>{fmtDate(o.createdAt)}</dd></div>
                {o.shipment?.deliveredAt ? <div><dt>Delivered</dt><dd>{fmtDate(o.shipment.deliveredAt)}</dd></div> : null}
                <div><dt>Payment</dt><dd>{PAYMENT[o.payment?.method ?? ""] ?? o.payment?.method ?? "—"} · {o.payment?.status ?? "—"}</dd></div>
                <div><dt>Name</dt><dd>{o.address?.name || "—"}</dd></div>
                <div><dt>Email</dt><dd><a className="adm-a" href={`mailto:${o.email}`}>{o.email}</a></dd></div>
                {o.address?.phone ? <div><dt>Phone</dt><dd><a className="adm-a" href={`tel:${o.address.phone}`}>{o.address.phone}</a></dd></div> : null}
                {o.address?.city ? <div><dt>Pickup from</dt><dd>{[o.address.city, o.address.postcode].filter(Boolean).join(" ")}</dd></div> : null}
              </dl>
            ) : (
              <p className="notice err">Order {r.orderNumber} was not found.</p>
            )}
            {o?.payment?.method === "cod" ? <p className="notice adm-small">Cash on delivery order: refunds go by bank transfer or store credit.</p> : null}
          </section>
        </div>
      </div>
    </div>
  );
}
