"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "../Icon";
import { useStore } from "../StoreProvider";
import { usePrice, useSalePriced, useSales } from "../SalesProvider";
import { effectivePrice, saleTag } from "@/lib/pricing";
import { canonicalSize, formatMoney, sizesFor } from "@/lib/region";
import { discountPct, type ProductDTO } from "@/lib/types";

function LookRow({ p, size, setSize, missing }: { p: ProductDTO; size: string; setSize: (s: string) => void; missing: boolean }) {
  const { region } = useStore();
  const m = usePrice(p);
  const off = discountPct(m);
  const sizes = sizesFor(p.freeSize, region);
  const stockOf = (s: string) => p.stock[canonicalSize(s)] ?? 0;
  const soldOut = sizes.every((s) => stockOf(s) <= 0);
  return (
    <li className="lk-row">
      <Link href={`/p/${p.slug}`} className="lk-pic mount">
        <Image src={p.images[0]} alt={p.name} fill sizes="(min-width:720px) 140px, 30vw" />
      </Link>
      <div className="lk-info">
        <span className="kick">{p.craft || p.fabric}</span>
        <Link href={`/p/${p.slug}`} className="lk-name">{p.name}</Link>
        <div className="price">
          <strong className={m.sale ? "text-sale" : undefined}>{formatMoney(m.now, region)}</strong>
          {off > 0 && <><s>{formatMoney(m.mrp, region)}</s><span className="off">{m.sale ? saleTag(m.sale) : `(${off}% off)`}</span></>}
        </div>
        {soldOut ? (
          <p className="lk-out">Sold out for now. <Link className="link" href={`/p/${p.slug}`}>Get notified</Link></p>
        ) : p.freeSize ? (
          <p className="lk-free"><Icon name="check" size={14} /> Free size, blouse piece included</p>
        ) : (
          <div className={`lk-sizes${missing ? " err" : ""}`} role="radiogroup" aria-label={`Size for ${p.name}`}>
            {sizes.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={size === s} disabled={stockOf(s) <= 0} onClick={() => setSize(s)}>
                {s.replace("UK ", "")}
              </button>
            ))}
            {missing && <span className="msg" role="alert">Choose a size</span>}
          </div>
        )}
      </div>
    </li>
  );
}

/** Product list for a curated look with one "add everything" button. Sold-out pieces are skipped. */
export function LookBuilder({ products }: { products: ProductDTO[] }) {
  const { region, addToCart, toast } = useStore();
  const sales = useSales();
  const priced = useSalePriced();
  const [sizes, setSizes] = useState<Record<string, string>>({});
  const [tried, setTried] = useState(false);

  const available = products.filter((p) => sizesFor(p.freeSize, region).some((s) => (p.stock[canonicalSize(s)] ?? 0) > 0));
  const chosen = (p: ProductDTO) => (p.freeSize ? sizesFor(true, region)[0] : sizes[p.slug] ?? "");
  const missing = available.filter((p) => !chosen(p));
  const total = available.reduce((sum, p) => sum + effectivePrice(p, region, sales).now, 0);

  const addAll = () => {
    setTried(true);
    if (missing.length) return;
    for (const p of available) addToCart(priced(p), chosen(p), p.freeSize ? { blouse: "unstitched", fallPico: false } : undefined);
    toast({ text: `Added ${available.length} piece${available.length > 1 ? "s" : ""} to your bag`, image: available[0]?.images[0], href: "/bag", cta: "View bag" });
  };

  return (
    <div className="lk">
      <ul className="lk-list">
        {products.map((p) => (
          <LookRow key={p.slug} p={p} size={sizes[p.slug] ?? ""} setSize={(s) => setSizes((x) => ({ ...x, [p.slug]: s }))} missing={tried && missing.includes(p)} />
        ))}
      </ul>
      <div className="lk-foot">
        <div>
          <span className="muted">{available.length} piece{available.length === 1 ? "" : "s"} · together</span>
          <b>{formatMoney(Math.round(total * 100) / 100, region)}</b>
        </div>
        <button type="button" className="btn block" onClick={addAll} disabled={!available.length}>
          <Icon name="bag" size={18} /> Add the whole look to bag
        </button>
        {tried && missing.length > 0 && <p className="notice err" role="alert">Pick a size for {missing.map((p) => p.name).join(" and ")}.</p>}
        <small className="muted">Each piece is priced as usual; prices are confirmed in your bag. You can remove anything you already own.</small>
      </div>
    </div>
  );
}
