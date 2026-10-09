import Image from "next/image";
import Link from "next/link";
import { formatMoney } from "@/lib/region";
import { Icon } from "@/components/Icon";
import { STATUS_LABEL, itemCount, longDate, type AddressView, type OrderView } from "./data";

export function StatusPill({ status }: { status: string }) {
  return <span className={`status ${status}`}>{STATUS_LABEL[status] ?? status}</span>;
}

/** Summary row for an order with thumbnails; the whole card links to the detail page. */
export function OrderCard({ order }: { order: OrderView }) {
  const shown = order.items.slice(0, 4);
  const more = order.items.length - shown.length;
  const n = itemCount(order);
  return (
    <Link className="ac-order" href={`/account/orders/${encodeURIComponent(order.number)}`}>
      <div className="ac-order-top">
        <div>
          <b>Order {order.number}</b>
          <small>
            {longDate(order.createdAt, order.region)} · {n} {n === 1 ? "item" : "items"}
          </small>
          {order.shipment && order.status !== "delivered" && (
            <small className="text-bronze">{order.shipment.courierName} · {order.shipment.awb}</small>
          )}
        </div>
        <StatusPill status={order.status} />
      </div>
      <div className="ac-order-bottom">
        <ul className="ac-thumbs" aria-label="Items">
          {shown.map((it, i) => (
            <li key={`${it.slug}-${i}`} className="mount">
              {it.image ? <Image src={it.image} alt={it.name} fill sizes="64px" /> : null}
            </li>
          ))}
          {more > 0 && <li className="ac-more">+{more}</li>}
        </ul>
        <div className="ac-order-total">
          <small>Total</small>
          <strong>{formatMoney(order.total, order.region)}</strong>
        </div>
        <Icon name="chevR" className="ic ac-chev" />
      </div>
    </Link>
  );
}

export function AddressLines({ a }: { a: Omit<AddressView, "id" | "isDefault"> }) {
  const country = a.region === "uk" ? "United Kingdom" : "India";
  return (
    <address className="ac-addr">
      <b>{a.name}</b>
      <span>{a.line1}</span>
      {a.line2 && <span>{a.line2}</span>}
      <span>
        {a.city}
        {a.state ? `, ${a.state}` : ""} {a.postcode}
      </span>
      <span>{country}</span>
      {a.phone && <span className="muted">Phone {a.phone}</span>}
    </address>
  );
}
