import { Icon } from "@/components/Icon";
import type { Region } from "@/lib/region";
import { fmtTrackDay, fmtTrackTime, type ShipmentView } from "@/lib/shipping";
import { CopyText } from "./CopyText";

const STAGES = [
  { key: "placed", label: "Ordered" },
  { key: "shipped", label: "Shipped" },
  { key: "in_transit", label: "In transit" },
  { key: "out_for_delivery", label: "Out for delivery" },
  { key: "delivered", label: "Delivered" },
];
const MOVING = new Set(["picked_up", "in_transit", "reached_hub", "customs", "delivery_attempted", "exception"]);

function stageIndex(status: string, s: ShipmentView | null) {
  const codes = new Set(s?.events.map((e) => e.code));
  if (status === "delivered" || codes.has("delivered")) return 4;
  if (codes.has("out_for_delivery")) return 3;
  if ([...codes].some((c) => MOVING.has(c))) return 2;
  if (s || status === "shipped") return 1;
  return 0;
}

/**
 * Customer-facing shipment tracker: courier + tracking number, a five-step progress bar and every courier scan.
 * Used on My orders and on the guest /track page.
 */
export function ShipmentTracker({ status, region, shipment, placedAt }: { status: string; region: Region; shipment: ShipmentView | null; placedAt: string }) {
  const ended = status === "cancelled" || status === "returned";
  const idx = stageIndex(status, shipment);
  const latest = shipment?.events[0];
  const problem = latest && ["exception", "rto", "rto_delivered", "delivery_attempted"].includes(latest.code) ? latest : null;
  const delivered = idx === 4;

  return (
    <div className="flex flex-col gap-5">
      {/* headline */}
      <div className="flex flex-col gap-1">
        <span className="kick">{ended ? "Order closed" : delivered ? "Delivered" : shipment ? "On its way" : "Preparing your order"}</span>
        <p className="m-0 font-display text-lg uppercase tracking-[.06em]">
          {ended
            ? `This order was ${status}.`
            : delivered
              ? `Delivered ${fmtTrackDay(shipment?.deliveredAt || latest?.at || "", region)}`
              : shipment?.expectedBy
                ? `Arriving by ${fmtTrackDay(shipment.expectedBy, region)}`
                : "We'll share tracking as soon as it ships"}
        </p>
      </div>

      {/* progress */}
      {!ended && (
        <ol className="grid grid-cols-5 gap-1" aria-label="Delivery progress">
          {STAGES.map((st, i) => (
            <li key={st.key} className="flex flex-col gap-2" aria-current={i === idx ? "step" : undefined}>
              <span className={`h-1 ${i <= idx ? "bg-ink" : "bg-stone-2"} ${i === idx && !delivered ? "relative after:absolute after:-right-1 after:-top-1 after:size-3 after:rounded-full after:bg-bronze after:content-['']" : ""}`} />
              <span className={`text-[10.5px] font-semibold uppercase leading-tight tracking-[.08em] sm:text-[11px] ${i <= idx ? "text-ink" : "text-muted"}`}>{st.label}</span>
            </li>
          ))}
        </ol>
      )}

      {problem && (
        <p className="notice err m-0" role="status">
          <b>{problem.customerLabel}.</b> {problem.note || "We'll update you here. Message us if you need help."}
        </p>
      )}

      {/* courier card */}
      {shipment ? (
        <div className="flex flex-col gap-3 border border-line bg-stone p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <small className="text-[11px] font-bold uppercase tracking-[.14em] text-muted">{shipment.courierName} · Tracking number</small>
            <CopyText value={shipment.awb} label="tracking number" />
            {shipment.shippedAt && <small className="text-muted">Shipped {fmtTrackTime(shipment.shippedAt, region)}</small>}
          </div>
          {shipment.trackingUrl && (
            <a className="btn ghost shrink-0" href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer">
              Track on {shipment.courierName} <Icon name="chevR" size={14} />
            </a>
          )}
        </div>
      ) : (
        !ended && <p className="m-0 text-muted">Ordered {fmtTrackTime(placedAt, region)}. Your courier and tracking number will appear here once the parcel leaves our Hyderabad studio, usually within 1–2 working days.</p>
      )}

      {/* scan history */}
      {shipment && shipment.events.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="h3">Tracking history</h3>
          <ol className="m-0 flex list-none flex-col p-0">
            {shipment.events.map((e, i) => (
              <li key={e.id || i} className="relative grid grid-cols-[18px_1fr] gap-3 pb-4 last:pb-0">
                <span className={`relative z-10 mt-1 size-[11px] rounded-full border-2 ${i === 0 ? "border-bronze bg-bronze" : "border-line bg-paper"}`} aria-hidden="true" />
                {i < shipment.events.length - 1 && <span className="absolute left-[5px] top-4 bottom-0 w-px bg-line" aria-hidden="true" />}
                <div className="flex min-w-0 flex-col">
                  <b className={`text-sm ${i === 0 ? "text-ink" : "text-[#3E3A35]"}`}>{e.customerLabel}</b>
                  <small className="text-muted">
                    {fmtTrackTime(e.at, region)}
                    {e.location ? ` · ${e.location}` : ""}
                  </small>
                  {e.note && <small className="text-muted">{e.note}</small>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
