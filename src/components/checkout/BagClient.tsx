"use client";
import Link from "next/link";
import Image from "next/image";
import { Icon } from "../Icon";
import { ProductCard } from "../ProductCard";
import { useStore } from "../StoreProvider";
import { useCartReady, useCoupon, useLivePrices } from "./hooks";
import { CouponBox, PriceSummary } from "./Summary";
import { Steps } from "./Steps";
import { bagTotals, optionLabels, optionsPrice } from "@/lib/checkout-pricing";
import { REGION_CONFIG, formatMoney } from "@/lib/region";
import type { CartLine, ProductDTO } from "@/lib/types";
import type { ActiveSale } from "@/lib/pricing";

export function BagClient({ suggestions, sales = [] }: { suggestions: ProductDTO[]; sales?: ActiveSale[] }) {
  const { region, cart, updateQty, removeLine, isWished, toggleWish, toast } = useStore();
  const ready = useCartReady();
  const { lines } = useLivePrices(cart, sales);
  const base = bagTotals(lines, region);
  const coupon = useCoupon(region, base.subtotal);
  const t = bagTotals(lines, region, coupon.discount);
  const r = REGION_CONFIG[region];
  const f = (n: number) => formatMoney(n, region);
  const inBag = new Set(cart.map((l) => l.slug));
  const more = suggestions.filter((p) => !inBag.has(p.slug)).slice(0, 8);

  const moveToWishlist = (l: CartLine) => {
    if (!isWished(l.slug)) toggleWish(l.slug, l.name);
    else toast({ text: "Already in your wishlist", href: "/wishlist", cta: "View" });
    removeLine(l.key);
  };

  if (!ready) {
    return (
      <div className="co-page pad wrap" aria-busy="true">
        <div className="co-head"><h1 className="h1">Shopping <i className="serif">bag</i></h1></div>
        <div className="co-skel" />
      </div>
    );
  }

  if (!cart.length) {
    return (
      <div className="co-page pad wrap">
        <div className="empty">
          <Icon name="bag" size={40} />
          <h1 className="h2">Your bag is <i>empty</i></h1>
          <p>Sarees, kurta sets and lehengas you add will wait here. Pieces saved to your wishlist are one tap away.</p>
          <div className="co-empty-cta">
            <Link className="btn" href="/c/new">Shop new arrivals</Link>
            <Link className="btn ghost" href="/wishlist">View wishlist</Link>
          </div>
        </div>
        {more.length > 0 && <Rail items={more} />}
      </div>
    );
  }

  const left = Math.max(0, r.freeShippingAt - t.subtotal);
  const pct = Math.min(100, Math.round((t.subtotal / r.freeShippingAt) * 100));

  return (
    <div className="co-page pad wrap">
      <Steps current={0} />
      <div className="co-head">
        <h1 className="h1">Shopping <i className="serif">bag</i></h1>
        <span className="muted">{t.count} {t.count === 1 ? "item" : "items"}</span>
      </div>

      <div className="co-layout">
        <section className="co-main" aria-label="Items in your bag">
          <div className="co-ship" role="status">
            <Icon name="truck" />
            <div>
              {left > 0 ? (
                <p>Add <b>{f(left)}</b> more for free delivery</p>
              ) : (
                <p><b>You&apos;ve unlocked free delivery</b></p>
              )}
              <div className="co-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
            </div>
          </div>

          <ul className="co-lines">
            {lines.map((l) => {
              const m = l.price[region];
              const opt = optionsPrice(l.options, region);
              const unit = m.now + opt;
              const mrp = Math.max(m.mrp || 0, m.now) + opt;
              const off = mrp > unit ? Math.round((1 - unit / mrp) * 100) : 0;
              return (
                <li className="co-line" key={l.key}>
                  <Link className="mount co-img" href={`/p/${l.slug}`} tabIndex={-1} aria-hidden="true">
                    <Image src={l.image} alt="" fill sizes="(min-width:720px) 120px, 96px" />
                  </Link>
                  <div className="co-info">
                    <span className="co-brand">Muddhugumma</span>
                    <Link className="co-name" href={`/p/${l.slug}`}>{l.name}</Link>
                    <div className="co-meta">
                      <span>Size: <b>{l.size}</b></span>
                      {l.options && (
                        <>
                          <span>{optionLabels(l.options)[0]}{l.options.blouse === "stitched" ? ` (+${f(r.blouseStitching)})` : ""}</span>
                          {l.options.fallPico && <span>Fall &amp; pico (+{f(r.fallPico)})</span>}
                        </>
                      )}
                    </div>
                    <div className="price">
                      <strong>{f(unit)}</strong>
                      {off > 0 && (
                        <>
                          <s>{f(mrp)}</s>
                          <span className="off">({off}% off)</span>
                          {l.sale && <span className="co-salet">{l.sale.name}</span>}
                        </>
                      )}
                    </div>
                    <div className="co-row">
                      <div className="co-qty" role="group" aria-label={`Quantity for ${l.name}`}>
                        <button type="button" onClick={() => updateQty(l.key, l.qty - 1)} disabled={l.qty <= 1} aria-label="Decrease quantity">
                          <Icon name="minus" size={14} />
                        </button>
                        <output aria-live="polite">{l.qty}</output>
                        <button type="button" onClick={() => updateQty(l.key, l.qty + 1)} disabled={l.qty >= 10} aria-label="Increase quantity">
                          <Icon name="plus" size={14} />
                        </button>
                      </div>
                      {l.qty > 1 && <span className="co-ltot">{f(unit * l.qty)}</span>}
                    </div>
                    <div className="co-acts">
                      <button type="button" onClick={() => moveToWishlist(l)}><Icon name="heart" size={15} /> Move to wishlist</button>
                      <button type="button" onClick={() => removeLine(l.key)}><Icon name="trash" size={15} /> Remove</button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <ul className="co-assure">
            <li><Icon name="back" /> {r.returnsDays}-day easy returns</li>
            <li><Icon name="lock" /> Secure payments</li>
            {region === "in" ? <li><Icon name="cash" /> Cash on delivery available</li> : <li><Icon name="globe" /> Duties included</li>}
          </ul>
        </section>

        <aside className="co-side" aria-label="Order summary">
          <CouponBox c={coupon} />
          <PriceSummary t={t} region={region} couponCode={coupon.discount ? coupon.code : undefined} />
          <Link className="btn block co-desk-cta" href="/checkout">Checkout <Icon name="chevR" size={16} /></Link>
        </aside>
      </div>

      {more.length > 0 && <Rail items={more} />}

      <div className="co-mbar co-mbar-app">
        <div>
          <b>{f(t.total)}</b>
          {t.savings > 0 ? <small>You save {f(t.savings)}</small> : <small>{r.taxNote}</small>}
        </div>
        <Link className="btn" href="/checkout">Checkout</Link>
      </div>
    </div>
  );
}

function Rail({ items }: { items: ProductDTO[] }) {
  return (
    <section className="co-rail">
      <div className="sec-head"><div><span className="kick">Handpicked for you</span><h2 className="h2">You may <i>also like</i></h2></div></div>
      <div className="rail">
        {items.map((p) => <ProductCard key={p.slug} p={p} />)}
      </div>
    </section>
  );
}
