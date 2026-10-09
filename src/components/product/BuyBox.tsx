"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { Overlay } from "../Overlay";
import { useStore } from "../StoreProvider";
import { usePrice, useSalePriced } from "../SalesProvider";
import { CompareToggle } from "../compare/CompareProvider";
import { NotifyMe } from "./NotifyMe";
import { SizeFinder, savedFit } from "./SizeFinder";
import { bothLabels, sizeLabel } from "./size-fit";
import { saleTag } from "@/lib/pricing";
import type { Measurements } from "@/lib/queries";
import { REGION_CONFIG, SIZE_CHART, canonicalSize, deliveryWindow, formatMoney, shortDate, sizesFor, type Region } from "@/lib/region";
import { discountPct, type CartLine, type ProductDTO } from "@/lib/types";

const POST_KEY = "mg_post_v1";

/** Pay-later notes: India no-cost EMI over 6 months from ₹3,000; UK pay in 3. */
function PayLater({ amount, region }: { amount: number; region: Region }) {
  if (region === "in") {
    if (amount < 3000) return null;
    return <p className="pdp-emi"><Icon name="cash" size={15} /> <span>No-cost EMI from <b>{formatMoney(Math.ceil(amount / 6), "in")}/month</b> on credit cards</span></p>;
  }
  return <p className="pdp-emi"><Icon name="cash" size={15} /> <span>or 3 interest-free payments of <b>{formatMoney(Math.ceil((amount / 3) * 100) / 100, "uk")}</b></span></p>;
}

export function BuyBox({ p, email, signedIn = false, saved = null }: { p: ProductDTO; email?: string; signedIn?: boolean; saved?: Measurements | null }) {
  const router = useRouter();
  const { region, addToCart, isWished, toggleWish } = useStore();
  const eff = usePrice(p);
  const priced = useSalePriced();
  const r = REGION_CONFIG[region];
  const isSaree = p.blouseOptions; // blouse stitching + fall/pico options
  const sizes = sizesFor(p.freeSize, region);
  const stockOf = (s: string) => p.stock[canonicalSize(s)] ?? 0;

  const [size, setSize] = useState<string>(p.freeSize ? sizes[0] : "");
  const [blouse, setBlouse] = useState<"unstitched" | "stitched">("unstitched");
  const [fallPico, setFallPico] = useState(false);
  const [qty, setQty] = useState(1);
  const [sizeErr, setSizeErr] = useState(false);
  const [guide, setGuide] = useState(false);
  const [finder, setFinder] = useState(false);
  const sizeRef = useRef<HTMLDivElement>(null);

  // A region switch changes the size labels (M ↔ UK 10); keep the equivalent size selected.
  useEffect(() => {
    setSize((cur) => {
      if (p.freeSize) return sizesFor(true, region)[0];
      if (!cur) return "";
      const row = SIZE_CHART.find((c) => c.in === canonicalSize(cur));
      return row ? (region === "uk" ? row.uk : row.in) : "";
    });
  }, [region, p.freeSize]);

  const extra = isSaree ? (blouse === "stitched" ? r.blouseStitching : 0) + (fallPico ? r.fallPico : 0) : 0;
  const base = eff;
  const m = { now: base.now + extra, mrp: base.mrp > 0 ? base.mrp + extra : 0 };
  const off = discountPct(m);
  const left = size ? stockOf(size) : 0;
  const soldOut = sizes.every((s) => stockOf(s) <= 0);
  const maxQty = Math.max(1, Math.min(10, left || 10));
  const wished = isWished(p.slug);
  const options: CartLine["options"] = isSaree || p.freeSize ? { blouse, fallPico } : undefined;

  const selectedSoldOut = !!size && stockOf(size) <= 0;
  const fit = p.freeSize ? null : savedFit(saved, region);

  const need = () => {
    if (size && stockOf(size) > 0) return true;
    setSizeErr(true);
    sizeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    return false;
  };
  const add = () => {
    if (!need()) return;
    addToCart(priced(p), size, options, Math.min(qty, maxQty));
  };
  const buy = () => {
    if (!need()) return;
    addToCart(priced(p), size, options, Math.min(qty, maxQty));
    router.push("/bag");
  };
  const closeGuide = useCallback(() => setGuide(false), []);
  const closeFinder = useCallback(() => setFinder(false), []);
  const pick = (s: string) => {
    setSize(s);
    setSizeErr(false);
    setFinder(false);
    setQty(1);
    setTimeout(() => sizeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 350);
  };

  return (
    <div className="buy">
      <div className="pdp-price">
        {eff.sale && (
          <span className="pdp-sale">
            {saleTag(eff.sale)} · ends {new Date(eff.sale.endsAt).toLocaleDateString(r.locale, { day: "numeric", month: "short" })}
          </span>
        )}
        <div className="price">
          <strong className={eff.sale ? "text-sale" : undefined}>{formatMoney(m.now, region)}</strong>
          {off > 0 && (
            <>
              <s>MRP {formatMoney(m.mrp, region)}</s>
              <span className="off">({off}% off)</span>
            </>
          )}
        </div>
        <small>{r.taxNote}{extra > 0 ? ` · includes ${formatMoney(extra, region)} for add-ons` : ""}</small>
        <PayLater amount={m.now} region={region} />
      </div>

      {(p.colour || p.fabric || p.origin) && (
        <ul className="pdp-chips">
          {p.colour && <li className="chip"><span className="dot" style={{ background: p.hex }} />{p.colour.replace(/^./, (c) => c.toUpperCase())}</li>}
          {p.fabric && <li className="chip">{p.fabric}</li>}
          {p.origin && <li className="chip"><Icon name="pin" />{p.origin}</li>}
        </ul>
      )}

      {p.freeSize ? (
        <div className="pdp-free" ref={sizeRef}>
          <Icon name="check" size={16} />
          <span>{p.blouseOptions ? "Free size · blouse piece included" : "One size"}</span>
        </div>
      ) : (
        <div className={`pdp-sizes${sizeErr ? " err" : ""}`} ref={sizeRef}>
          <div className="lab">
            <span className="h3">Select size{size ? `: ${size}` : ""}</span>
            <span className="lab-links">
              <button type="button" className="link" onClick={() => setFinder(true)}>Find my size</button>
              <button type="button" className="link" onClick={() => setGuide(true)}>
                <Icon name="ruler" size={15} /> Size guide
              </button>
            </span>
          </div>
          {fit && (
            <p className="sf-hint">
              Your size: <b>{bothLabels(fit.index, region)}</b>, from your saved measurements.{" "}
              {size !== sizeLabel(fit.index, region) && (
                <button type="button" className="link" onClick={() => pick(sizeLabel(fit.index, region))}>Select it</button>
              )}
            </p>
          )}
          <div className="opts" role="radiogroup" aria-label="Size">
            {sizes.map((s) => {
              const n = stockOf(s);
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={size === s}
                  aria-label={n <= 0 ? `${s}, sold out: get notified` : undefined}
                  className={n <= 0 ? "so" : undefined}
                  onClick={() => {
                    setSize(s);
                    setSizeErr(false);
                    setQty((q) => Math.min(q, Math.max(1, Math.min(10, n))));
                  }}
                  title={n <= 0 ? "Sold out: tap to get an email when it is back" : undefined}
                >
                  {s.replace("UK ", "")}
                  {n > 0 && n <= 3 && <em>{n} left</em>}
                </button>
              );
            })}
          </div>
          {sizeErr && (
            <p className="msg" role="alert">
              {selectedSoldOut ? "That size is sold out. Leave your email below and we'll tell you when it's back." : "Please select a size to continue."}
            </p>
          )}
          {region === "uk" && <p className="muted note">UK sizes. Each maps to our India size: UK 10 is an M.</p>}
        </div>
      )}

      {isSaree && (
        <fieldset className="pdp-opts">
          <legend className="h3">Blouse</legend>
          <label className={`opt-card${blouse === "unstitched" ? " on" : ""}`}>
            <input type="radio" name="blouse" checked={blouse === "unstitched"} onChange={() => setBlouse("unstitched")} />
            <span><b>Unstitched</b><small>0.8 m blouse piece, cut from the saree</small></span>
            <em>Included</em>
          </label>
          <label className={`opt-card${blouse === "stitched" ? " on" : ""}`}>
            <input type="radio" name="blouse" checked={blouse === "stitched"} onChange={() => setBlouse("stitched")} />
            <span><b>Stitched to measurement</b><small>Our tailor calls you for measurements after you order</small></span>
            <em>+ {formatMoney(r.blouseStitching, region)}</em>
          </label>
          <label className="check fp">
            <input type="checkbox" checked={fallPico} onChange={(e) => setFallPico(e.target.checked)} />
            <span>Fall &amp; pico done for you <b>+ {formatMoney(r.fallPico, region)}</b></span>
          </label>
        </fieldset>
      )}

      <div className="pdp-actions">
        <div className="qty" aria-label="Quantity">
          <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1}>
            <Icon name="minus" size={16} />
          </button>
          <output aria-live="polite">{qty}</output>
          <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} disabled={qty >= maxQty}>
            <Icon name="plus" size={16} />
          </button>
        </div>
        <button type="button" className="btn add" onClick={add} disabled={soldOut || selectedSoldOut}>
          <Icon name="bag" size={18} /> {soldOut || selectedSoldOut ? "Sold out" : "Add to bag"}
        </button>
        <button type="button" className="wishb" aria-pressed={wished} aria-label={wished ? "Remove from wishlist" : "Save to wishlist"} onClick={() => toggleWish(p.slug, "")}>
          <Icon name="heart" />
        </button>
        <button type="button" className="btn bronze block buy-now" onClick={buy} disabled={soldOut || selectedSoldOut}>
          Buy now
        </button>
      </div>

      {(soldOut || selectedSoldOut) && (
        <NotifyMe
          key={canonicalSize(size || sizes[0])}
          slug={p.slug}
          size={canonicalSize(size || sizes[0])}
          email={email}
          whole={soldOut}
        />
      )}

      <CompareToggle p={p} className="pdp-cmp" />

      <DeliveryCheck />

      {/* sticky mobile bar (AppBar hides itself on /p/ routes) */}
      <div className="pdp-sticky">
        <div className="price">
          <strong>{formatMoney(m.now, region)}</strong>
          {off > 0 && <span className="off">{off}% off</span>}
        </div>
        <button type="button" className="wishb" aria-pressed={wished} aria-label={wished ? "Remove from wishlist" : "Save to wishlist"} onClick={() => toggleWish(p.slug, "")}>
          <Icon name="heart" />
        </button>
        <button type="button" className="btn" onClick={add} disabled={soldOut || selectedSoldOut}>
          {soldOut || selectedSoldOut ? "Sold out" : size ? "Add to bag" : "Select size"}
        </button>
      </div>

      {!p.freeSize && (
        <>
          <Overlay open={guide} onClose={closeGuide} title="Size guide">
            <SizeGuide />
          </Overlay>
          <Overlay open={finder} onClose={closeFinder} title="Find my size">
            <SizeFinder category={p.category} region={region} signedIn={signedIn} saved={saved} stockOf={stockOf} onPick={pick} />
          </Overlay>
        </>
      )}
    </div>
  );
}

function SizeGuide() {
  const { region } = useStore();
  const [unit, setUnit] = useState<"in" | "cm">("in");
  const v = (n: number) => (unit === "in" ? n : Math.round(n * 2.54));
  return (
    <div className="sg">
      <p className="muted">Body measurements. If you are between sizes, pick the larger one: our kurtas have 1.5 inches of seam allowance.</p>
      <div className="sg-unit" role="radiogroup" aria-label="Units">
        <button type="button" role="radio" aria-checked={unit === "in"} onClick={() => setUnit("in")}>Inches</button>
        <button type="button" role="radio" aria-checked={unit === "cm"} onClick={() => setUnit("cm")}>Cm</button>
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th className={region === "in" ? "hl" : ""}>India</th>
              <th className={region === "uk" ? "hl" : ""}>UK</th>
              <th className="num">Bust</th>
              <th className="num">Waist</th>
              <th className="num">Hip</th>
            </tr>
          </thead>
          <tbody>
            {SIZE_CHART.map((row) => (
              <tr key={row.in}>
                <td className={region === "in" ? "hl" : ""}>{row.in}</td>
                <td className={region === "uk" ? "hl" : ""}>{row.uk.replace("UK ", "")}</td>
                <td className="num">{v(row.bust)}</td>
                <td className="num">{v(row.waist)}</td>
                <td className="num">{v(row.hip)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sg-how">
        <b className="h3">How to measure</b>
        <ul>
          <li><b>Bust:</b> around the fullest part, tape level under the arms.</li>
          <li><b>Waist:</b> around the narrowest part, usually just above the navel.</li>
          <li><b>Hip:</b> around the fullest part, feet together.</li>
        </ul>
        <p className="muted">Unsure? Book a free video styling call and we will help you choose.</p>
      </div>
    </div>
  );
}

function DeliveryCheck() {
  const { region } = useStore();
  const r = REGION_CONFIG[region];
  const [code, setCode] = useState("");
  const [res, setRes] = useState<{ ok: boolean; text: string; sub?: string } | null>(null);

  useEffect(() => {
    setRes(null);
    try {
      const saved = JSON.parse(localStorage.getItem(POST_KEY) || "{}") as Record<string, string>;
      setCode(saved[region] ?? "");
    } catch {
      setCode("");
    }
  }, [region]);

  const check = (e: React.FormEvent) => {
    e.preventDefault();
    const v = code.trim();
    if (!r.postPattern.test(v)) {
      setRes({ ok: false, text: `Enter a valid ${r.postLabel.toLowerCase()} (${r.postHint}).` });
      return;
    }
    const [a, b] = deliveryWindow(region);
    setRes({
      ok: true,
      text: `Delivery by ${shortDate(a, region)} – ${shortDate(b, region)}`,
      sub:
        region === "in"
          ? `Cash on delivery available (+ ${formatMoney(r.codFee, region)}) · Free shipping above ${formatMoney(r.freeShippingAt, region)}`
          : `Tracked courier, duties paid · Free delivery over ${formatMoney(r.freeShippingAt, region)}`,
    });
    try {
      const saved = JSON.parse(localStorage.getItem(POST_KEY) || "{}") as Record<string, string>;
      localStorage.setItem(POST_KEY, JSON.stringify({ ...saved, [region]: v.toUpperCase() }));
    } catch {}
  };

  return (
    <form className="dlv" onSubmit={check} noValidate>
      <label className="h3" htmlFor="dlv-code"><Icon name="truck" size={18} /> Delivery options</label>
      <div className="dlv-row">
        <input
          id="dlv-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={`Enter ${r.postLabel.toLowerCase()} (${r.postHint})`}
          inputMode={region === "in" ? "numeric" : "text"}
          autoComplete="postal-code"
          maxLength={region === "in" ? 6 : 8}
          aria-invalid={res && !res.ok ? true : undefined}
          aria-describedby="dlv-res"
        />
        <button type="submit" className="link">Check</button>
      </div>
      <div id="dlv-res" aria-live="polite">
        {res && (
          <p className={res.ok ? "ok" : "bad"}>
            {res.text}
            {res.sub && <small>{res.sub}</small>}
          </p>
        )}
      </div>
      <ul className="dlv-facts">
        <li><Icon name="back" size={16} /> {r.returnsDays}-day easy returns{region === "in" ? " with free pickup" : " with a prepaid label"}</li>
        {region === "in" ? <li><Icon name="cash" size={16} /> Cash on delivery available</li> : <li><Icon name="globe" size={16} /> Duties and VAT included</li>}
        <li><Icon name="box" size={16} /> Gift wrapping available at checkout</li>
      </ul>
    </form>
  );
}
