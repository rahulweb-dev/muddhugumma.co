"use client";
import { useState } from "react";
import { Icon } from "../Icon";
import type { CouponState, GiftCardState } from "./hooks";
import { emiNote, type Totals } from "@/lib/checkout-pricing";
import { REGION_CONFIG, formatMoney, type Region } from "@/lib/region";

/** Price breakdown: MRP, discounts, points, delivery, gift wrap, COD fee, gift card, total, pay now / on delivery, savings and tax note. */
export function PriceSummary({
  t,
  region,
  couponCode,
  giftCardCode,
  showEmi = true,
  partCod = false,
}: {
  t: Totals;
  region: Region;
  couponCode?: string;
  giftCardCode?: string;
  showEmi?: boolean;
  /** Part-paid COD is chosen: show the split. */
  partCod?: boolean;
}) {
  const f = (n: number) => formatMoney(n, region);
  const emi = showEmi && !t.coveredByGiftCard ? emiNote(t.total, region) : null;
  return (
    <div className="co-sum">
      <h2 className="h3">Price details <span className="muted">({t.count} {t.count === 1 ? "item" : "items"})</span></h2>
      <dl>
        <div><dt>Bag total (MRP)</dt><dd>{f(t.mrpTotal)}</dd></div>
        {t.mrpDiscount > 0 && <div className="save"><dt>Discount on MRP</dt><dd>−{f(t.mrpDiscount)}</dd></div>}
        {t.coupon > 0 && <div className="save"><dt>Coupon{couponCode ? ` (${couponCode})` : ""}</dt><dd>−{f(t.coupon)}</dd></div>}
        {t.prepaid > 0 && <div className="save"><dt>Online payment discount</dt><dd>−{f(t.prepaid)}</dd></div>}
        {t.loyalty > 0 && <div className="save"><dt>Points used ({t.loyaltyPoints.toLocaleString()})</dt><dd>−{f(t.loyalty)}</dd></div>}
        <div><dt>Delivery</dt><dd>{t.shipping > 0 ? f(t.shipping) : <span className="free">Free</span>}</dd></div>
        {t.giftWrap > 0 && <div><dt>Gift wrap</dt><dd>{f(t.giftWrap)}</dd></div>}
        {t.codFee > 0 && <div><dt>Cash on delivery fee</dt><dd>{f(t.codFee)}</dd></div>}
        {t.giftCard > 0 && (
          <>
            <div><dt>Order value</dt><dd>{f(t.gross)}</dd></div>
            <div className="save"><dt>Gift card{giftCardCode ? ` (${giftCardCode})` : ""}</dt><dd>−{f(t.giftCard)}</dd></div>
          </>
        )}
        <div className="tot"><dt>{t.giftCard > 0 ? "To pay" : "Order total"}</dt><dd>{f(t.total)}</dd></div>
        {partCod && t.dueOnDelivery > 0 && (
          <>
            <div className="co-split"><dt>Pay now (online)</dt><dd>{f(t.payNow)}</dd></div>
            <div className="co-split"><dt>Pay on delivery</dt><dd>{f(t.dueOnDelivery)}</dd></div>
          </>
        )}
      </dl>
      {t.coveredByGiftCard && <p className="co-savings">Your gift card covers this order</p>}
      {t.savings > 0 && <p className="co-savings">You save {f(t.savings)} on this order</p>}
      {emi && <p className="co-emi"><Icon name="cash" size={15} /> {emi}</p>}
      <p className="co-tax">{REGION_CONFIG[region].taxNote}</p>
    </div>
  );
}

export function CouponBox({ c }: { c: CouponState }) {
  const [val, setVal] = useState("");
  const applied = c.code && c.result?.ok ? c.result : null;
  return (
    <div className="co-coupon">
      <h2 className="h3"><Icon name="tag" size={16} /> Coupons</h2>
      {c.code ? (
        <div className={`co-applied${applied ? "" : " bad"}`}>
          <div>
            <b>{c.code}</b>
            <span>{applied ? applied.description || "Applied" : c.invalid || "Checking…"}</span>
            {applied?.note && <small>{applied.note}</small>}
          </div>
          <button type="button" className="link" onClick={c.remove}>Remove</button>
        </div>
      ) : (
        <form
          className="co-cform"
          onSubmit={(e) => {
            e.preventDefault();
            c.apply(val);
          }}
        >
          <label className="sr-only" htmlFor="co-coupon">Coupon code</label>
          <input
            id="co-coupon"
            value={val}
            onChange={(e) => setVal(e.target.value.toUpperCase())}
            placeholder="Enter coupon code"
            autoComplete="off"
            autoCapitalize="characters"
            aria-invalid={c.error ? true : undefined}
            aria-describedby={c.error ? "co-coupon-err" : undefined}
          />
          <button type="submit" disabled={c.busy}>{c.busy ? "…" : "Apply"}</button>
        </form>
      )}
      {c.error && <p className="co-cerr" id="co-coupon-err" role="alert">{c.error}</p>}
    </div>
  );
}

export function GiftCardBox({ g, region, used }: { g: GiftCardState; region: Region; used: number }) {
  const [val, setVal] = useState("");
  const f = (n: number) => formatMoney(n, region);
  return (
    <div className="co-coupon">
      <h2 className="h3"><Icon name="box" size={16} /> Gift card</h2>
      {g.card ? (
        <div className="co-applied">
          <div>
            <b>{g.card.code}</b>
            <span>{used > 0 ? `${f(used)} used from ${f(g.card.balance)}` : `Balance ${f(g.card.balance)}`}</span>
            {g.card.balance - used > 0 && used > 0 && <small>{f(g.card.balance - used)} stays on the card{g.card.expires ? ` (valid until ${g.card.expires})` : ""}</small>}
          </div>
          <button type="button" className="link" onClick={g.remove}>Remove</button>
        </div>
      ) : (
        <form
          className="co-cform"
          onSubmit={(e) => {
            e.preventDefault();
            g.apply(val);
          }}
        >
          <label className="sr-only" htmlFor="co-giftcard">Gift card code</label>
          <input
            id="co-giftcard"
            value={val}
            onChange={(e) => setVal(e.target.value.toUpperCase())}
            placeholder="MG-XXXX-XXXX"
            autoComplete="off"
            autoCapitalize="characters"
            aria-invalid={g.error ? true : undefined}
            aria-describedby={g.error ? "co-giftcard-err" : undefined}
          />
          <button type="submit" disabled={g.busy}>{g.busy ? "…" : "Apply"}</button>
        </form>
      )}
      {g.error && <p className="co-cerr" id="co-giftcard-err" role="alert">{g.error}</p>}
    </div>
  );
}
