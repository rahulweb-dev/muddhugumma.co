"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveStoreSettings, type SettingsInput, type SettingsResult } from "@/lib/actions/settings";

type Text = Record<string, string>;

const TEXT_KEYS = ["legalName", "gstin", "stateCode", "address", "ukVatNumber", "supportEmail", "whatsappIn", "whatsappUk", "phone", "supportHours", "instagram"] as const;
/** One message per line. */
const LIST_KEYS = ["announcements.in", "announcements.uk", "ticker.in", "ticker.uk"] as const;
const NUM_KEYS = [
  "prepaidDiscountPct", "partialCodAdvance", "giftWrapFee.in", "giftWrapFee.uk", "lowStockThreshold",
  "loyalty.pointsPerUnit.in", "loyalty.pointsPerUnit.uk", "loyalty.pointValue.in", "loyalty.pointValue.uk", "loyalty.maxRedeemPct",
  "referralReward.in", "referralReward.uk", "birthdayCouponPct", "abandonedCartHours",
] as const;

function toText(s: SettingsInput): Text {
  const t: Text = {};
  for (const k of TEXT_KEYS) t[k] = String(s[k] ?? "");
  for (const k of LIST_KEYS) {
    const [group, region] = k.split(".") as ["announcements" | "ticker", "in" | "uk"];
    t[k] = (s[group]?.[region] ?? []).join("\n");
  }
  for (const k of NUM_KEYS) {
    const v = k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)?.[p], s);
    t[k] = v === undefined || v === null ? "" : String(v);
  }
  return t;
}

const lines = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);

function fromText(t: Text, codOtpRequired: boolean): SettingsInput {
  const n = (k: string) => (t[k].trim() === "" ? NaN : Number(t[k]));
  return {
    legalName: t.legalName, gstin: t.gstin, stateCode: t.stateCode, address: t.address, ukVatNumber: t.ukVatNumber,
    supportEmail: t.supportEmail, whatsappIn: t.whatsappIn, whatsappUk: t.whatsappUk,
    phone: t.phone, supportHours: t.supportHours, instagram: t.instagram,
    announcements: { in: lines(t["announcements.in"]), uk: lines(t["announcements.uk"]) },
    ticker: { in: lines(t["ticker.in"]), uk: lines(t["ticker.uk"]) },
    prepaidDiscountPct: n("prepaidDiscountPct"), partialCodAdvance: n("partialCodAdvance"), codOtpRequired,
    giftWrapFee: { in: n("giftWrapFee.in"), uk: n("giftWrapFee.uk") },
    lowStockThreshold: n("lowStockThreshold"),
    loyalty: {
      pointsPerUnit: { in: n("loyalty.pointsPerUnit.in"), uk: n("loyalty.pointsPerUnit.uk") },
      pointValue: { in: n("loyalty.pointValue.in"), uk: n("loyalty.pointValue.uk") },
      maxRedeemPct: n("loyalty.maxRedeemPct"),
    },
    referralReward: { in: n("referralReward.in"), uk: n("referralReward.uk") },
    birthdayCouponPct: n("birthdayCouponPct"),
    abandonedCartHours: n("abandonedCartHours"),
  };
}

export function SettingsForm({ initial }: { initial: SettingsInput }) {
  const router = useRouter();
  const [t, setT] = useState<Text>(() => toText(initial));
  const [otp, setOtp] = useState(!!initial.codOtpRequired);
  const [msg, setMsg] = useState<SettingsResult | null>(null);
  const [pending, start] = useTransition();
  const fields = msg && !msg.ok ? msg.fields ?? {} : {};

  const F = ({ k, label, hint, type = "text", step, wide }: { k: string; label: string; hint?: string; type?: "text" | "number" | "email"; step?: string; wide?: boolean }) => (
    <div className={`field ${wide ? "full" : ""}`}>
      <label htmlFor={`set-${k}`}>{label}</label>
      <input
        id={`set-${k}`}
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        step={step}
        min={type === "number" ? 0 : undefined}
        value={t[k]}
        aria-invalid={!!fields[k]}
        onChange={(e) => setT((x) => ({ ...x, [k]: e.target.value }))}
      />
      {fields[k] ? <span className="err">{fields[k]}</span> : hint ? <small className="muted">{hint}</small> : null}
    </div>
  );

  const L = ({ k, label, hint }: { k: string; label: string; hint?: string }) => (
    <div className="field full">
      <label htmlFor={`set-${k}`}>{label}</label>
      <textarea id={`set-${k}`} rows={4} value={t[k]} aria-invalid={!!fields[k]} onChange={(e) => setT((x) => ({ ...x, [k]: e.target.value }))} />
      {fields[k] ? <span className="err">{fields[k]}</span> : hint ? <small className="muted">{hint}</small> : null}
    </div>
  );

  return (
    <form
      className="adm-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const res = await saveStoreSettings(fromText(t, otp));
          setMsg(res);
          if (res.ok) router.refresh();
        });
      }}
    >
      {msg && !msg.ok ? <p className="notice err" role="alert">{msg.error}</p> : null}

      <section className="adm-card">
        <h2 className="h3">Business and tax</h2>
        <div className="form-grid two">
          {F({ k: "legalName", label: "Legal name" })}
          {F({ k: "supportEmail", label: "Customer care email", type: "email" })}
          {F({ k: "gstin", label: "GSTIN", hint: "Leave empty until you are GST registered: invoices then show no GST. Once set, GST is calculated and printed on every Indian invoice." })}
          {F({ k: "stateCode", label: "GST state code", hint: "36 = Telangana. Decides CGST+SGST vs IGST." })}
          {F({ k: "ukVatNumber", label: "UK VAT number", hint: "Optional, e.g. GB123456789" })}
          {F({ k: "address", label: "Registered address", wide: true })}
        </div>
      </section>

      <section className="adm-card">
        <h2 className="h3">Contact details shown to shoppers</h2>
        <div className="form-grid two">
          {F({ k: "phone", label: "Phone", hint: "With country code, e.g. +91 98765 43210" })}
          {F({ k: "supportHours", label: "Support hours", hint: "e.g. Monday to Sunday, 9:00 AM – 9:00 PM GMT" })}
          {F({ k: "whatsappIn", label: "WhatsApp for India", hint: "With country code, e.g. +91 98765 43210" })}
          {F({ k: "whatsappUk", label: "WhatsApp for the UK", hint: "e.g. +44 7700 900123" })}
          {F({ k: "instagram", label: "Instagram handle", hint: "Without the @" })}
        </div>
      </section>

      <section className="adm-card">
        <h2 className="h3">Announcements</h2>
        <p className="muted adm-small">One message per line. Leave a box empty to use the built-in messages.</p>
        <div className="form-grid two">
          {L({ k: "announcements.in", label: "Top bar, India" })}
          {L({ k: "announcements.uk", label: "Top bar, UK" })}
          {L({ k: "ticker.in", label: "Homepage scrolling strip, India" })}
          {L({ k: "ticker.uk", label: "Homepage scrolling strip, UK" })}
        </div>
      </section>

      <section className="adm-card">
        <h2 className="h3">Payments and delivery</h2>
        <div className="adm-grid4">
          {F({ k: "prepaidDiscountPct", label: "Prepaid discount %", type: "number", step: "0.5" })}
          {F({ k: "partialCodAdvance", label: "Part-COD advance ₹", type: "number", step: "1" })}
          {F({ k: "giftWrapFee.in", label: "Gift wrap ₹", type: "number", step: "1" })}
          {F({ k: "giftWrapFee.uk", label: "Gift wrap £", type: "number", step: "0.01" })}
        </div>
        <label className="check">
          <input type="checkbox" checked={otp} onChange={(e) => setOtp(e.target.checked)} /> Ask cash-on-delivery shoppers to confirm their phone with a one-time code
        </label>
      </section>

      <section className="adm-card">
        <h2 className="h3">Loyalty, referrals and offers</h2>
        <div className="adm-grid4">
          {F({ k: "loyalty.pointsPerUnit.in", label: "Points per ₹100", type: "number", step: "0.1" })}
          {F({ k: "loyalty.pointsPerUnit.uk", label: "Points per £1", type: "number", step: "0.1" })}
          {F({ k: "loyalty.pointValue.in", label: "1 point = ₹", type: "number", step: "0.01" })}
          {F({ k: "loyalty.pointValue.uk", label: "1 point = £", type: "number", step: "0.01" })}
          {F({ k: "loyalty.maxRedeemPct", label: "Max order % paid in points", type: "number", step: "1" })}
          {F({ k: "referralReward.in", label: "Referral reward ₹", type: "number", step: "1" })}
          {F({ k: "referralReward.uk", label: "Referral reward £", type: "number", step: "0.01" })}
          {F({ k: "birthdayCouponPct", label: "Birthday offer %", type: "number", step: "1" })}
        </div>
      </section>

      <section className="adm-card">
        <h2 className="h3">Reminders and alerts</h2>
        <div className="adm-grid4">
          {F({ k: "lowStockThreshold", label: "Low stock at or below", type: "number", step: "1", hint: "Pieces per size" })}
          {F({ k: "abandonedCartHours", label: "Bag reminder after (hours)", type: "number", step: "1" })}
        </div>
      </section>

      <div className="adm-savebar">
        <span className="adm-small">{msg?.ok ? <span className="text-ok">{msg.message}</span> : "Changes apply to the store straight away."}</span>
        <button className="btn adm-btn" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button>
      </div>
    </form>
  );
}
