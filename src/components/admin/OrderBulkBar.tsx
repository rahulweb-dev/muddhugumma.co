"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkUpdateOrderStatus } from "@/lib/actions/admin";
import { markOrdersPacked } from "@/lib/actions/shipping";

const FORM = "bulk-orders";
const selected = () => Array.from(document.querySelectorAll<HTMLInputElement>(`input[form="${FORM}"][name="ids"]:checked`)).map((i) => i.value);

/** Row checkbox (lives in the server-rendered table, belongs to the bulk form below). */
export function OrderCheck({ id, label }: { id: string; label: string }) {
  return <input type="checkbox" form={FORM} name="ids" value={id} aria-label={`Select order ${label}`} className="ord-check" />;
}

/** Header checkbox: tick / untick every order on this page. */
export function OrderCheckAll() {
  return (
    <input
      type="checkbox"
      className="ord-check"
      aria-label="Select all orders on this page"
      onChange={(e) => {
        document.querySelectorAll<HTMLInputElement>(`input[form="${FORM}"][name="ids"]`).forEach((i) => (i.checked = e.currentTarget.checked));
        document.dispatchEvent(new Event("bulk-change"));
      }}
    />
  );
}

/** Sticky bar for ticked orders: confirm, mark packed / delivered, print slips or invoices. */
export function OrderBulkBar({ canManage, canShip }: { canManage: boolean; canShip: boolean }) {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    const recount = () => setCount(selected().length);
    document.addEventListener("change", recount);
    document.addEventListener("bulk-change", recount);
    return () => {
      document.removeEventListener("change", recount);
      document.removeEventListener("bulk-change", recount);
    };
  }, []);

  const run = (fn: (ids: string[]) => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const res = await fn(selected());
      setMsg({ ok: res.ok, text: (res.ok ? res.message : res.error) ?? "" });
      if (res.ok) {
        document.querySelectorAll<HTMLInputElement>(`input.ord-check`).forEach((i) => (i.checked = false));
        setCount(0);
        router.refresh();
      }
    });
  const print = (doc: "slips" | "invoices") => window.open(`/admin/orders/print?doc=${doc}&print=1&ids=${selected().join(",")}`, "_blank");

  return (
    <>
      <form id={FORM} onSubmit={(e) => e.preventDefault()} hidden />
      {msg && <p className={`notice ${msg.ok ? "ok" : "err"}`} role="status">{msg.text}</p>}
      {count > 0 && (
        <div className="stock-bar" role="region" aria-label="Actions for selected orders">
          <b>{count} order{count === 1 ? "" : "s"} selected</b>
          {canManage && <button type="button" className="btn ghost adm-btn" disabled={busy} onClick={() => run((ids) => bulkUpdateOrderStatus(ids, "confirmed"))}>Confirm</button>}
          {canShip && <button type="button" className="btn adm-btn" disabled={busy} onClick={() => run((ids) => markOrdersPacked(ids))}>Mark packed</button>}
          {canManage && <button type="button" className="btn ghost adm-btn" disabled={busy} onClick={() => run((ids) => bulkUpdateOrderStatus(ids, "delivered"))}>Mark delivered</button>}
          {canShip && <button type="button" className="btn ghost adm-btn" disabled={busy} onClick={() => print("slips")}>Print packing slips</button>}
          <button type="button" className="btn ghost adm-btn" disabled={busy} onClick={() => print("invoices")}>Print invoices</button>
        </div>
      )}
    </>
  );
}
