import Image from "next/image";
import Link from "next/link";
import { formatMoney, REGION_CONFIG } from "@/lib/region";
import { courierName } from "@/lib/shipping";
import type { ReturnView } from "@/lib/returns";

const STATUS_CLASS: Record<string, string> = {
  requested: "placed",
  approved: "confirmed",
  pickup_scheduled: "shipped",
  picked_up: "shipped",
  received: "packed",
  refunded: "delivered",
  exchanged: "delivered",
  rejected: "cancelled",
};

const when = (iso: string, rt: ReturnView) =>
  iso ? new Date(iso).toLocaleDateString(REGION_CONFIG[rt.region].locale, { day: "numeric", month: "short", year: "numeric" }) : "";

/** What happens next, in the shopper's words. */
function nextStep(rt: ReturnView): string {
  switch (rt.status) {
    case "requested":
      return "We're reviewing your request. You'll hear from us within one working day.";
    case "approved":
      return rt.region === "in" ? "Approved. We'll message you the pickup date shortly." : "Approved. Your prepaid returns label is on its way by email.";
    case "pickup_scheduled":
      return rt.pickup?.date
        ? `Pickup on ${new Date(rt.pickup.date).toLocaleDateString(REGION_CONFIG[rt.region].locale, { weekday: "long", day: "numeric", month: "long" })}${rt.pickup.courier ? ` with ${courierName(rt.pickup.courier)}` : ""}. Keep the parcel packed with tags on.`
        : "Pickup booked. The courier will call before arriving.";
    case "picked_up":
      return "Picked up. It's on its way back to our studio.";
    case "received":
      return rt.items.every((i) => i.kind === "exchange") ? "Received at our studio. Your new size ships next." : "Received at our studio. Your refund is being processed.";
    case "refunded":
      return `Refunded ${formatMoney(rt.refundAmount, rt.region)} to ${rt.refundMethodLabel.toLowerCase()}.`;
    case "exchanged":
      return "Your new size has been sent.";
    case "rejected":
      return [...rt.history].reverse().find((h) => h.status === "rejected")?.note?.replace(/\s*·?\s*\([^)]*\)\s*$/, "") || "We couldn't approve this request. Reply to our email if you'd like us to look again.";
    default:
      return "";
  }
}

export function ReturnStatusPill({ rt }: { rt: ReturnView }) {
  return <span className={`status ${STATUS_CLASS[rt.status] ?? "placed"}`}>{rt.statusLabel}</span>;
}

export function ReturnCard({ rt, showOrder = true }: { rt: ReturnView; showOrder?: boolean }) {
  return (
    <article className="ac-panel gap-3" aria-labelledby={`rt-${rt.number}`}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <b id={`rt-${rt.number}`} className="font-display text-[13px] font-normal uppercase tracking-[.1em] [overflow-wrap:anywhere]">{rt.number}</b>
          <small className="text-[12.5px] text-muted">
            Requested {when(rt.createdAt, rt)}
            {showOrder && (
              <>
                {" · "}
                <Link className="link" href={`/account/orders/${encodeURIComponent(rt.orderNumber)}`}>Order {rt.orderNumber}</Link>
              </>
            )}
          </small>
        </div>
        <ReturnStatusPill rt={rt} />
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {rt.items.map((i, k) => (
          <li key={`${i.slug}-${k}`} className="flex min-w-0 items-start gap-3">
            <div className="mount relative aspect-[3/4] w-11 flex-none">{i.image ? <Image src={i.image} alt="" fill sizes="44px" /> : null}</div>
            <div className="flex min-w-0 flex-col gap-0.5 text-[13px]">
              <span className="font-semibold [overflow-wrap:anywhere]">{i.name}</span>
              <small className="text-[12.5px] text-muted">
                {i.kind === "exchange" ? `Exchange ${i.size} → ${i.exchangeSize}` : `Return · size ${i.size}`} · Qty {i.qty} · {i.reason}
              </small>
            </div>
          </li>
        ))}
      </ul>
      <p className="m-0 border-t border-line pt-3 text-[13px] text-muted">{nextStep(rt)}</p>
    </article>
  );
}
