"use client";
import { useState } from "react";
import { checkGiftCardBalance, type BalanceResult } from "@/lib/actions/giftcards";

const STATE_TEXT = { active: "Active", expired: "Expired", used: "Fully used", inactive: "Not active" } as const;

export function BalanceChecker({ initial = "" }: { initial?: string }) {
  const [code, setCode] = useState(initial);
  const [res, setRes] = useState<BalanceResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    try {
      setRes(await checkGiftCardBalance(code));
    } catch {
      setRes({ ok: false, message: "We couldn't check that just now. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="co-cform" noValidate>
        <label className="sr-only" htmlFor="gc-code">Gift card code</label>
        <input id="gc-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="MG-XXXX-XXXX" autoComplete="off" autoCapitalize="characters" />
        <button type="submit" disabled={busy}>{busy ? "…" : "Check"}</button>
      </form>
      <div aria-live="polite">
        {res && !res.ok && <p className="notice err">{res.message}</p>}
        {res?.ok && (
          <div className="flex flex-col gap-2 border border-dashed border-bronze bg-stone p-5 text-center">
            <span className="kick">{res.code}</span>
            <strong className="font-display text-[30px] tracking-[.06em]">{res.balance}</strong>
            <span className="text-[13px] text-muted">
              left of {res.initial} · {STATE_TEXT[res.state]}
              {res.expires && <> · valid until {res.expires}</>}
            </span>
            <span className="text-[12px] text-muted">For {res.region === "in" ? "India (₹)" : "UK (£)"} orders. Enter the code in the Gift card box at checkout.</span>
          </div>
        )}
      </div>
    </div>
  );
}
