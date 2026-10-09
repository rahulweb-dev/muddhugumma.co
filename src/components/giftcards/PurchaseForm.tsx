"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "../StoreProvider";
import { loadRazorpay, type RazorpayResponse } from "../checkout/razorpay";
import { confirmGiftCardRazorpay, purchaseGiftCard } from "@/lib/actions/giftcards";
import { formatMoney, type Region } from "@/lib/region";

export const GC_PRESETS: Record<Region, number[]> = { in: [1000, 2000, 5000, 10000], uk: [25, 50, 100, 200] };
export const GC_LIMITS: Record<Region, { min: number; max: number }> = { in: { min: 500, max: 50000 }, uk: { min: 10, max: 500 } };
const MESSAGE_MAX = 300;

export function PurchaseForm({ email: signedInEmail }: { email: string }) {
  const router = useRouter();
  const { region } = useStore();
  const f = (n: number) => formatMoney(n, region);
  const [preset, setPreset] = useState<number | "custom">(GC_PRESETS[region][1]);
  const [custom, setCustom] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [purchaserEmail, setPurchaserEmail] = useState(signedInEmail);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPreset(GC_PRESETS[region][1]);
    setCustom("");
    setErrors({});
    setError("");
  }, [region]);

  const lim = GC_LIMITS[region];
  const amount = preset === "custom" ? Math.floor(Number(custom.replace(/[^\d]/g, "")) || 0) : preset;

  async function payRazorpay(ref: string, rz: { key: string; orderId: string; amount: number; currency: string; prefill: { email: string } }) {
    if (!(await loadRazorpay()) || !window.Razorpay) {
      setBusy(false);
      setError("We couldn't load Razorpay. Check your connection and try again.");
      return;
    }
    const rzp = new window.Razorpay({
      key: rz.key,
      amount: rz.amount,
      currency: rz.currency,
      order_id: rz.orderId,
      name: "House of Muddhugumma",
      description: "Gift card",
      prefill: rz.prefill,
      notes: { gift_card_ref: ref },
      theme: { color: "#1B1A18" },
      handler: async (resp: RazorpayResponse) => {
        const res = await confirmGiftCardRazorpay(ref, resp.razorpay_order_id, resp.razorpay_payment_id, resp.razorpay_signature).catch(() => null);
        if (res?.ok) router.push(res.redirect);
        else router.push(`/gift-cards/thanks?ref=${ref}`);
      },
      modal: { ondismiss: () => { setBusy(false); setError("Payment not completed. Your card hasn't been charged; try again when you're ready."); } },
    });
    rzp.on("payment.failed", (e) => setError(e.error?.description ? `Payment failed: ${e.error.description}` : "Payment failed. Please try again."));
    rzp.open();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const errs: Record<string, string> = {};
    if (amount < lim.min || amount > lim.max) errs.amount = `Choose an amount between ${f(lim.min)} and ${f(lim.max)}.`;
    if (recipientName.trim().length < 2) errs.recipientName = "Enter their name";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())) errs.recipientEmail = "Enter a valid email address";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(purchaserEmail.trim())) errs.purchaserEmail = "Enter a valid email address";
    setErrors(errs);
    setError("");
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const res = await purchaseGiftCard({ region, amount, recipientName, recipientEmail, message, purchaserEmail });
      if (!res.ok) {
        setError(res.error);
        setErrors(res.fieldErrors ?? {});
        setBusy(false);
        return;
      }
      if ("redirect" in res) return router.push(res.redirect);
      if ("stripeUrl" in res) return window.location.assign(res.stripeUrl);
      await payRazorpay(res.ref, res.razorpay);
    } catch {
      setError("Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  const err = (k: string) => errors[k];
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      {error && <p className="notice err" role="alert">{error}</p>}
      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className="h3 mb-3">Choose an amount</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Gift card amount">
          {[...GC_PRESETS[region], "custom" as const].map((p) => (
            <label
              key={String(p)}
              className={`flex h-12 cursor-pointer items-center justify-center border text-[14px] font-bold transition-colors ${preset === p ? "border-ink bg-ink text-paper" : "border-line bg-paper hover:border-muted"}`}
            >
              <input type="radio" name="gc-amount" className="sr-only" checked={preset === p} onChange={() => setPreset(p)} />
              {p === "custom" ? "Other" : f(p)}
            </label>
          ))}
        </div>
        {preset === "custom" && (
          <div className="field max-w-[260px]">
            <label htmlFor="gc-custom">Amount ({f(lim.min)} – {f(lim.max)})</label>
            <input id="gc-custom" inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, "").slice(0, 6))} placeholder={region === "in" ? "e.g. 3500" : "e.g. 75"} aria-invalid={!!err("amount") || undefined} />
          </div>
        )}
        {err("amount") && <span className="text-[12px] text-sale" role="alert">{err("amount")}</span>}
      </fieldset>

      <div className="form-grid two">
        <div className="field">
          <label htmlFor="gc-rname">Their name</label>
          <input id="gc-rname" autoComplete="off" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} aria-invalid={!!err("recipientName") || undefined} />
          {err("recipientName") && <span className="err" role="alert">{err("recipientName")}</span>}
        </div>
        <div className="field">
          <label htmlFor="gc-remail">Their email</label>
          <input id="gc-remail" type="email" inputMode="email" autoComplete="off" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} aria-invalid={!!err("recipientEmail") || undefined} />
          {err("recipientEmail") && <span className="err" role="alert">{err("recipientEmail")}</span>}
        </div>
        <div className="field full">
          <label htmlFor="gc-msg">Your message (optional)</label>
          <textarea id="gc-msg" rows={3} maxLength={MESSAGE_MAX} value={message} onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))} placeholder="Wishing you a beautiful Diwali. Pick something that makes you smile!" />
          <small className="text-right text-[11.5px] text-muted">{message.length}/{MESSAGE_MAX}</small>
        </div>
        <div className="field full">
          <label htmlFor="gc-pemail">Your email (for the receipt)</label>
          <input id="gc-pemail" type="email" inputMode="email" autoComplete="email" value={purchaserEmail} onChange={(e) => setPurchaserEmail(e.target.value)} aria-invalid={!!err("purchaserEmail") || undefined} />
          {err("purchaserEmail") && <span className="err" role="alert">{err("purchaserEmail")}</span>}
        </div>
      </div>

      <button type="submit" className="btn block" disabled={busy || amount <= 0}>
        {busy ? "Please wait…" : amount > 0 ? `Pay ${f(amount)}` : "Choose an amount"}
      </button>
      <p className="m-0 text-center text-[12px] text-muted">
        {region === "in" ? "Pay by UPI, card or net banking through Razorpay." : "Pay by card, Apple Pay or Google Pay through Stripe."} The card is emailed straight after payment and is valid for 12 months on {region === "in" ? "India (₹)" : "UK (£)"} orders.
      </p>
    </form>
  );
}
