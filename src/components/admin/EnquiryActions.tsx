"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { replyToEnquiry, setEnquiryStatus, type EnquiryResult } from "@/lib/actions/enquiries";

export function EnquiryActions({ id, status, name }: { id: string; status: "open" | "replied" | "closed"; name: string }) {
  const [reply, setReply] = useState("");
  const [msg, setMsg] = useState<EnquiryResult | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<EnquiryResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="field">
        <label htmlFor={`r-${id}`}>Reply to {name.split(/\s+/)[0] || "customer"} by email</label>
        <textarea id={`r-${id}`} rows={4} value={reply} maxLength={4000} onChange={(e) => setReply(e.target.value)} placeholder="Write your reply. It's emailed from the store address and saved here." />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn adm-btn" disabled={pending || reply.trim().length < 5} onClick={() => run(() => replyToEnquiry(id, reply), () => setReply(""))}>
          {pending ? "Sending…" : "Send reply"}
        </button>
        {status !== "closed" ? (
          <button type="button" className="btn ghost adm-btn" disabled={pending} onClick={() => run(() => setEnquiryStatus(id, "closed"))}>Mark done</button>
        ) : (
          <button type="button" className="btn ghost adm-btn" disabled={pending} onClick={() => run(() => setEnquiryStatus(id, "open"))}>Reopen</button>
        )}
      </div>
      {msg && <p className={`notice ${msg.ok ? "ok" : "err"} m-0`} role="status">{msg.ok ? msg.message : msg.error}</p>}
    </div>
  );
}
