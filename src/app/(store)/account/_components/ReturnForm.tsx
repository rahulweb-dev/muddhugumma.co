"use client";
import Image from "next/image";
import { useActionState, useState } from "react";
import { submitReturn } from "@/lib/actions/returns";
import type { ActionState } from "@/lib/actions/auth";
import { formatMoney, type Region } from "@/lib/region";
import { FormNotice } from "./Field";

export type ReturnLineProps = {
  index: number;
  slug: string;
  name: string;
  image: string;
  size: string;
  qty: number;
  unitPrice: number;
  available: number;
  blocked: string;
  exchangeSizes: string[];
};

type Choice = { picked: boolean; kind: "return" | "exchange"; qty?: string; reason?: string; size?: string };

export function ReturnForm({ orderNumber, region, lines, reasons, isCod }: { orderNumber: string; region: Region; lines: ReturnLineProps[]; reasons: string[]; isCod: boolean }) {
  const [state, action, pending] = useActionState(submitReturn.bind(null, orderNumber), { ok: false } as ActionState);
  const [choice, setChoice] = useState<Record<number, Choice>>({});
  const [method, setMethod] = useState(isCod ? "bank" : "original");
  const [comments, setComments] = useState("");
  const set = (i: number, patch: Partial<Choice>) => setChoice((c) => ({ ...c, [i]: { ...(c[i] ?? { picked: false, kind: "return" }), ...patch } }));
  const picked = Object.values(choice).filter((c) => c.picked);
  const needsRefund = picked.some((c) => c.kind === "return");
  const methods = isCod
    ? [
        { v: "bank", t: "Bank transfer", d: "We'll email you to collect your account details. Arrives 2–3 working days after the return reaches us." },
        { v: "store_credit", t: "Store credit", d: "A Muddhugumma gift card for the full amount, emailed as soon as the return reaches us." },
      ]
    : [
        { v: "original", t: "Original payment method", d: "Back to the card, UPI or account you paid with, within 5–7 working days of the return reaching us." },
        { v: "store_credit", t: "Store credit", d: "A Muddhugumma gift card for the full amount, emailed as soon as the return reaches us." },
      ];

  return (
    <form action={action} className="ac-form" noValidate>
      <FormNotice state={state} />

      <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
        <legend className="mb-2 text-[11px] font-bold uppercase tracking-[.14em] text-muted">Choose items</legend>
        {lines.map((l) => {
          const c = choice[l.index] ?? { picked: false, kind: "return" };
          const disabled = !!l.blocked || l.available < 1;
          const err = state?.errors?.[`line-${l.index}`];
          return (
            <div key={l.index} className={`ac-panel gap-3 ${c.picked ? "border-ink" : ""} ${disabled ? "opacity-70" : ""}`}>
              <div className="flex min-w-0 items-start gap-3">
                <div className="mount relative aspect-[3/4] w-14 flex-none">{l.image ? <Image src={l.image} alt="" fill sizes="56px" /> : null}</div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <b className="text-[13.5px] font-semibold [overflow-wrap:anywhere]">{l.name}</b>
                  <small className="text-[12.5px] text-muted">
                    Size {l.size} · Qty {l.qty} · {formatMoney(l.unitPrice, region)} each
                  </small>
                  {disabled ? (
                    <small className="text-[12.5px] text-sale">{l.blocked || "A return is already open for this item."}</small>
                  ) : (
                    <label className="check mt-1">
                      <input type="checkbox" name={`pick-${l.index}`} checked={c.picked} onChange={(e) => set(l.index, { picked: e.target.checked })} />
                      Return or exchange this item
                    </label>
                  )}
                </div>
              </div>

              {c.picked && !disabled && (
                <div className="form-grid two">
                  <fieldset className="ac-seg full">
                    <legend>What would you like?</legend>
                    <label className={c.kind === "return" ? "on" : ""}>
                      <input type="radio" name={`kind-${l.index}`} value="return" checked={c.kind === "return"} onChange={() => set(l.index, { kind: "return" })} />
                      Refund
                    </label>
                    <label className={c.kind === "exchange" ? "on" : ""} aria-disabled={!l.exchangeSizes.length}>
                      <input type="radio" name={`kind-${l.index}`} value="exchange" disabled={!l.exchangeSizes.length} checked={c.kind === "exchange"} onChange={() => set(l.index, { kind: "exchange" })} />
                      Exchange size
                    </label>
                  </fieldset>
                  {!l.exchangeSizes.length && (
                    <p className="full m-0 text-[12.5px] text-muted">
                      {l.size === "Free size" ? "This is free size, so it can be returned for a refund but not exchanged." : "No other size is in stock right now, so this can be returned for a refund."}
                    </p>
                  )}
                  {c.kind === "exchange" && l.exchangeSizes.length > 0 && (
                    <div className="field">
                      <label htmlFor={`size-${l.index}`}>New size</label>
                      <select id={`size-${l.index}`} name={`size-${l.index}`} required value={c.size ?? ""} onChange={(e) => set(l.index, { size: e.target.value })}>
                        <option value="" disabled>Choose a size</option>
                        {l.exchangeSizes.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="field">
                    <label htmlFor={`qty-${l.index}`}>Quantity</label>
                    <select id={`qty-${l.index}`} name={`qty-${l.index}`} value={c.qty ?? String(l.available)} onChange={(e) => set(l.index, { qty: e.target.value })}>
                      {Array.from({ length: l.available }, (_, k) => k + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="field full">
                    <label htmlFor={`reason-${l.index}`}>Reason</label>
                    <select id={`reason-${l.index}`} name={`reason-${l.index}`} required value={c.reason ?? ""} onChange={(e) => set(l.index, { reason: e.target.value })} aria-invalid={err ? true : undefined}>
                      <option value="" disabled>Choose a reason</option>
                      {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    {err && <span className="err">{err}</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </fieldset>

      {needsRefund && (
        <fieldset className="m-0 flex min-w-0 flex-col gap-2.5 border-0 p-0">
          <legend className="mb-2 text-[11px] font-bold uppercase tracking-[.14em] text-muted">How would you like your refund?</legend>
          {methods.map((m) => (
            <label key={m.v} className="flex cursor-pointer items-start gap-3 border border-line bg-paper p-3.5 has-[:checked]:border-ink">
              <input type="radio" name="refundMethod" value={m.v} checked={method === m.v} onChange={() => setMethod(m.v)} className="mt-1 accent-ink" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <b className="text-[13.5px]">{m.t}</b>
                <small className="text-[12.5px] text-muted">{m.d}</small>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="field">
        <label htmlFor="f-comments">Anything we should know? (optional)</label>
        <textarea id="f-comments" name="comments" maxLength={600} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="For example: the blouse runs small at the shoulders, or a pickup time that suits you." />
      </div>

      <p className="ac-fine">
        {region === "in" ? "We'll arrange a free pickup from your delivery address once the request is approved." : "We'll email you a prepaid UK returns label once the request is approved."} Please keep the pieces unworn, with tags and the original packaging.
      </p>

      <div>
        <button className="btn" disabled={pending || picked.length === 0} aria-busy={pending}>
          {pending ? "Sending…" : picked.length ? `Request ${picked.every((c) => c.kind === "exchange") ? "exchange" : "return"}` : "Choose an item"}
        </button>
      </div>
    </form>
  );
}
