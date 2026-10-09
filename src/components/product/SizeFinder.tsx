"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { saveMeasurements } from "@/lib/actions/fit";
import type { Measurements } from "@/lib/queries";
import type { Region } from "@/lib/region";
import type { ProductDTO } from "@/lib/types";
import { BRANDS, bothLabels, fitFromBody, fitFromBrand, sizeLabel, toInches, type Fit } from "./size-fit";

const CATEGORY_NOTE: Record<ProductDTO["category"], string> = {
  sarees: "",
  "kurta-sets": "Our kurtas carry 1.5 in of seam allowance, so a tailor can let them out a little if you need.",
  lehengas: "Lehenga skirts close with a drawstring and have about 2 in of give at the waist. Blouses can be stitched to your measurements.",
};

/** Recommendation from saved measurements, used for the hint next to the size buttons. */
export function savedFit(saved: Measurements | null | undefined, region: Region): Fit | null {
  if (!saved) return null;
  return fitFromBody({ bust: saved.bust, waist: saved.waist, hip: saved.hip }, region) ?? (saved.brand && saved.brandSize ? fitFromBrand(saved.brand, saved.brandSize, region) : null);
}

export function SizeFinder({
  category,
  region,
  signedIn,
  saved,
  stockOf,
  onPick,
}: {
  category: ProductDTO["category"];
  region: Region;
  signedIn: boolean;
  saved: Measurements | null;
  stockOf: (size: string) => number;
  onPick: (size: string) => void;
}) {
  const pathname = usePathname();
  const hasBody = !!(saved?.bust || saved?.waist || saved?.hip);
  const [mode, setMode] = useState<"body" | "brand">(!hasBody && saved?.brand ? "brand" : "body");
  const [unit, setUnit] = useState<"in" | "cm">("in");
  const [vals, setVals] = useState({ bust: saved?.bust ? String(saved.bust) : "", waist: saved?.waist ? String(saved.waist) : "", hip: saved?.hip ? String(saved.hip) : "" });
  const [brand, setBrand] = useState(saved?.brand && BRANDS.some((b) => b.name === saved.brand) ? saved.brand : "");
  const [brandSize, setBrandSize] = useState(saved?.brandSize ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, start] = useTransition();

  const body = useMemo(() => {
    const n = (s: string) => {
      const v = Number(s.replace(",", "."));
      return Number.isFinite(v) && v > 0 ? toInches(v, unit) : undefined;
    };
    return { bust: n(vals.bust), waist: n(vals.waist), hip: n(vals.hip) };
  }, [vals, unit]);
  const odd = Object.values(body).some((v) => v !== undefined && (v < 20 || v > 70));
  const fit = mode === "body" ? (odd ? null : fitFromBody(body, region)) : brand && brandSize ? fitFromBrand(brand, brandSize, region) : null;
  const brandObj = BRANDS.find((b) => b.name === brand);
  const rec = fit ? sizeLabel(fit.index, region) : "";
  const left = fit ? stockOf(rec) : 0;

  const switchUnit = (u: "in" | "cm") => {
    if (u === unit) return;
    const conv = (s: string) => {
      const v = Number(s);
      if (!s || !Number.isFinite(v)) return s;
      return String(Math.round((u === "cm" ? v * 2.54 : v / 2.54) * 10) / 10);
    };
    setVals((x) => ({ bust: conv(x.bust), waist: conv(x.waist), hip: conv(x.hip) }));
    setUnit(u);
  };

  const save = () =>
    start(async () => {
      setMsg(null);
      const res = await saveMeasurements(
        mode === "body"
          ? { bust: body.bust, waist: body.waist, hip: body.hip, usualSize: fit ? (sizeLabel(fit.index, "in") as "M") : undefined }
          : { brand, brandSize, usualSize: fit ? (sizeLabel(fit.index, "in") as "M") : undefined }
      );
      setMsg({ ok: res.ok, text: res.message });
    });

  return (
    <div className="sf">
      <p className="muted">Tell us your measurements or a size you already wear, and we&apos;ll match it to our chart.</p>
      <div className="sg-unit" role="radiogroup" aria-label="How do you want to find your size?">
        <button type="button" role="radio" aria-checked={mode === "body"} onClick={() => setMode("body")}>My measurements</button>
        <button type="button" role="radio" aria-checked={mode === "brand"} onClick={() => setMode("brand")}>A brand I wear</button>
      </div>

      {mode === "body" ? (
        <fieldset className="sf-body">
          <legend className="sr-only">Body measurements</legend>
          <div className="sf-unit">
            <span className="muted">Units</span>
            <div className="sg-unit" role="radiogroup" aria-label="Units">
              <button type="button" role="radio" aria-checked={unit === "in"} onClick={() => switchUnit("in")}>Inches</button>
              <button type="button" role="radio" aria-checked={unit === "cm"} onClick={() => switchUnit("cm")}>Cm</button>
            </div>
          </div>
          <div className="sf-grid">
            {(["bust", "waist", "hip"] as const).map((k) => (
              <div className="field" key={k}>
                <label htmlFor={`sf-${k}`}>{k[0].toUpperCase() + k.slice(1)} ({unit})</label>
                <input
                  id={`sf-${k}`}
                  inputMode="decimal"
                  value={vals[k]}
                  onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value.replace(/[^\d.,]/g, "").slice(0, 5) }))}
                  placeholder={unit === "in" ? { bust: "36", waist: "30", hip: "39" }[k] : { bust: "91", waist: "76", hip: "99" }[k]}
                />
              </div>
            ))}
          </div>
          {odd && <p className="notice err">One of those numbers looks off for {unit === "in" ? "inches" : "centimetres"}. Check the unit.</p>}
          <small className="muted">Measure over light clothing: bust at the fullest part, waist at the narrowest, hip at the fullest with feet together.</small>
        </fieldset>
      ) : (
        <div className="form-grid two">
          <div className="field">
            <label htmlFor="sf-brand">Brand</label>
            <select id="sf-brand" value={brand} onChange={(e) => { setBrand(e.target.value); setBrandSize(""); }}>
              <option value="">Choose a brand</option>
              {BRANDS.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sf-bsize">Size you usually wear</label>
            <select id="sf-bsize" value={brandSize} onChange={(e) => setBrandSize(e.target.value)} disabled={!brandObj}>
              <option value="">{brandObj ? "Choose a size" : "Pick a brand first"}</option>
              {brandObj?.sizes.map((s) => <option key={s.label} value={s.label}>{s.label}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className="sf-res" aria-live="polite">
        {fit ? (
          <>
            <span className="kick">Our suggestion</span>
            <b className="sf-size">{bothLabels(fit.index, region)}</b>
            {fit.beyond && <p className="notice">That&apos;s above our ready sizes. Choose {rec} and pick a stitched-to-measure blouse where offered, or message us for a custom fit.</p>}
            <ul>
              {fit.reasons.map((r) => <li key={r}>{r}</li>)}
              {mode === "body" && fit.reasons.length > 1 && !fit.beyond && <li>Your {fit.decidedBy} needs the larger size, so we went with that.</li>}
              {CATEGORY_NOTE[category] && <li>{CATEGORY_NOTE[category]}</li>}
            </ul>
            <div className="sf-act">
              <button type="button" className="btn" onClick={() => onPick(rec)}>
                {left > 0 ? `Select ${rec}` : `${rec} is sold out · notify me`}
              </button>
              {signedIn ? (
                <button type="button" className="link" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save to my profile"}</button>
              ) : (
                <Link className="link" href={`/account/login?next=${encodeURIComponent(pathname)}`}>Sign in to save for next time</Link>
              )}
            </div>
            {msg && <p className={`notice ${msg.ok ? "ok" : "err"}`} role="status">{msg.text}</p>}
          </>
        ) : (
          <p className="muted">{mode === "body" ? "Enter at least one measurement to see your size." : "Pick a brand and the size you wear there."}</p>
        )}
      </div>
    </div>
  );
}
