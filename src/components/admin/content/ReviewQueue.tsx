"use client";
import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { moderateReviews } from "@/lib/actions/service";
import { Msg } from "./ui";
import type { Result } from "./shared";

export type ReviewRow = {
  id: string;
  slug: string;
  productName: string;
  productImage: string;
  name: string;
  city: string;
  rating: number;
  title: string;
  body: string;
  images: string[];
  verified: boolean;
  status: "pending" | "approved" | "rejected";
  date: string;
};

type Target = "approved" | "rejected" | "pending";

export function ReviewQueue({ rows, tab }: { rows: ReviewRow[]; tab: Target }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [res, setRes] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const [zoom, setZoom] = useState<string | null>(null);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = rows.length > 0 && sel.size === rows.length;
  const run = (ids: string[], to: Target) => {
    setRes(null);
    start(async () => {
      const r = await moderateReviews(ids, to);
      setRes(r);
      if (r.ok) {
        setSel(new Set());
        router.refresh();
      }
    });
  };

  const actions = (to: Target[]) => to.filter((t) => t !== tab);
  const LABEL: Record<Target, string> = { approved: "Approve", rejected: "Reject", pending: "Back to pending" };

  return (
    <div className="flex flex-col gap-3">
      <div className="adm-row adm-card py-3! flex-row! sticky top-0 z-10">
        <label className="check"><input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.map((r) => r.id)))} /> Select all ({rows.length})</label>
        <span className="muted adm-small">{sel.size} selected</span>
        <div className="adm-row ml-auto">
          {actions(["approved", "rejected", "pending"]).map((t) => (
            <button key={t} type="button" className={`btn adm-btn ${t === "approved" ? "" : "ghost"} ${t === "rejected" ? "adm-btn-danger-ghost" : ""}`} disabled={pending || !sel.size} onClick={() => run([...sel], t)}>
              {LABEL[t]} selected
            </button>
          ))}
        </div>
      </div>
      <Msg res={res} />

      <ul className="list-none m-0 p-0 flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.id} className={`adm-card ${sel.has(r.id) ? "border-bronze!" : ""}`}>
            <div className="flex gap-3 items-start">
              <input type="checkbox" className="mt-1 w-4 h-4 accent-ink shrink-0" checked={sel.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select review by ${r.name}`} />
              <Link href={`/p/${r.slug}`} target="_blank" className="adm-thumb shrink-0">{r.productImage ? <Image src={r.productImage} alt="" width={42} height={56} /> : null}</Link>
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <Link className="adm-a self-start" href={`/p/${r.slug}`} target="_blank">{r.productName}</Link>
                <div className="adm-row gap-2!">
                  <span className="text-bronze tracking-wider" aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}<span className="text-line">{"★".repeat(5 - r.rating)}</span></span>
                  <b>{r.title || "No title"}</b>
                </div>
                <small className="muted">
                  {r.name || "Anonymous"}{r.city ? `, ${r.city}` : ""} · {r.date}
                  {r.verified ? <span className="chip ml-2 py-0.5! text-ok border-ok/40">Verified buyer</span> : <span className="ml-2">Not a verified buyer</span>}
                </small>
              </div>
            </div>
            {r.body ? <p className="m-0 whitespace-pre-line leading-relaxed">{r.body}</p> : null}
            {r.images.length ? (
              <div className="flex flex-wrap gap-2">
                {r.images.map((src) => (
                  <button key={src} type="button" onClick={() => setZoom(zoom === src ? null : src)} className={`relative w-20 aspect-[3/4] bg-stone border overflow-hidden ${zoom === src ? "border-ink" : "border-line"}`} aria-label="Enlarge photo">
                    <Image src={src} alt={`Customer photo for ${r.productName}`} fill sizes="80px" className="object-cover" />
                  </button>
                ))}
              </div>
            ) : null}
            {zoom && r.images.includes(zoom) ? (
              <div className="relative w-full max-w-sm aspect-[3/4] bg-stone border border-line">
                <Image src={zoom} alt="Customer photo, enlarged" fill sizes="384px" className="object-contain" />
              </div>
            ) : null}
            <div className="adm-row border-t border-line pt-3">
              {actions(["approved", "rejected", "pending"]).map((t) => (
                <button key={t} type="button" className={t === "pending" ? "adm-more" : `btn adm-btn ${t === "approved" ? "" : "ghost adm-btn-danger-ghost"}`} disabled={pending} onClick={() => run([r.id], t)}>
                  {LABEL[t]}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
