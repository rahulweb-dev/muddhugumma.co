"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveStitchDetails, setStitchStatus, type StitchResult } from "@/lib/actions/stitching";
import { MEASUREMENT_FIELDS, STITCH_LABEL, STITCH_STATUSES, nextStitchStatus, type MeasurementKey, type StitchStatusKey } from "./constants";

export type StitchCard = {
  key: string; // orderId-index
  orderId: string;
  index: number;
  slug: string;
  orderNumber: string;
  orderStatus: string;
  customer: string;
  placed: string;
  name: string;
  size: string;
  qty: number;
  reason: string;
  status: StitchStatusKey;
  measurements: Partial<Record<MeasurementKey, string>>;
  saved: Partial<Record<string, string>>; // the customer's own profile measurements, if any
  tailor: string;
  notes: string;
  updated: string;
};

export function StitchingBoard({ cards, tailors }: { cards: StitchCard[]; tailors: string[] }) {
  return (
    <div className="adm-board" role="list" aria-label="Stitching board">
      {STITCH_STATUSES.map((s) => {
        const list = cards.filter((c) => c.status === s);
        return (
          <section key={s} className="adm-board-col" role="listitem" aria-label={STITCH_LABEL[s]}>
            <header>
              <h2 className="h3">{STITCH_LABEL[s]}</h2>
              <span className="chip">{list.length}</span>
            </header>
            {list.length ? list.map((c) => <Card key={c.key} c={c} />) : <p className="muted adm-small">Nothing here.</p>}
          </section>
        );
      })}
      <datalist id="tailors">{tailors.map((t) => <option key={t} value={t} />)}</datalist>
    </div>
  );
}

function Card({ c }: { c: StitchCard }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<StitchResult | null>(null);
  const [pending, start] = useTransition();
  const next = nextStitchStatus(c.status);
  const ref = { orderId: c.orderId, index: c.index, slug: c.slug };
  const filled = MEASUREMENT_FIELDS.filter((f) => c.measurements[f.key]).length;

  const move = (to: StitchStatusKey) =>
    start(async () => {
      setMsg(null);
      const res = await setStitchStatus(ref, to);
      setMsg(res);
      if (res.ok) router.refresh();
    });

  return (
    <article className="adm-board-card" id={c.key}>
      <div className="flex justify-between gap-2 items-baseline">
        <Link className="adm-a" href={`/admin/orders/${c.orderId}`}>{c.orderNumber}</Link>
        <span className={`status ${c.orderStatus}`}>{c.orderStatus}</span>
      </div>
      <b className="leading-snug">{c.name}</b>
      <small className="muted">
        Size {c.size} · Qty {c.qty} · {c.reason}
        <br />
        {c.customer} · {c.placed}
      </small>
      <small>
        {filled ? `${filled}/8 measurements` : <span className="text-sale">No measurements yet</span>}
        {c.tailor ? ` · ${c.tailor}` : ""}
      </small>
      {c.notes ? <small className="whitespace-pre-line">“{c.notes}”</small> : null}
      <div className="adm-row">
        {next ? (
          <button type="button" className="btn adm-btn" disabled={pending} onClick={() => move(next)}>
            {pending ? "Moving…" : `→ ${STITCH_LABEL[next]}`}
          </button>
        ) : (
          <span className="text-ok font-bold adm-small">Ready to pack</span>
        )}
        <button type="button" className="adm-more" onClick={() => setOpen((x) => !x)} aria-expanded={open}>{open ? "Close" : "Details"}</button>
      </div>
      {msg ? <p className={`notice ${msg.ok ? "ok" : "err"}`} role="status">{msg.ok ? msg.message : msg.error}</p> : null}
      {open ? <Details c={c} onSaved={() => router.refresh()} onMove={move} pending={pending} /> : null}
    </article>
  );
}

function Details({ c, onSaved, onMove, pending }: { c: StitchCard; onSaved: () => void; onMove: (s: StitchStatusKey) => void; pending: boolean }) {
  const [m, setM] = useState<Record<MeasurementKey, string>>(() => Object.fromEntries(MEASUREMENT_FIELDS.map((f) => [f.key, c.measurements[f.key] ?? ""])) as Record<MeasurementKey, string>);
  const [tailor, setTailor] = useState(c.tailor);
  const [notes, setNotes] = useState(c.notes);
  const [msg, setMsg] = useState<StitchResult | null>(null);
  const [saving, start] = useTransition();
  const fields = msg && !msg.ok ? msg.fields ?? {} : {};
  const hasSaved = Object.values(c.saved).some(Boolean);

  return (
    <form
      className="adm-form border-t border-line pt-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const res = await saveStitchDetails({ orderId: c.orderId, index: c.index, slug: c.slug }, { measurements: m, tailor, notes });
          setMsg(res);
          if (res.ok) onSaved();
        });
      }}
    >
      {hasSaved ? (
        <p className="muted adm-small">
          Customer profile: {Object.entries(c.saved).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(" · ")}
        </p>
      ) : null}
      <fieldset className="adm-fs">
        <legend>Measurements (inches)</legend>
        <div className="grid grid-cols-2 gap-2">
          {MEASUREMENT_FIELDS.map((f) => (
            <div key={f.key} className="field">
              <label htmlFor={`${c.key}-${f.key}`}>{f.label}</label>
              <input
                id={`${c.key}-${f.key}`}
                inputMode="decimal"
                value={m[f.key]}
                aria-invalid={!!fields[f.key]}
                onChange={(e) => setM((x) => ({ ...x, [f.key]: e.target.value }))}
              />
              {fields[f.key] ? <span className="err">{fields[f.key]}</span> : null}
            </div>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor={`${c.key}-tailor`}>Tailor</label>
        <input id={`${c.key}-tailor`} list="tailors" value={tailor} maxLength={80} onChange={(e) => setTailor(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`${c.key}-notes`}>Notes</label>
        <textarea id={`${c.key}-notes`} rows={2} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder="Sleeve style, lining, hooks or zip" />
      </div>
      <div className="adm-row">
        <button className="btn adm-btn" disabled={saving}>{saving ? "Saving…" : "Save details"}</button>
        <select
          className="adm-select"
          aria-label="Move to stage"
          value={c.status}
          disabled={pending}
          onChange={(e) => onMove(e.target.value as StitchStatusKey)}
        >
          {STITCH_STATUSES.map((s) => <option key={s} value={s}>{STITCH_LABEL[s]}</option>)}
        </select>
      </div>
      {msg ? <p className={`notice ${msg.ok ? "ok" : "err"}`} role="status">{msg.ok ? msg.message : msg.error}</p> : null}
      {c.updated ? <small className="muted">Last updated {c.updated}</small> : null}
    </form>
  );
}
