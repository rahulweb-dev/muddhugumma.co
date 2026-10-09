"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markOrdersPacked } from "@/lib/actions/shipping";

export type PackingRow = {
  id: string;
  number: string;
  status: string;
  placed: string;
  ageDays: number;
  customer: string;
  city: string;
  region: "in" | "uk";
  items: { name: string; size: string; qty: number; note: string }[];
  collect: string;
  giftWrap: boolean;
  stitchingWaiting: number;
};

export function PackingQueue({ rows }: { rows: PackingRow[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const packable = rows.filter((r) => r.status === "confirmed");
  const allPicked = packable.length > 0 && packable.every((r) => picked.has(r.id));

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const pack = (ids: string[]) =>
    start(async () => {
      setMsg(null);
      const res = await markOrdersPacked(ids);
      setMsg({ ok: res.ok, text: res.ok ? res.message : res.error });
      if (res.ok) {
        setPicked(new Set());
        router.refresh();
      }
    });

  return (
    <div className="adm-stack">
      <div className="adm-savebar adm-savebar-top">
        <label className="check">
          <input
            type="checkbox"
            checked={allPicked}
            disabled={!packable.length}
            onChange={() => setPicked(allPicked ? new Set() : new Set(packable.map((r) => r.id)))}
          />
          Select all to pack ({packable.length})
        </label>
        <div className="adm-row">
          {msg ? <span className={`adm-small ${msg.ok ? "text-ok" : "text-sale"}`} role="status">{msg.text}</span> : null}
          <button type="button" className="btn adm-btn" disabled={pending || !picked.size} onClick={() => pack([...picked])}>
            {pending ? "Saving…" : `Mark packed${picked.size ? ` (${picked.size})` : ""}`}
          </button>
        </div>
      </div>

      <div className="table-wrap adm-card flush">
        <table className="t adm-t">
          <thead>
            <tr>
              <th aria-label="Select" />
              <th>Order</th>
              <th>Waiting</th>
              <th>Ship to</th>
              <th>Pieces</th>
              <th>Collect</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-ink"
                    aria-label={`Select ${r.number}`}
                    checked={picked.has(r.id)}
                    disabled={r.status !== "confirmed"}
                    onChange={() => toggle(r.id)}
                  />
                </td>
                <td>
                  <Link className="adm-a" href={`/admin/orders/${r.id}`}>{r.number}</Link>
                  <br />
                  <small className="muted">{r.placed}</small>
                </td>
                <td className={`nowrap ${r.ageDays >= 2 ? "adm-low" : ""}`}>{r.ageDays === 0 ? "Today" : `${r.ageDays} day${r.ageDays === 1 ? "" : "s"}`}</td>
                <td>
                  {r.customer}
                  <br />
                  <small className="muted">{r.city} · {r.region === "uk" ? "UK" : "India"}</small>
                </td>
                <td className="adm-small">
                  {r.items.map((it, i) => (
                    <div key={i}>
                      {it.qty} × {it.name} <b>({it.size})</b>
                      {it.note ? <span className="muted"> · {it.note}</span> : null}
                    </div>
                  ))}
                  {r.giftWrap ? <div className="text-bronze font-bold">Gift wrap</div> : null}
                  {r.stitchingWaiting ? <div className="adm-low">{r.stitchingWaiting} piece{r.stitchingWaiting === 1 ? "" : "s"} still in stitching</div> : null}
                </td>
                <td className="nowrap">{r.collect ? <b className="text-sale">{r.collect}</b> : <span className="muted">Prepaid</span>}</td>
                <td><span className={`status ${r.status}`}>{r.status}</span></td>
                <td>
                  <div className="adm-row flex-nowrap">
                    <Link className="btn ghost adm-btn" href={`/admin/orders/${r.id}/slip?print=1`} target="_blank">Print packing slip</Link>
                    {r.status === "confirmed" ? (
                      <button type="button" className="adm-more" disabled={pending} onClick={() => pack([r.id])}>Mark packed</button>
                    ) : (
                      <Link className="adm-more" href={`/admin/orders/${r.id}#shipment`}>Ship</Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
