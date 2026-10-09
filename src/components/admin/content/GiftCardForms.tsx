"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { issueGiftCardManually, setGiftCardActive, type GiftCardIssueInput } from "@/lib/actions/merch";
import { Msg, fieldErr } from "./ui";
import type { Result } from "./shared";

const empty = { region: "in" as "in" | "uk", amount: "", recipientName: "", recipientEmail: "", message: "", reason: "", notify: true };
const REASONS = ["Goodwill: delayed order", "Goodwill: damaged item", "Influencer / collaboration", "Giveaway winner", "Replacement for a lost card", "Paid offline (bank transfer / in studio)"];

export function IssueGiftCardForm() {
  const router = useRouter();
  const [f, setF] = useState(empty);
  const [res, setRes] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof empty>(k: K, v: (typeof empty)[K]) => setF((x) => ({ ...x, [k]: v }));
  const cur = f.region === "uk" ? "£" : "₹";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setRes(null);
    const input: GiftCardIssueInput = { ...f, amount: Number(f.amount) };
    start(async () => {
      const r = await issueGiftCardManually(input);
      setRes(r);
      if (r.ok) {
        setF(empty);
        router.refresh();
      }
    });
  };

  return (
    <form className="adm-form" onSubmit={submit} noValidate>
      <div className="adm-grid3">
        <div className="field">
          <label htmlFor="gc-region">Region</label>
          <select id="gc-region" value={f.region} onChange={(e) => set("region", e.target.value as "in" | "uk")}>
            <option value="in">India (₹)</option>
            <option value="uk">United Kingdom (£)</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="gc-amt">Amount ({cur})</label>
          <input id="gc-amt" type="number" inputMode="decimal" min={0} step={f.region === "uk" ? "0.01" : "1"} value={f.amount} placeholder={f.region === "uk" ? "50" : "2000"} aria-invalid={!!(res && !res.ok && res.fields?.amount)} onChange={(e) => set("amount", e.target.value)} />
          {fieldErr(res, "amount")}
        </div>
        <div className="field">
          <label htmlFor="gc-reason">Reason (activity log only)</label>
          <input id="gc-reason" list="gc-reasons" value={f.reason} maxLength={200} placeholder="e.g. Goodwill: delayed order MG…" aria-invalid={!!(res && !res.ok && res.fields?.reason)} onChange={(e) => set("reason", e.target.value)} />
          <datalist id="gc-reasons">{REASONS.map((r) => <option key={r} value={r} />)}</datalist>
          {fieldErr(res, "reason")}
        </div>
        <div className="field">
          <label htmlFor="gc-name">Recipient name</label>
          <input id="gc-name" value={f.recipientName} maxLength={80} onChange={(e) => set("recipientName", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="gc-email">Recipient email</label>
          <input id="gc-email" type="email" value={f.recipientEmail} maxLength={120} aria-invalid={!!(res && !res.ok && res.fields?.recipientEmail)} onChange={(e) => set("recipientEmail", e.target.value.trim())} />
          {fieldErr(res, "recipientEmail")}
        </div>
        <label className="check adm-check-pad">
          <input type="checkbox" checked={f.notify} disabled={!f.recipientEmail} onChange={(e) => set("notify", e.target.checked)} /> Email the card to the recipient
        </label>
      </div>
      <div className="field">
        <label htmlFor="gc-msg">Message on the card (optional)</label>
        <textarea id="gc-msg" value={f.message} maxLength={300} rows={2} className="min-h-0!" placeholder="We're sorry your saree arrived late. Here's something towards your next one." onChange={(e) => set("message", e.target.value)} />
      </div>
      <div className="adm-row">
        <button className="btn adm-btn" disabled={pending}>{pending ? "Issuing…" : "Issue gift card"}</button>
        <small className="muted">India ₹100–₹1,00,000 · UK £5–£1,000</small>
      </div>
      <Msg res={res} />
      {res?.ok && res.id ? <Link className="adm-more self-start" href={`/admin/gift-cards/${res.id}`}>Open the new card</Link> : null}
    </form>
  );
}

export function GiftCardStatus({ id, active, code }: { id: string; active: boolean; code: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="adm-form"
      onSubmit={(e) => {
        e.preventDefault();
        setRes(null);
        start(async () => {
          const r = await setGiftCardActive(id, !active, reason);
          setRes(r);
          if (r.ok) {
            setReason("");
            router.refresh();
          }
        });
      }}
    >
      <p className="adm-small m-0">{active ? `${code} can be used at checkout until its balance runs out.` : `${code} is deactivated: checkout will refuse it.`}</p>
      <div className="field">
        <label htmlFor="gc-why">Reason (optional, for the activity log)</label>
        <input id="gc-why" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder={active ? "e.g. Reported stolen by the customer" : "e.g. Customer confirmed ownership"} />
      </div>
      <button className={`btn adm-btn self-start ${active ? "ghost adm-btn-danger-ghost" : ""}`} disabled={pending}>
        {pending ? "Saving…" : active ? "Deactivate card" : "Reactivate card"}
      </button>
      <Msg res={res} />
    </form>
  );
}
