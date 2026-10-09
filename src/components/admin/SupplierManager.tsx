"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { deleteSupplier, saveSupplier, type SupplierInput, type SupplierResult } from "@/lib/actions/suppliers";

export type SupplierView = { id: string; name: string; cluster: string; craft: string; contact: string; phone: string; email: string; notes: string; products: number };

const EMPTY: Required<Omit<SupplierInput, "id">> = { name: "", cluster: "", craft: "", contact: "", phone: "", email: "", notes: "" };

function SupplierForm({ initial, onDone }: { initial?: SupplierView; onDone?: () => void }) {
  const router = useRouter();
  const [f, setF] = useState(initial ? { name: initial.name, cluster: initial.cluster, craft: initial.craft, contact: initial.contact, phone: initial.phone, email: initial.email, notes: initial.notes } : EMPTY);
  const [msg, setMsg] = useState<SupplierResult | null>(null);
  const [pending, start] = useTransition();
  const fields = msg && !msg.ok ? msg.fields ?? {} : {};
  const pre = initial ? `e-${initial.id}` : "n";
  const input = (k: keyof typeof EMPTY, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="field">
      <label htmlFor={`${pre}-${k}`}>{label}</label>
      <input id={`${pre}-${k}`} value={f[k]} aria-invalid={!!fields[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} {...extra} />
      {fields[k] ? <span className="err">{fields[k]}</span> : null}
    </div>
  );

  return (
    <form
      className="adm-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const res = await saveSupplier({ ...f, id: initial?.id });
          setMsg(res);
          if (res.ok) {
            if (!initial) setF(EMPTY);
            router.refresh();
            onDone?.();
          }
        });
      }}
    >
      <div className="adm-grid3">
        {input("name", "Name", { required: true, placeholder: "Ramesh Handlooms" })}
        {input("cluster", "Weaving cluster", { placeholder: "Kanchipuram, Tamil Nadu" })}
        {input("craft", "Craft", { placeholder: "Pure silk korvai" })}
        {input("contact", "Contact person")}
        {input("phone", "Phone", { type: "tel", inputMode: "tel" })}
        {input("email", "Email", { type: "email" })}
      </div>
      <div className="field">
        <label htmlFor={`${pre}-notes`}>Notes</label>
        <textarea id={`${pre}-notes`} rows={2} value={f.notes} maxLength={1000} onChange={(e) => setF((x) => ({ ...x, notes: e.target.value }))} placeholder="Lead times, minimum order, payment terms" />
      </div>
      <div className="adm-row">
        <button className="btn adm-btn" disabled={pending}>{pending ? "Saving…" : initial ? "Save supplier" : "Add supplier"}</button>
        {onDone ? <button type="button" className="btn ghost adm-btn" onClick={onDone}>Cancel</button> : null}
      </div>
      {msg ? <p className={`notice ${msg.ok ? "ok" : "err"}`} role="status">{msg.ok ? msg.message : msg.error}</p> : null}
    </form>
  );
}

export function NewSupplierForm() {
  return <SupplierForm />;
}

export function SupplierCard({ s }: { s: SupplierView }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<SupplierResult | null>(null);
  const [pending, start] = useTransition();
  if (editing) return <li className="adm-card"><SupplierForm initial={s} onDone={() => setEditing(false)} /></li>;
  return (
    <li className="adm-card">
      <div className="adm-card-head">
        <div>
          <b className="text-[15px]">{s.name}</b>
          <div className="muted adm-small">{[s.cluster, s.craft].filter(Boolean).join(" · ") || "No cluster or craft yet"}</div>
        </div>
        <div className="adm-row">
          <span className="chip">{s.products} product{s.products === 1 ? "" : "s"}</span>
          <button type="button" className="adm-icon-btn" aria-label={`Edit ${s.name}`} onClick={() => setEditing(true)}><Icon name="edit" size={16} /></button>
          <button type="button" className="adm-icon-btn danger" aria-label={`Delete ${s.name}`} onClick={() => setConfirm(true)}><Icon name="trash" size={16} /></button>
        </div>
      </div>
      <dl className="adm-dl">
        {s.contact ? <div><dt>Contact</dt><dd>{s.contact}</dd></div> : null}
        {s.phone ? <div><dt>Phone</dt><dd><a className="adm-a" href={`tel:${s.phone.replace(/\s/g, "")}`}>{s.phone}</a></dd></div> : null}
        {s.email ? <div><dt>Email</dt><dd><a className="adm-a" href={`mailto:${s.email}`}>{s.email}</a></dd></div> : null}
      </dl>
      {s.notes ? <p className="adm-small whitespace-pre-line m-0">{s.notes}</p> : null}
      {confirm ? (
        <div className="adm-row" role="group" aria-label="Confirm delete">
          <span className="adm-small">Delete {s.name}?</span>
          <button
            type="button"
            className="btn adm-btn adm-btn-danger"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await deleteSupplier(s.id);
                setMsg(res);
                setConfirm(false);
                if (res.ok) router.refresh();
              })
            }
          >
            {pending ? "Deleting…" : "Yes, delete"}
          </button>
          <button type="button" className="btn ghost adm-btn" onClick={() => setConfirm(false)}>Keep</button>
        </div>
      ) : null}
      {msg && !msg.ok ? <p className="notice err" role="alert">{msg.error}</p> : null}
    </li>
  );
}
