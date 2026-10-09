"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmBooking, setBookingStatus } from "@/lib/actions/service";
import { Msg } from "./ui";
import type { Result } from "./shared";

const PLATFORMS = [
  { id: "meet", label: "Google Meet", hint: "https://meet.google.com/abc-defg-hij", open: "https://meet.google.com/new" },
  { id: "zoom", label: "Zoom", hint: "https://us05web.zoom.us/j/1234567890?pwd=…", open: "https://zoom.us/meeting/schedule" },
  { id: "whatsapp", label: "WhatsApp video", hint: "https://wa.me/919876543210", open: "" },
] as const;

export function BookingActions({ id, status, link, phone, region }: { id: string; status: "requested" | "confirmed" | "done" | "cancelled"; link: string; phone: string; region: "in" | "uk" }) {
  const router = useRouter();
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]["id"]>(/wa\.me|whatsapp/i.test(link) ? "whatsapp" : /zoom/i.test(link) ? "zoom" : "meet");
  const [url, setUrl] = useState(link);
  const [mode, setMode] = useState<"idle" | "confirm" | "cancel">(status === "requested" ? "confirm" : "idle");
  const [reason, setReason] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const p = PLATFORMS.find((x) => x.id === platform)!;

  const waLink = () => {
    const d = phone.replace(/\D/g, "");
    if (!d) return "";
    const full = d.length === 10 && region === "in" ? `91${d}` : d.startsWith("0") && region === "uk" ? `44${d.slice(1)}` : d;
    return `https://wa.me/${full}`;
  };

  const run = (fn: () => Promise<Result>) => {
    setRes(null);
    start(async () => {
      const r = await fn();
      setRes(r);
      if (r.ok) {
        setMode("idle");
        router.refresh();
      }
    });
  };

  if (status === "done" || status === "cancelled") return res ? <Msg res={res} /> : null;

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      {mode === "confirm" ? (
        <form className="adm-form" onSubmit={(e) => { e.preventDefault(); run(() => confirmBooking(id, url)); }}>
          <div className="adm-grid3">
            <div className="field">
              <label htmlFor={`pl-${id}`}>Platform</label>
              <select
                id={`pl-${id}`}
                value={platform}
                onChange={(e) => {
                  const v = e.target.value as typeof platform;
                  setPlatform(v);
                  if (v === "whatsapp" && !url) setUrl(waLink());
                }}
              >
                {PLATFORMS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </div>
            <div className="field col-span-2">
              <label htmlFor={`ln-${id}`}>Meeting link</label>
              <input id={`ln-${id}`} type="url" inputMode="url" required value={url} placeholder={p.hint} onChange={(e) => setUrl(e.target.value.trim())} />
            </div>
          </div>
          <p className="muted adm-small">
            {platform === "whatsapp"
              ? "The customer taps the link to open a chat with the studio number; start the video call from WhatsApp at the booked time."
              : <>Create the meeting first{p.open ? <> (<a className="adm-a" href={p.open} target="_blank" rel="noreferrer">open {p.label}</a>)</> : null}, then paste its link. The customer gets an email with the date, time in their timezone and the link.</>}
          </p>
          <div className="adm-row">
            <button className="btn adm-btn" disabled={pending || !url}>{pending ? "Sending…" : status === "confirmed" ? "Update link and email" : "Confirm and email customer"}</button>
            {status === "confirmed" ? <button type="button" className="adm-more" onClick={() => setMode("idle")}>Cancel</button> : null}
          </div>
        </form>
      ) : mode === "cancel" ? (
        <form className="adm-form" onSubmit={(e) => { e.preventDefault(); run(() => setBookingStatus(id, "cancelled", reason)); }}>
          <div className="field">
            <label htmlFor={`rs-${id}`}>Reason (optional; included in the email)</label>
            <input id={`rs-${id}`} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Our stylist is unwell that day; reply and we'll rebook you first" />
          </div>
          <div className="adm-row">
            <button className="btn adm-btn adm-btn-danger" disabled={pending}>{pending ? "Cancelling…" : "Cancel booking and email customer"}</button>
            <button type="button" className="adm-more" onClick={() => setMode(status === "requested" ? "confirm" : "idle")}>Keep booking</button>
          </div>
        </form>
      ) : null}

      <div className="adm-row">
        {status === "confirmed" && mode === "idle" ? (
          <>
            <button type="button" className="btn adm-btn" disabled={pending} onClick={() => run(() => setBookingStatus(id, "done"))}>Mark done</button>
            <button type="button" className="btn ghost adm-btn" onClick={() => setMode("confirm")}>Change link</button>
          </>
        ) : null}
        {mode !== "cancel" ? <button type="button" className="adm-more text-sale!" onClick={() => setMode("cancel")}>Cancel booking</button> : null}
      </div>
      <Msg res={res} />
    </div>
  );
}
