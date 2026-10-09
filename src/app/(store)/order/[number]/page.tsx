import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { Icon } from "@/components/Icon";
import { ClearBag } from "@/components/checkout/ClearBag";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Order } from "@/lib/models";
import { LAST_ORDER_COOKIE, optionLabels } from "@/lib/checkout-pricing";
import { markOrderPaid, retrieveStripeSession } from "@/lib/payments";
import { settleCashfree } from "@/lib/cashfree";
import { REGION_CONFIG, deliveryWindow, formatMoney, isRegion, shortDate, type Region } from "@/lib/region";
import "@/styles/checkout.css";
import { can } from "@/lib/permissions";
import { TrackOnMount } from "@/components/analytics/TrackOnMount";

export const metadata: Metadata = { title: "Order confirmation", robots: { index: false } };

type LeanOrder = {
  number: string;
  userId?: string | null;
  email: string;
  region: string;
  items: { slug?: string | null; name?: string | null; image?: string | null; size?: string | null; qty?: number | null; unitPrice?: number | null; optionsPrice?: number | null; options?: { blouse?: string | null; fallPico?: boolean | null } | null }[];
  address: { name?: string | null; phone?: string | null; line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; postcode?: string | null };
  subtotal?: number | null;
  discount?: number | null;
  coupon?: string | null;
  shipping?: number | null;
  codFee?: number | null;
  total?: number | null;
  payment?: { method?: string | null; status?: string | null; ref?: string | null } | null;
  status: string;
  gift?: { wrap?: boolean | null; message?: string | null; fee?: number | null } | null;
  prepaidDiscount?: number | null;
  loyalty?: { redeemedPoints?: number | null; discount?: number | null } | null;
  giftCard?: { code?: string | null; amount?: number | null } | null;
  partialCod?: { paidOnline?: number | null; dueOnDelivery?: number | null } | null;
  createdAt?: Date;
};

const METHOD_LABEL: Record<string, string> = {
  cod: "Cash on delivery",
  cashfree: "UPI / Card / Net banking (Cashfree)",
  razorpay: "UPI / Card / Net banking (Razorpay)",
  stripe: "Card / Apple Pay / Google Pay (Stripe)",
  test: "Test payment",
  giftcard: "Gift card",
};

const load = (number: string) => Order.findOne({ number }).lean<LeanOrder>();

export default async function OrderPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ session_id?: string }> }) {
  const { number: raw } = await params;
  const { session_id } = await searchParams;
  const number = decodeURIComponent(raw).toUpperCase();
  const [session, jar] = await Promise.all([getSession(), cookies()]);

  let order: LeanOrder | null = null;
  if (/^MG\d{6}[A-Z0-9]{4}$/.test(number)) {
    await db();
    order = await load(number);
  }
  const allowed =
    !!order &&
    ((session && (session.uid === order.userId || can(session.role, "orders.view"))) || jar.get(LAST_ORDER_COOKIE)?.value === number);

  if (!order || !allowed) {
    return (
      <div className="co-page pad wrap">
        <div className="empty">
          <Icon name="lock" size={36} />
          <h1 className="h2">Sign in to <i>view this order</i></h1>
          <p>For your privacy, order details are only shown to the account that placed the order, or on the device used to check out.</p>
          <div className="co-empty-cta">
            <Link className="btn" href={`/account/login?next=${encodeURIComponent(`/order/${number}`)}`}>Sign in</Link>
            <Link className="btn ghost" href="/">Continue shopping</Link>
          </div>
        </div>
      </div>
    );
  }

  // Back from Stripe before the webhook arrived: confirm with Stripe directly (fires onOrderPaid once).
  if (session_id && order.payment?.method === "stripe" && order.payment.status !== "paid" && order.payment.ref === session_id) {
    const s = await retrieveStripeSession(session_id);
    if (s && s.payment_status === "paid" && s.metadata?.number === number) {
      await markOrderPaid(number, s.payment_intent || s.id, "Paid with Stripe", { "payment.ref": session_id });
      order = (await load(number)) ?? order;
    }
  }

  // Back from Cashfree (or reloading) before the webhook: ask Cashfree directly. Covers part-COD advances too.
  if (order.payment?.ref === number && order.status === "placed" && (order.payment?.method === "cashfree" || order.payment?.method === "cod")) {
    if (await settleCashfree(number, "return page").catch(() => false)) order = (await load(number)) ?? order;
  }

  const region: Region = isRegion(order.region) ? order.region : "in";
  const f = (n?: number | null) => formatMoney(n ?? 0, region);
  const paid = order.payment?.status === "paid";
  const confirmed = order.status !== "placed" && order.status !== "cancelled";
  const isTest = order.payment?.method === "test" || /^TEST-/.test(order.payment?.ref ?? "");
  const isCod = order.payment?.method === "cod";
  const partCod = isCod && (order.partialCod?.paidOnline ?? 0) > 0;
  const awaitingOnline = !paid && order.status === "placed" && (!isCod || partCod);
  const [a, b] = deliveryWindow(region, order.createdAt ? new Date(order.createdAt) : new Date());
  const firstName = (order.address?.name ?? "").split(/\s+/)[0];
  const ad = order.address ?? {};
  const gc = order.giftCard?.amount ?? 0;
  const pts = order.loyalty?.discount ?? 0;
  const dueAtDoor = paid ? 0 : partCod ? order.partialCod?.dueOnDelivery ?? 0 : isCod ? order.total ?? 0 : 0;
  const isOwner = !!session && session.uid === order.userId;
  const statusText = paid
    ? "Paid"
    : partCod
      ? order.status === "placed"
        ? `Advance of ${f(order.partialCod?.paidOnline)} pending`
        : `Advance paid · ${f(dueAtDoor)} on delivery`
      : isCod
        ? `Pay ${f(order.total)} on delivery`
        : order.payment?.status ?? "Pending";

  return (
    <div className="co-page pad wrap">
      {(paid || confirmed) && (
        <TrackOnMount
          event="purchase"
          onceKey={`purchase-${order.number}`}
          data={{
            transaction_id: order.number,
            currency: region === "uk" ? "GBP" : "INR",
            value: (order.total ?? 0) + gc,
            shipping: order.shipping ?? 0,
            coupon: order.coupon || undefined,
            items: (order.items ?? []).map((it) => ({ item_id: it.slug ?? "", item_name: it.name ?? "", item_variant: it.size ?? undefined, price: (it.unitPrice ?? 0) + (it.optionsPrice ?? 0), quantity: it.qty ?? 1 })),
          }}
        />
      )}
      {(paid || confirmed) && <ClearBag />}

      <header className="co-thanks">
        <span className="co-tick" aria-hidden="true"><Icon name={awaitingOnline ? "lock" : "check"} size={26} /></span>
        <span className="kick">{awaitingOnline ? "Awaiting payment" : "Order confirmed"}</span>
        <h1 className="h1">
          {awaitingOnline ? <>Almost <i className="serif">there</i></> : <>Thank you{firstName ? `, ${firstName}` : ""} <i className="serif">for shopping with us</i></>}
        </h1>
        <p>
          Order <b className="co-num">{order.number}</b>
          {awaitingOnline
            ? " is saved but we haven't received the payment yet. If money left your account, it will be confirmed automatically within a few minutes."
            : ` is ${order.status === "cancelled" ? "cancelled" : "confirmed"}. Updates will be sent to ${order.email}.`}
        </p>
        {!awaitingOnline && dueAtDoor > 0 && order.status !== "cancelled" && (
          <p className="notice">Please keep <b>{f(dueAtDoor)}</b> ready in cash or UPI for the delivery partner.</p>
        )}
        {isTest && <p className="notice">Test payment — no money was taken.</p>}
      </header>

      <div className="co-layout co-conf">
        <div className="co-main">
          {order.status !== "cancelled" && (
            <p className="co-eta"><Icon name="truck" /> <span>Estimated delivery <b>{shortDate(a, region)} – {shortDate(b, region)}</b></span></p>
          )}

          <section className="co-card">
            <h2 className="h3">Items ({order.items.reduce((n, i) => n + (i.qty ?? 0), 0)})</h2>
            <ul className="co-olines">
              {order.items.map((it, i) => {
                const unit = (it.unitPrice ?? 0) + (it.optionsPrice ?? 0);
                const opts = it.options?.blouse
                  ? optionLabels({ blouse: it.options.blouse === "stitched" ? "stitched" : "unstitched", fallPico: !!it.options.fallPico })
                  : [];
                return (
                  <li key={i}>
                    <Link className="mount co-thumb" href={`/p/${it.slug}`}>
                      {it.image && <Image src={it.image} alt="" fill sizes="72px" />}
                    </Link>
                    <div>
                      <Link className="co-name" href={`/p/${it.slug}`}>{it.name}</Link>
                      <small>{[`Size ${it.size}`, `Qty ${it.qty}`, ...opts].join(" · ")}</small>
                    </div>
                    <span className="co-lp">{f(unit * (it.qty ?? 0))}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          {(order.gift?.wrap || order.gift?.message) && (
            <section className="co-card">
              <h2 className="h3"><Icon name="box" size={16} /> Gift</h2>
              {order.gift?.wrap && <p>Gift wrapped, with no prices inside the parcel.</p>}
              {order.gift?.message && <p className="co-giftmsg">“{order.gift.message}”</p>}
            </section>
          )}

          <div className="co-twin">
            <section className="co-card">
              <h2 className="h3">Delivery address</h2>
              <p>
                <b>{ad.name}</b><br />
                {[ad.line1, ad.line2].filter(Boolean).join(", ")}<br />
                {[ad.city, ad.state, ad.postcode].filter(Boolean).join(", ")}<br />
                {REGION_CONFIG[region].country}<br />
                <span className="muted">{ad.phone}</span>
              </p>
            </section>
            <section className="co-card">
              <h2 className="h3">Payment</h2>
              <p>{partCod ? "Part paid online, rest cash on delivery" : METHOD_LABEL[order.payment?.method ?? ""] ?? "—"}</p>
              {gc > 0 && order.payment?.method !== "giftcard" && <p className="muted">Gift card {order.giftCard?.code} used: {f(gc)}</p>}
              <p>
                <span className={`status ${paid || (partCod && order.status !== "placed") ? "paid" : order.status === "cancelled" ? "failed" : "placed"}`}>{statusText}</span>
              </p>
              {isTest && <p className="muted">Test payment — no money was taken.</p>}
            </section>
          </div>
        </div>

        <aside className="co-side">
          <div className="co-sum">
            <h2 className="h3">Order total</h2>
            <dl>
              <div><dt>Items</dt><dd>{f(order.subtotal)}</dd></div>
              {(order.discount ?? 0) > 0 && <div className="save"><dt>Coupon{order.coupon ? ` (${order.coupon})` : ""}</dt><dd>−{f(order.discount)}</dd></div>}
              {(order.prepaidDiscount ?? 0) > 0 && <div className="save"><dt>Online payment discount</dt><dd>−{f(order.prepaidDiscount)}</dd></div>}
              {pts > 0 && <div className="save"><dt>Points used ({(order.loyalty?.redeemedPoints ?? 0).toLocaleString()})</dt><dd>−{f(pts)}</dd></div>}
              <div><dt>Delivery</dt><dd>{(order.shipping ?? 0) > 0 ? f(order.shipping) : <span className="free">Free</span>}</dd></div>
              {(order.gift?.fee ?? 0) > 0 && <div><dt>Gift wrap</dt><dd>{f(order.gift?.fee)}</dd></div>}
              {(order.codFee ?? 0) > 0 && <div><dt>Cash on delivery fee</dt><dd>{f(order.codFee)}</dd></div>}
              {gc > 0 && <div className="save"><dt>Gift card{order.giftCard?.code ? ` (${order.giftCard.code})` : ""}</dt><dd>−{f(gc)}</dd></div>}
              <div className="tot"><dt>{paid ? "Paid" : "Total"}</dt><dd>{f(order.total)}</dd></div>
              {partCod && (
                <>
                  <div className="co-split"><dt>{order.status === "placed" ? "To pay online now" : "Paid online"}</dt><dd>{f(order.partialCod?.paidOnline)}</dd></div>
                  <div className="co-split"><dt>Due on delivery</dt><dd>{f(order.partialCod?.dueOnDelivery)}</dd></div>
                </>
              )}
            </dl>
            <p className="co-tax">{REGION_CONFIG[region].taxNote}</p>
          </div>
          <div className="co-links">
            <Link className="btn block" href="/c/new">Continue shopping</Link>
            <Link className="btn ghost block" href={session ? "/account/orders" : `/account/login?next=${encodeURIComponent("/account/orders")}`}>View my orders</Link>
            {isOwner && confirmed && <Link className="link co-inv" href={`/account/orders/${order.number}/invoice`}>View invoice</Link>}
          </div>
          <p className="co-help muted">Questions about this order? Quote <b>{order.number}</b> on <Link className="link" href="/contact">Help</Link>.</p>
        </aside>
      </div>
    </div>
  );
}
