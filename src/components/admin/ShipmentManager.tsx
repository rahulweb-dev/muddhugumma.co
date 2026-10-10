"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTrackingEventAction, bookWithShiprocket, removeTrackingEventAction, saveShipmentAction } from "@/lib/actions/shipping";
import { COURIERS, TRACKING_EVENTS, courierById, fmtTrackTime, type ShipmentView, type TrackingCode } from "@/lib/shipping";
import type { Region } from "@/lib/region";

type Msg = { ok: boolean; text: string } | null;
const toLocalInput = (iso: string) => (iso ? new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).slice(0, 16).replace(" ", "T") : "");

export function ShipmentManager({ orderId, region, status, shipment, shiprocket = false }: { orderId: string; region: Region; status: string; shipment: ShipmentView | null; shiprocket?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(!shipment);
  const [msg, setMsg] = useState<Msg>(null);
  const [label, setLabel] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const closed = status === "cancelled" || status === "returned";

  const regionCouriers = COURIERS.filter((c) => c.regions.includes(region) && c.id !== "other");
  const otherCouriers = COURIERS.filter((c) => !c.regions.includes(region) && c.id !== "other");

  const [form, setForm] = useState({
    courier: shipment?.courier ?? (region === "uk" ? "dhl" : "delhivery"),
    awb: shipment?.awb ?? "",
    trackingUrl: shipment && shipment.trackingUrl !== courierById(shipment.courier)?.url(shipment.awb) ? shipment.trackingUrl : "",
    shippedAt: toLocalInput(shipment?.shippedAt ?? ""),
    expectedBy: shipment?.expectedBy ? toLocalInput(shipment.expectedBy).slice(0, 10) : "",
  });
  const [ev, setEv] = useState<{ code: TrackingCode; location: string; at: string; note: string }>({ code: "in_transit", location: "", at: "", note: "" });
  const autoLink = form.awb ? courierById(form.courier)?.url(form.awb.trim().toUpperCase()) : "";

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string; fields?: Record<string, string> }>, after?: () => void) =>
    start(async () => {
      setMsg(null);
      const res = await fn();
      setFields(("fields" in res && res.fields) || {});
      setMsg({ ok: res.ok, text: (res.ok ? res.message : res.error) ?? "" });
      if (res.ok) {
        after?.();
        router.refresh();
      }
    });

  if (closed && !shipment) return <p className="muted adm-small">This order is {status}, so it can&apos;t be shipped.</p>;

  const canBook = shiprocket && !shipment && region === "in" && (status === "confirmed" || status === "packed");
  const book = () =>
    start(async () => {
      const res = await bookWithShiprocket(orderId);
      setMsg({ ok: res.ok, text: res.ok ? res.message : res.error });
      if (res.ok) {
        if (res.labelUrl) setLabel(res.labelUrl);
        setEditing(false);
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-4">
      {canBook && (
        <div className="ship-book">
          <div>
            <b>Book the courier with Shiprocket</b>
            <small className="muted block">Creates the shipment, gets the tracking number, asks for a pickup and makes the label. Or enter a courier by hand below.</small>
          </div>
          <button type="button" className="btn adm-btn" disabled={pending} onClick={book}>{pending ? "Booking…" : "Book with Shiprocket"}</button>
        </div>
      )}
      {label && <a className="btn ghost adm-btn self-start" href={label} target="_blank" rel="noopener noreferrer">Print shipping label</a>}
      {shipment && !editing && (
        <dl className="adm-dl">
          <div><dt>Courier</dt><dd>{shipment.courierName}</dd></div>
          <div><dt>Tracking no.</dt><dd><code>{shipment.awb}</code></dd></div>
          {shipment.shippedAt && <div><dt>Shipped</dt><dd>{fmtTrackTime(shipment.shippedAt, "in")}</dd></div>}
          {shipment.expectedBy && <div><dt>Expected by</dt><dd>{fmtTrackTime(shipment.expectedBy, "in").split(",").slice(0, 2).join(",")}</dd></div>}
          {shipment.deliveredAt && <div><dt>Delivered</dt><dd>{fmtTrackTime(shipment.deliveredAt, "in")}</dd></div>}
          <div>
            <dt>Customer link</dt>
            <dd>{shipment.trackingUrl ? <a className="adm-a" href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer">Open courier tracking ↗</a> : "—"}</dd>
          </div>
        </dl>
      )}
      {shipment && !editing && (
        <button type="button" className="btn ghost adm-btn self-start" onClick={() => setEditing(true)}>Edit courier details</button>
      )}

      {editing && (
        <form
          className="adm-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveShipmentAction(orderId, form), () => setEditing(false));
          }}
        >
          <div className="field">
            <label htmlFor="sh-courier">Courier</label>
            <select id="sh-courier" value={form.courier} onChange={(e) => setForm({ ...form, courier: e.target.value })}>
              <optgroup label={region === "uk" ? "Ships to the UK" : "India"}>
                {regionCouriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
              <optgroup label="Others">
                {otherCouriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="other">Other courier (paste link)</option>
              </optgroup>
            </select>
          </div>
          <div className="field">
            <label htmlFor="sh-awb">Tracking number (AWB)</label>
            <input id="sh-awb" value={form.awb} onChange={(e) => setForm({ ...form, awb: e.target.value })} placeholder="e.g. 1234567890" autoCapitalize="characters" spellCheck={false} aria-invalid={fields.awb ? true : undefined} required />
            {fields.awb && <span className="err">{fields.awb}</span>}
          </div>
          <div className="field">
            <label htmlFor="sh-url">Tracking link (optional)</label>
            <input id="sh-url" type="url" value={form.trackingUrl} onChange={(e) => setForm({ ...form, trackingUrl: e.target.value })} placeholder={autoLink || "https://…"} aria-invalid={fields.trackingUrl ? true : undefined} />
            {fields.trackingUrl ? <span className="err">{fields.trackingUrl}</span> : <small className="muted adm-small">{autoLink ? "Leave empty to use the courier's own tracking page." : "This courier has no direct link: paste one so customers can follow it."}</small>}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="sh-at">Shipped on</label>
              <input id="sh-at" type="datetime-local" value={form.shippedAt} onChange={(e) => setForm({ ...form, shippedAt: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="sh-exp">Expected delivery</label>
              <input id="sh-exp" type="date" value={form.expectedBy} onChange={(e) => setForm({ ...form, expectedBy: e.target.value })} />
            </div>
          </div>
          <small className="muted adm-small">Empty dates mean now and the usual {region === "uk" ? "5–7" : "4–6"} working days. Times are IST.</small>
          <div className="flex flex-wrap gap-2">
            <button className="btn adm-btn" disabled={pending}>{pending ? "Saving…" : shipment ? "Save tracking details" : "Mark as shipped"}</button>
            {shipment && <button type="button" className="btn ghost adm-btn" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        </form>
      )}

      {shipment && (
        <>
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <h3 className="h3">Tracking updates</h3>
            {shipment.events.length ? (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {shipment.events.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 border-b border-line pb-2 text-sm">
                    <div className="flex min-w-0 flex-col">
                      <b>{e.label}{e.location ? ` · ${e.location}` : ""}</b>
                      <small className="muted">{fmtTrackTime(e.at, "in")} IST{e.source === "shiprocket" ? " · Shiprocket" : ""}</small>
                      {e.note && <small className="muted">{e.note}</small>}
                    </div>
                    {e.id && (
                      <button type="button" className="adm-icon-btn shrink-0" aria-label={`Remove ${e.label} update`} title="Remove" disabled={pending} onClick={() => run(() => removeTrackingEventAction(orderId, e.id))}>
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted adm-small m-0">No updates yet.</p>
            )}
          </div>

          <form
            className="adm-form border-t border-line pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => addTrackingEventAction(orderId, ev), () => setEv({ code: "in_transit", location: "", at: "", note: "" }));
            }}
          >
            <h3 className="h3">Add tracking update</h3>
            <div className="field">
              <label htmlFor="ev-code">Status</label>
              <select id="ev-code" value={ev.code} onChange={(e) => setEv({ ...ev, code: e.target.value as TrackingCode })}>
                {TRACKING_EVENTS.filter((t) => t.code !== "shipped").map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="field">
                <label htmlFor="ev-loc">Location</label>
                <input id="ev-loc" value={ev.location} maxLength={80} onChange={(e) => setEv({ ...ev, location: e.target.value })} placeholder={region === "uk" ? "e.g. London Heathrow hub" : "e.g. Mumbai hub"} />
              </div>
              <div className="field">
                <label htmlFor="ev-at">When (IST)</label>
                <input id="ev-at" type="datetime-local" value={ev.at} onChange={(e) => setEv({ ...ev, at: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="ev-note">Note for the customer (optional)</label>
              <input id="ev-note" value={ev.note} maxLength={240} onChange={(e) => setEv({ ...ev, note: e.target.value })} placeholder="e.g. Customer not at home, retrying tomorrow" />
            </div>
            {ev.code === "delivered" && <p className="notice adm-small m-0">This also marks the order Delivered.</p>}
            <button className="btn adm-btn self-start" disabled={pending}>{pending ? "Adding…" : "Add update"}</button>
          </form>
        </>
      )}

      {msg && <p className={`notice ${msg.ok ? "ok" : "err"} m-0`} role="status">{msg.text}</p>}
    </div>
  );
}
