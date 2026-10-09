"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { returnAction, type ReturnActionInput } from "@/lib/actions/service";
import { COURIERS } from "@/lib/shipping";
import { Msg, fieldErr } from "./ui";
import type { Result } from "./shared";

type Status = "requested" | "approved" | "pickup_scheduled" | "picked_up" | "received" | "refunded" | "exchanged" | "rejected";

export function ReturnActions({
  number,
  status,
  region,
  suggestedRefund,
  hasReturns,
  hasExchanges,
  pickup,
  todayIst,
}: {
  number: string;
  status: Status;
  region: "in" | "uk";
  suggestedRefund: number;
  hasReturns: boolean;
  hasExchanges: boolean;
  pickup: { courier: string; awb: string; date: string };
  todayIst: string;
}) {
  const router = useRouter();
  const [res, setRes] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [courier, setCourier] = useState(pickup.courier || (region === "uk" ? "royalmail" : "delhivery"));
  const [awb, setAwb] = useState(pickup.awb);
  const [date, setDate] = useState(pickup.date || todayIst);
  const [amount, setAmount] = useState(String(suggestedRefund || ""));
  const [method, setMethod] = useState<"original" | "store_credit" | "bank">("original");
  const cur = region === "uk" ? "£" : "₹";

  const run = (input: Omit<ReturnActionInput, "number" | "note">) => {
    setRes(null);
    start(async () => {
      const r = await returnAction({ number, note, ...input });
      setRes(r);
      if (r.ok) {
        setNote("");
        router.refresh();
      }
    });
  };

  const closed = status === "refunded" || status === "exchanged" || status === "rejected";
  if (closed) return <p className="muted adm-small">This return is closed. No further actions.</p>;

  const couriers = COURIERS.filter((c) => c.regions.includes(region));
  const canSchedule = status === "approved" || status === "pickup_scheduled";
  const canPickedUp = status === "approved" || status === "pickup_scheduled";
  const canReceive = status === "picked_up" || status === "pickup_scheduled";
  const canSettle = status === "received";

  return (
    <div className="adm-form">
      <div className="field">
        <label htmlFor="rt-note">Note {status === "requested" ? "(required to reject; sent to the customer)" : "(optional; sent to the customer)"}</label>
        <textarea id="rt-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder={status === "requested" ? "e.g. Approved: please keep the tags on for pickup" : "e.g. Pickup tomorrow between 10 am and 6 pm"} aria-invalid={!!(res && !res.ok && res.fields?.note)} />
        {fieldErr(res, "note")}
      </div>

      {status === "requested" && (
        <div className="adm-row">
          <button type="button" className="btn adm-btn" disabled={pending} onClick={() => run({ status: "approved" })}>Approve</button>
          <button type="button" className="btn ghost adm-btn adm-btn-danger-ghost" disabled={pending} onClick={() => run({ status: "rejected" })}>Reject</button>
        </div>
      )}

      {canSchedule && (
        <fieldset className="adm-fs border-t border-line pt-3">
          <legend>{status === "pickup_scheduled" ? "Reschedule pickup" : "Schedule pickup"}</legend>
          <div className="adm-grid3">
            <div className="field">
              <label htmlFor="rt-courier">Courier</label>
              <select id="rt-courier" value={courier} onChange={(e) => setCourier(e.target.value)}>
                {couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="rt-awb">AWB / tracking no.</label>
              <input id="rt-awb" value={awb} maxLength={60} onChange={(e) => setAwb(e.target.value.trim())} placeholder="Optional" />
            </div>
            <div className="field">
              <label htmlFor="rt-date">Pickup date</label>
              <input id="rt-date" type="date" value={date} min={todayIst} onChange={(e) => setDate(e.target.value)} aria-invalid={!!(res && !res.ok && res.fields?.pickupDate)} />
              {fieldErr(res, "pickupDate")}
            </div>
          </div>
          <div className="adm-row">
            <button type="button" className="btn adm-btn" disabled={pending} onClick={() => run({ status: "pickup_scheduled", courier, awb, pickupDate: date })}>
              {status === "pickup_scheduled" ? "Update pickup" : "Schedule pickup"}
            </button>
          </div>
        </fieldset>
      )}

      {(canPickedUp || canReceive) && (
        <div className="adm-row border-t border-line pt-3">
          {canPickedUp && <button type="button" className="btn ghost adm-btn" disabled={pending} onClick={() => run({ status: "picked_up" })}>Mark picked up</button>}
          {canReceive && <button type="button" className="btn adm-btn" disabled={pending} onClick={() => run({ status: "received" })}>Mark received at studio</button>}
        </div>
      )}
      {canReceive && <p className="muted adm-small m-0">Marking received puts the items back into stock.</p>}

      {status === "approved" && (
        <div className="adm-row">
          <button type="button" className="adm-more" disabled={pending} onClick={() => run({ status: "rejected" })}>Reject instead</button>
        </div>
      )}

      {canSettle && hasReturns && (
        <fieldset className="adm-fs border-t border-line pt-3">
          <legend>Refund</legend>
          <div className="adm-grid3">
            <div className="field">
              <label htmlFor="rt-amt">Amount ({cur})</label>
              <input id="rt-amt" type="number" inputMode="decimal" min={0} step={region === "uk" ? "0.01" : "1"} value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!(res && !res.ok && res.fields?.refundAmount)} />
              {fieldErr(res, "refundAmount")}
            </div>
            <div className="field">
              <label htmlFor="rt-method">Refund to</label>
              <select id="rt-method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                <option value="original">Original payment method</option>
                <option value="store_credit">Store credit (gift card)</option>
                <option value="bank">Bank transfer (COD orders)</option>
              </select>
            </div>
          </div>
          <p className="muted adm-small m-0">Pre-filled from the returned items at the price paid. Store credit issues a gift card to the customer.</p>
          <div className="adm-row">
            <button type="button" className="btn adm-btn" disabled={pending} onClick={() => run({ status: "refunded", refundAmount: Number(amount), refundMethod: method })}>Mark refunded</button>
          </div>
        </fieldset>
      )}

      {canSettle && hasExchanges && (
        <div className="adm-row border-t border-line pt-3">
          <button type="button" className={`btn adm-btn ${hasReturns ? "ghost" : ""}`} disabled={pending} onClick={() => run({ status: "exchanged" })}>Mark exchanged (replacement sent)</button>
        </div>
      )}

      {pending ? <p className="muted adm-small m-0">Saving…</p> : null}
      <Msg res={res} />
    </div>
  );
}
