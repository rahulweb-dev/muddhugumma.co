"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useStore } from "./StoreProvider";
import { usePrice, useSalePriced } from "./SalesProvider";
import { CompareToggle } from "./compare/CompareProvider";
import { canonicalSize, formatMoney, sizesFor } from "@/lib/region";
import { saleTag } from "@/lib/pricing";
import { discountPct, type ProductDTO } from "@/lib/types";

/** "Add to bag" under the card: one tap for free-size pieces, a size picker above the button otherwise. Works on touch. */
function QuickBag({ p, sizes, inStock, onAdd }: { p: ProductDTO; sizes: string[]; inStock: (s: string) => boolean; onAdd: (size: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const soldOut = !sizes.some(inStock);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const click = () => {
    if (p.freeSize) onAdd(sizes[0]);
    else setOpen((o) => !o);
  };
  return (
    <div className="qb" ref={box}>
      {open && (
        <div className="qb-pick" role="group" aria-label={`Choose a size for ${p.name}`}>
          <small>Select size</small>
          <div>
            {sizes.map((s) => (
              <button
                key={s}
                type="button"
                disabled={!inStock(s)}
                onClick={() => {
                  onAdd(s);
                  setOpen(false);
                }}
              >
                {s.replace("UK ", "")}
              </button>
            ))}
          </div>
        </div>
      )}
      <button type="button" className="qb-btn" onClick={click} disabled={soldOut} aria-expanded={p.freeSize ? undefined : open} aria-label={soldOut ? `${p.name} is sold out` : `Add ${p.name} to bag`}>
        {!soldOut && <Icon name="bag" size={15} />}
        {soldOut ? "Sold out" : "Add to bag"}
      </button>
    </div>
  );
}

export function ProductCard({ p, priority = false, compare = true, bag = false }: { p: ProductDTO; priority?: boolean; compare?: boolean; bag?: boolean }) {
  const { region, isWished, toggleWish, addToCart } = useStore();
  const m = usePrice(p);
  const priced = useSalePriced();
  const off = discountPct(m);
  const href = `/p/${p.slug}`;
  const wished = isWished(p.slug);
  const sizes = sizesFor(p.freeSize, region);
  const inStock = (s: string) => (p.stock[canonicalSize(s)] ?? 0) > 0;
  return (
    <article className={`pc${bag ? " has-bag" : ""}`}>
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
        <button className="wish" aria-label={wished ? `Remove ${p.name} from wishlist` : `Save ${p.name} to wishlist`} aria-pressed={wished} onClick={() => toggleWish(p.slug, "")}>
          <Icon name="heart" />
        </button>
        <div className="sizes">
          <small>Quick add · select size</small>
          <div>
            {sizes.map((s) => (
              <button
                key={s}
                type="button"
                disabled={!inStock(s)}
                onClick={() => addToCart(priced(p), s, p.freeSize ? { blouse: "unstitched", fallPico: false } : undefined)}
              >
                {s.replace("UK ", "")}
              </button>
            ))}
          </div>
        </div>
      </div>
      <Link className="meta" href={href}>
        <span className="brand">Muddhugumma</span>
        <span className="nm">{p.name}</span>
        <div className="price">
          <strong className={m.sale ? "text-sale" : undefined}>{formatMoney(m.now, region)}</strong>
          {off > 0 && (
            <>
              <s>{formatMoney(m.mrp, region)}</s>
              <span className="off">({off}% off)</span>
            </>
          )}
        </div>
        <div className="row">
          {p.ratingCount > 0 ? (
            <span className="rate">
              {p.rating.toFixed(1)} ★ <span>| {p.ratingCount}</span>
            </span>
          ) : <span />}
          <span className="dot" style={{ background: p.hex }} title={p.colour} />
        </div>
      </Link>
      {bag && <QuickBag p={p} sizes={sizes} inStock={inStock} onAdd={(s) => addToCart(priced(p), s, p.freeSize ? { blouse: "unstitched", fallPico: false } : undefined)} />}
      {compare && <CompareToggle p={p} />}
    </article>
  );
}
