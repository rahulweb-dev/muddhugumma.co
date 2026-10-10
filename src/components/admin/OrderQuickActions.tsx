"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateOrderStatus } from "@/lib/actions/admin";
import { markOrdersPacked } from "@/lib/actions/shipping";

const STEPS = [
  { key: "placed", label: "Placed" },
  { key: "confirmed", label: "To pack" },
  { key: "packed", label: "Packed" },
  { key: "shipped", label: "On the way" },
  { key: "delivered", label: "Delivered" },
];

/** Where the order is: Placed → To pack → Packed → On the way → Delivered (or a cancelled / returned banner). */
export function OrderProgress({ status }: { status: string }) {
  if (status === "cancelled" || status === "returned") {
    return <p className="notice err ord-ended">This order was {status}. Its items have been put back into stock.</p>;
  }
  const at = STEPS.findIndex((s) => s.key === status);
  return (
    <ol className="ord-steps" aria-label="Order progress">
      {STEPS.map((s, i) => (
        <li key={s.key} className={i < at ? "done" : i === at ? "now" : ""} aria-current={i === at ? "step" : undefined}>
          <span>{i < at ? "✓" : i + 1}</span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

type Props = {
  orderId: string;
  number: string;
  status: string;
  paid: boolean;
  cod: boolean;
  canManage: boolean;
  canShip: boolean;
  phone: string;
  name: string;
  region: "in" | "uk";
};

/** The one obvious next action for this order, plus print and contact shortcuts. */
export function OrderNextStep(p: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const res = await fn();
      setMsg({ ok: res.ok, text: (res.ok ? res.message : res.error) || (res.ok ? "Done." : "Something went wrong.") });
      if (res.ok) router.refresh();
    });

  let title = "";
  let hint = "";
  let action: React.ReactNode = null;
  switch (p.status) {
    case "placed":
      title = p.paid || p.cod ? "Confirm this order" : "Waiting for payment";
      hint = p.paid || p.cod ? "Check the details, then confirm so it moves to packing." : "The customer hasn't paid online yet. It confirms automatically when they do; if you received the money another way, mark it paid below.";
      if (p.canManage && (p.paid || p.cod)) action = <button className="btn adm-btn" disabled={busy} onClick={() => run(() => updateOrderStatus(p.orderId, "confirmed", "Confirmed from the order page"))}>Confirm order</button>;
      break;
    case "confirmed":
      title = "Pack this order";
      hint = "Print the packing slip, pack the pieces, then mark it packed.";
      if (p.canShip) action = <button className="btn adm-btn" disabled={busy} onClick={() => run(() => markOrdersPacked([p.orderId]))}>Mark packed</button>;
      break;
    case "packed":
      title = "Hand it to the courier";
      hint = "Add the courier and tracking number below: the customer gets the tracking link automatically.";
      if (p.canShip) action = <a className="btn adm-btn" href="#shipment">Add tracking</a>;
      break;
    case "shipped":
      title = "On its way";
      hint = "Tracking updates arrive below. Mark it delivered once the courier confirms.";
      if (p.canManage) action = <button className="btn adm-btn" disabled={busy} onClick={() => run(() => updateOrderStatus(p.orderId, "delivered", "Marked delivered from the order page"))}>Mark delivered</button>;
      break;
    case "delivered":
      title = "Delivered";
      hint = "Nothing to do. If the customer asks for a return, it appears under Returns & exchanges.";
      break;
    default:
      title = "Closed";
      hint = "This order is finished.";
  }

  const digits = p.phone.replace(/\D/g, "");
  const wa = digits ? `https://wa.me/${digits.length === 10 ? (p.region === "uk" ? "44" : "91") + digits : digits}?text=${encodeURIComponent(`Hi ${p.name.split(" ")[0] || ""}, this is House of Muddhugumma about your order ${p.number}.`)}` : "";

  return (
    <section className="adm-card ord-next" aria-labelledby="next-h">
      <div>
        <h2 className="h3" id="next-h">Next step: {title}</h2>
        <p className="muted adm-small">{hint}</p>
      </div>
      <div className="adm-row">
        {action}
        {p.canShip && <Link className="btn ghost adm-btn" href={`/admin/orders/${p.orderId}/slip`} target="_blank">Print packing slip</Link>}
        {p.canManage && <Link className="btn ghost adm-btn" href={`/admin/orders/${p.orderId}/invoice`} target="_blank">Print invoice</Link>}
        {wa && <a className="btn ghost adm-btn" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp customer</a>}
        {digits && <a className="btn ghost adm-btn" href={`tel:${p.phone}`}>Call</a>}
      </div>
      {msg && <p className={`notice ${msg.ok ? "ok" : "err"}`} role="status">{msg.text}</p>}
    </section>
  );
}
