"use client";
import { Fragment, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveStockChanges, transferStock, type StockChange } from "@/lib/actions/stock";
import type { Region } from "@/lib/region";

export type StockRow = {
  id: string;
  name: string;
  slug: string;
  image: string;
  freeSize: boolean;
  active: boolean;
  stock: Partial<Record<Region, Record<string, number>>>;
  /** Soonest size to sell out at the recent pace (null: no sales in 30 days), and pieces to add to cover 30 days. */
  forecast?: Partial<Record<Region, { days: number; size: string; restock: number } | null>>;
};

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;
const UK_SIZE: Record<string, string> = { XS: "6", S: "8", M: "10", L: "12", XL: "14", XXL: "16" };
const FLAG: Record<Region, string> = { in: "🇮🇳", uk: "🇬🇧" };
const NAME: Record<Region, string> = { in: "India", uk: "UK" };
const REASONS = [
  { value: "restock", label: "New stock arrived" },
  { value: "sold_offline", label: "Sold in shop / offline" },
  { value: "damaged", label: "Damaged or lost" },
  { value: "correction", label: "Count correction" },
];

const key = (id: string, r: Region, size: string) => `${id}|${r}|${size}`;

/** Editable stock grid: one row per product per store. Edit any count, then save with a reason. */
export function StockTable({ rows, regions, threshold }: { rows: StockRow[]; regions: Region[]; threshold: number }) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const original = (row: StockRow, r: Region, size: string) => row.stock[r]?.[size] ?? 0;
  const changes = useMemo(() => {
    const out: StockChange[] = [];
    for (const row of rows) {
      for (const r of regions) {
        for (const size of row.freeSize ? ["Free size"] : SIZES) {
          const v = edits[key(row.id, r, size)];
          if (v === undefined || v === "") continue;
          const to = Number(v);
          const from = original(row, r, size);
          if (Number.isInteger(to) && to >= 0 && to !== from) out.push({ id: row.id, region: r, size, from, to });
        }
      }
    }
    return out;
  }, [edits, rows, regions]);
  const invalid = Object.values(edits).some((v) => v !== "" && !(Number.isInteger(Number(v)) && Number(v) >= 0));

  const save = () =>
    start(async () => {
      const res = await saveStockChanges(changes, reason, note);
      setMsg(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
      if (res.ok) {
        setEdits({});
        setNote("");
        router.refresh();
      }
    });

  if (!rows.length) {
    return <div className="adm-card"><p className="muted adm-empty">No products match. Clear the search or choose “All products”.</p></div>;
  }

  return (
    <>
      {msg && <p className={`notice ${msg.ok ? "ok" : "err"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
      <div className="table-wrap adm-card flush">
        <table className="t adm-t stock-t">
          <thead>
            <tr>
              <th>Product</th>
              <th>Store</th>
              {SIZES.map((s) => (
                <th key={s} className="num">
                  {s}
                  {regions.includes("uk") && <small className="block muted">UK {UK_SIZE[s]}</small>}
                </th>
              ))}
              <th className="num">Free size</th>
              <th className="num">Total</th>
              <th>Sells out in</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.id}>
                {regions.map((r, ri) => {
                  const sizes = row.freeSize ? ["Free size"] : [...SIZES];
                  const total = sizes.reduce((a, s) => a + (Number(edits[key(row.id, r, s)] ?? original(row, r, s)) || 0), 0);
                  const cell = (size: string) => {
                    const k = key(row.id, r, size);
                    const orig = original(row, r, size);
                    const v = edits[k] ?? String(orig);
                    const n = Number(v);
                    const changed = edits[k] !== undefined && n !== orig;
                    const state = n <= 0 ? "out" : n <= threshold ? "low" : "";
                    return (
                      <td key={size} className="num">
                        <input
                          className={`stock-in ${state} ${changed ? "changed" : ""}`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          value={v}
                          aria-label={`${row.name}, ${NAME[r]}, size ${size}`}
                          onChange={(e) => setEdits((x) => ({ ...x, [k]: e.target.value }))}
                          onFocus={(e) => e.currentTarget.select()}
                        />
                      </td>
                    );
                  };
                  return (
                    <tr key={r} className={`${ri === regions.length - 1 ? "stock-last" : ""} ${row.active ? "" : "off"}`}>
                      {ri === 0 && (
                        <td rowSpan={regions.length} className="stock-prod">
                          <div className="adm-prod">
                            <span className="adm-thumb sm">{row.image ? <Image src={row.image} alt="" width={30} height={40} /> : null}</span>
                            <span>
                              <Link className="adm-a" href={`/admin/products/${row.id}`}>{row.name}</Link>
                              {!row.active && <small className="muted block">Hidden from the shop</small>}
                              <button type="button" className="stock-move-btn" onClick={() => setMoving(moving === row.id ? null : row.id)} aria-expanded={moving === row.id}>
                                Move India ⇄ UK
                              </button>
                            </span>
                          </div>
                          {moving === row.id && <MoveForm row={row} onDone={(text, ok) => { setMsg({ ok, text }); if (ok) { setMoving(null); router.refresh(); } }} />}
                        </td>
                      )}
                      <th scope="row" className="nowrap stock-store">{FLAG[r]} {NAME[r]}</th>
                      {row.freeSize ? SIZES.map((s) => <td key={s} className="num muted">–</td>) : SIZES.map((s) => cell(s))}
                      {row.freeSize ? cell("Free size") : <td className="num muted">–</td>}
                      <td className="num"><b>{total}</b></td>
                      <td className="nowrap">
                        {(() => {
                          const f = row.forecast?.[r];
                          if (!f) return <small className="muted">No sales in 30 days</small>;
                          const tone = f.days <= 7 ? "dash-down" : f.days <= 21 ? "stock-soon" : "dash-up";
                          return (
                            <>
                              <span className={tone}>{f.days === 0 ? "Sold out" : `~${f.days} day${f.days === 1 ? "" : "s"}`}</span>
                              <small className="muted block">{f.size !== "Free size" ? `size ${f.size}` : ""}{f.restock ? `${f.size !== "Free size" ? " · " : ""}add ~${f.restock}` : ""}</small>
                            </>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted adm-small stock-key">
        <span className="stock-in out">0</span> sold out · <span className="stock-in low">{threshold}</span> running low ({threshold} or fewer) · <span className="stock-in changed">5</span> changed, not saved yet
      </p>

      {(changes.length > 0 || invalid) && (
        <div className="stock-bar" role="region" aria-label="Save stock changes">
          <b>{changes.length} change{changes.length === 1 ? "" : "s"} not saved</b>
          <div className="field">
            <label htmlFor="stock-reason">Why?</label>
            <select id="stock-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choose a reason</option>
              {REASONS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
          </div>
          <div className="field grow">
            <label htmlFor="stock-note">Note (optional)</label>
            <input id="stock-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Parcel from Hyderabad weavers" />
          </div>
          <button type="button" className="btn ghost adm-btn" onClick={() => { setEdits({}); setMsg(null); }} disabled={busy}>Undo all</button>
          <button type="button" className="btn adm-btn" onClick={save} disabled={busy || invalid || !reason || !changes.length} aria-busy={busy}>
            {busy ? "Saving…" : invalid ? "Fix the red boxes" : !reason ? "Choose a reason" : "Save changes"}
          </button>
        </div>
      )}
    </>
  );
}

/** Move pieces of one size between India and the UK (e.g. a parcel sent to the UK warehouse). */
function MoveForm({ row, onDone }: { row: StockRow; onDone: (text: string, ok: boolean) => void }) {
  const sizes = row.freeSize ? ["Free size"] : [...SIZES];
  const [size, setSize] = useState(sizes[0]);
  const [from, setFrom] = useState<Region>("in");
  const [amount, setAmount] = useState("1");
  const [note, setNote] = useState("");
  const [busy, start] = useTransition();
  const have = row.stock[from]?.[size];
  return (
    <div className="stock-move">
      <div className="field">
        <label htmlFor={`mv-dir-${row.id}`}>Direction</label>
        <select id={`mv-dir-${row.id}`} value={from} onChange={(e) => setFrom(e.target.value as Region)}>
          <option value="in">🇮🇳 India → 🇬🇧 UK</option>
          <option value="uk">🇬🇧 UK → 🇮🇳 India</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`mv-size-${row.id}`}>Size</label>
        <select id={`mv-size-${row.id}`} value={size} onChange={(e) => setSize(e.target.value)}>
          {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`mv-n-${row.id}`}>How many{have !== undefined ? ` (has ${have})` : ""}</label>
        <input id={`mv-n-${row.id}`} type="number" min={1} step={1} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="field grow">
        <label htmlFor={`mv-note-${row.id}`}>Note</label>
        <input id={`mv-note-${row.id}`} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. DHL parcel 12 Oct" />
      </div>
      <button
        type="button"
        className="btn adm-btn"
        disabled={busy || !(Number(amount) >= 1)}
        onClick={() =>
          start(async () => {
            const res = await transferStock(row.id, size, Number(amount), from, note);
            onDone(res.ok ? res.message : res.error, res.ok);
          })
        }
      >
        {busy ? "Moving…" : "Move stock"}
      </button>
    </div>
  );
}
