"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveCoupon,
  toggleCoupon,
  toggleProductActive,
  updateOrderStatus,
  updatePaymentStatus,
  type ActionResult,
  type CouponInput,
} from "@/lib/actions/admin";
import { ORDER_STATUS_LABEL } from "@/lib/admin-labels";

/* ---------- on/off switch used by products and coupons ---------- */
export function ActiveSwitch({ id, active, kind, label }: { id: string; active: boolean; kind: "product" | "coupon"; label: string }) {
  const [on, setOn] = useState(active);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const flip = () => {
    const next = !on;
    setOn(next);
    setErr("");
    start(async () => {
      const res = kind === "product" ? await toggleProductActive(id, next) : await toggleCoupon(id, next);
      if (!res.ok) {
        setOn(!next);
        setErr(res.error);
      } else router.refresh();
    });
  };
  return (
    <span className="sw-wrap">
      <button type="button" role="switch" aria-checked={on} aria-label={`${label}: ${on ? "active" : "inactive"}`} className="sw" disabled={pending} onClick={flip}>
        <span />
      </button>
      {err ? <small className="sw-err" role="alert">{err}</small> : null}
    </span>
  );
}

/* ---------- order status + payment ---------- */
const STATUSES = ["placed", "confirmed", "packed", "shipped", "delivered", "cancelled", "returned"];

export function OrderStatusForm({ orderId, status }: { orderId: string; status: string }) {
  const [value, setValue] = useState(status);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const restocks = (value === "cancelled" || value === "returned") && status !== "cancelled" && status !== "returned";
  return (
    <form
      className="adm-form"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const res = await updateOrderStatus(orderId, value, note);
          setMsg(res);
          if (res.ok) {
            setNote("");
            router.refresh();
          }
        });
      }}
    >
      <div className="field">
        <label htmlFor="st">Status</label>
        <select id="st" value={value} onChange={(e) => setValue(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{ORDER_STATUS_LABEL[s] ?? s}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="note">Note (optional)</label>
        <input id="note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Packed and ready for pickup" />
      </div>
      {restocks ? <p className="notice adm-small">Saving will return every item in this order to stock.</p> : null}
      <button className="btn adm-btn" disabled={pending}>{pending ? "Saving…" : "Update status"}</button>
      {msg ? <p className={`notice ${msg.ok ? "ok" : "err"}`} role="status">{msg.ok ? msg.message : msg.error}</p> : null}
    </form>
  );
}

export function PaymentButtons({ orderId, status }: { orderId: string; status: string }) {
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (s: "paid" | "refunded") =>
    start(async () => {
      const res = await updatePaymentStatus(orderId, s);
      setMsg(res);
      if (res.ok) router.refresh();
    });
  return (
    <div className="adm-pay-actions">
      <div className="adm-row">
        <button type="button" className="btn adm-btn" disabled={pending || status === "paid"} onClick={() => set("paid")}>Mark paid</button>
        <button type="button" className="btn ghost adm-btn" disabled={pending || status === "refunded" || status === "pending"} onClick={() => set("refunded")}>Mark refunded</button>
      </div>
      {msg ? <p className={`notice ${msg.ok ? "ok" : "err"}`} role="status">{msg.ok ? msg.message : msg.error}</p> : null}
    </div>
  );
}

/* ---------- coupon create ---------- */
const emptyCoupon = { code: "", description: "", type: "percent" as "percent" | "flat", value: "", in: true, uk: true, minIn: "0", minUk: "0", firstOrderOnly: false, expiresAt: "", active: true };

export function CouponForm() {
  const [f, setF] = useState(emptyCoupon);
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = <K extends keyof typeof emptyCoupon>(k: K, v: (typeof emptyCoupon)[K]) => setF((x) => ({ ...x, [k]: v }));
  const fields = msg && !msg.ok ? msg.fields ?? {} : {};

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const input: CouponInput = {
      code: f.code,
      description: f.description,
      type: f.type,
      value: Number(f.value),
      regions: [...(f.in ? ["in" as const] : []), ...(f.uk ? ["uk" as const] : [])],
      minOrder: { in: Number(f.minIn) || 0, uk: Number(f.minUk) || 0 },
      firstOrderOnly: f.firstOrderOnly,
      expiresAt: f.expiresAt,
      active: f.active,
    };
    start(async () => {
      const res = await saveCoupon(input);
      setMsg(res);
      if (res.ok) {
        setF(emptyCoupon);
        router.refresh();
      }
    });
  };

  return (
    <form className="adm-form" onSubmit={submit} noValidate>
      <div className="adm-grid3">
        <div className="field">
          <label htmlFor="c-code">Code</label>
          <input id="c-code" value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase().replace(/\s/g, ""))} placeholder="DIWALI20" aria-invalid={!!fields.code} required />
          {fields.code ? <span className="err">{fields.code}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="c-type">Type</label>
          <select id="c-type" value={f.type} onChange={(e) => set("type", e.target.value as "percent" | "flat")}>
            <option value="percent">Percent off</option>
            <option value="flat">Flat amount off</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="c-val">{f.type === "percent" ? "Value (%)" : "Value (₹ in India, £ in UK)"}</label>
          <input id="c-val" type="number" inputMode="decimal" min={0} step="any" value={f.value} onChange={(e) => set("value", e.target.value)} aria-invalid={!!fields.value} required />
          {fields.value ? <span className="err">{fields.value}</span> : null}
        </div>
      </div>
      <div className="field">
        <label htmlFor="c-desc">Description</label>
        <input id="c-desc" value={f.description} maxLength={160} onChange={(e) => set("description", e.target.value)} placeholder="20% off festive silks above ₹7,999 / £90" />
      </div>
      <fieldset className="adm-fs">
        <legend>Regions and minimum order</legend>
        <div className="adm-grid3">
          <label className="check"><input type="checkbox" checked={f.in} onChange={(e) => set("in", e.target.checked)} /> India</label>
          <div className="field">
            <label htmlFor="c-min-in">Min order ₹</label>
            <input id="c-min-in" type="number" min={0} value={f.minIn} disabled={!f.in} onChange={(e) => set("minIn", e.target.value)} />
          </div>
          <span className="adm-hide-sm" />
          <label className="check"><input type="checkbox" checked={f.uk} onChange={(e) => set("uk", e.target.checked)} /> United Kingdom</label>
          <div className="field">
            <label htmlFor="c-min-uk">Min order £</label>
            <input id="c-min-uk" type="number" min={0} step="any" value={f.minUk} disabled={!f.uk} onChange={(e) => set("minUk", e.target.value)} />
          </div>
        </div>
        {fields.regions ? <p className="adm-err">{fields.regions}</p> : null}
      </fieldset>
      <div className="adm-grid3">
        <div className="field">
          <label htmlFor="c-exp">Expires on (optional)</label>
          <input id="c-exp" type="date" value={f.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} />
        </div>
        <label className="check adm-check-pad"><input type="checkbox" checked={f.firstOrderOnly} onChange={(e) => set("firstOrderOnly", e.target.checked)} /> First order only</label>
        <label className="check adm-check-pad"><input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Active</label>
      </div>
      <div className="adm-row">
        <button className="btn adm-btn" disabled={pending}>{pending ? "Saving…" : "Create coupon"}</button>
      </div>
      {msg ? <p className={`notice ${msg.ok ? "ok" : "err"}`} role="status">{msg.ok ? msg.message : msg.error}</p> : null}
    </form>
  );
}
