"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { useStore } from "./StoreProvider";
import { usePrice, useSalePriced } from "./SalesProvider";
import { CompareToggle } from "./compare/CompareProvider";
import { ShareButton } from "./product/ShareButton";
import { canonicalSize, formatMoney, sizesFor } from "@/lib/region";
import { saleTag } from "@/lib/pricing";
import { discountPct, type ProductDTO } from "@/lib/types";

/** "Only N left" when a piece is down to its last few in this store. */
const LOW_LEFT = 3;

/**
 * Product card: photo with wishlist + share, name, price, the sizes right on the card and Add to bag.
 * Free-size pieces add in one tap; sized pieces take a size tap first (sold-out sizes are crossed out).
 */
export function ProductCard({ p, priority = false, compare = true }: { p: ProductDTO; priority?: boolean; compare?: boolean }) {
  const { region, isWished, toggleWish, addToCart } = useStore();
  const m = usePrice(p);
  const priced = useSalePriced();
  const off = discountPct(m);
  const href = `/p/${p.slug}`;
  const wished = isWished(p.slug);
  const sizes = sizesFor(p.freeSize, region);
  const left = (s: string) => p.stock[canonicalSize(s)] ?? 0;
  const total = sizes.reduce((n, s) => n + Math.max(0, left(s)), 0);
  const soldOut = total <= 0;

  const [size, setSize] = useState(p.freeSize ? sizes[0] : "");
  const [needSize, setNeedSize] = useState(false);
  const [added, setAdded] = useState(false);
  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(false), 2200);
    return () => clearTimeout(t);
  }, [added]);

  const add = () => {
    if (soldOut) return;
    if (!size) {
      setNeedSize(true);
      return;
    }
    addToCart(priced(p), size, p.freeSize ? { blouse: "unstitched", fallPico: false } : undefined);
    setAdded(true);
  };

  return (
    <article className="pc">
      <div className="ph">
        <Image className="main" src={p.images[0]} alt={p.name} fill sizes="(min-width:900px) 25vw, 50vw" priority={priority} />
        {p.images[1] && <Image className="alt" src={p.images[1]} alt="" fill sizes="(min-width:900px) 25vw, 50vw" />}
        <Link className="phl" href={href} aria-label={p.name} />
        {m.sale ? (
          <span className="tag sale">{saleTag(m.sale)}</span>
        ) : off ? (
          <span className="tag sale">{off}% off</span>
        ) : p.tag ? (
          <span className="tag">{p.tag}</span>
        ) : null}
        {soldOut ? <span className="pc-left out">Sold out</span> : total <= LOW_LEFT ? <span className="pc-left">Only {total} left</span> : null}
        <div className="pc-acts">
          <button className="wish" aria-label={wished ? `Remove ${p.name} from wishlist` : `Save ${p.name} to wishlist`} aria-pressed={wished} onClick={() => toggleWish(p.slug, "")}>
            <Icon name="heart" />
          </button>
          <ShareButton compact slug={p.slug} name={p.name} price={formatMoney(m.now, region)} />
        </div>
      </div>

      <div className="pc-body">
        <Link className="pc-nm" href={href}>{p.name}</Link>
        <div className="price">
          <strong className={m.sale ? "text-sale" : undefined}>{formatMoney(m.now, region)}</strong>
          {off > 0 && (
            <>
              <s>{formatMoney(m.mrp, region)}</s>
              <span className="off">({off}% off)</span>
            </>
          )}
          {p.ratingCount > 0 && <span className="pc-rate" aria-label={`Rated ${p.rating.toFixed(1)} out of 5`}>★ {p.rating.toFixed(1)}</span>}
        </div>

        {p.freeSize ? (
          <span className="pc-free">Free size</span>
        ) : (
          <div className={`pc-sizes${needSize ? " need" : ""}`} role="radiogroup" aria-label={`Size for ${p.name}`}>
            {sizes.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={size === s}
                disabled={left(s) <= 0}
                aria-label={left(s) > 0 ? `Size ${s}` : `Size ${s}, sold out`}
                onClick={() => {
                  setSize(s);
                  setNeedSize(false);
                }}
              >
                {s.replace("UK ", "")}
              </button>
            ))}
          </div>
        )}
        {needSize && <small className="pc-hint" role="alert">Choose a size first</small>}

        <button type="button" className={`pc-add${added ? " done" : ""}`} onClick={add} disabled={soldOut}>
          {soldOut ? "Sold out" : added ? <><Icon name="check" size={15} /> Added</> : <><Icon name="bag" size={15} /> Add to bag</>}
        </button>
        {compare && <CompareToggle p={p} />}
      </div>
    </article>
  );
}
