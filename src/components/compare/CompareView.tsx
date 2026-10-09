"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { useStore } from "../StoreProvider";
import { useSales } from "../SalesProvider";
import { useCompare } from "./CompareProvider";
import { getCompareProducts } from "@/lib/actions/catalog";
import { effectivePrice, saleTag } from "@/lib/pricing";
import { REGION_CONFIG, canonicalSize, deliveryWindow, formatMoney, shortDate, sizesFor } from "@/lib/region";
import { categoryLabel, discountPct, type ProductDTO } from "@/lib/types";

const cap = (s: string) => s.replace(/(^|\s)\S/g, (c) => c.toUpperCase());

export function CompareView() {
  const c = useCompare();
  const sales = useSales();
  const { region } = useStore();
  const [products, setProducts] = useState<ProductDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const slugs = c?.items.map((i) => i.slug) ?? [];
  const key = slugs.join(",");

  useEffect(() => {
    if (!c) return;
    if (!slugs.length) {
      const t = setTimeout(() => setProducts([]), 200);
      return () => clearTimeout(t);
    }
    let live = true;
    setLoading(true);
    getCompareProducts(slugs)
      .then((list) => live && setProducts(list))
      .catch(() => live && setProducts([]))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!c) return null;
  if (products === null || (loading && !slugs.every((s) => products.some((p) => p.slug === s)))) return <div className="cmp-skel skel" aria-busy="true" aria-label="Loading comparison" />;
  const list = slugs.map((s) => products.find((p) => p.slug === s)).filter((p): p is ProductDTO => !!p);

  if (!list.length)
    return (
      <div className="empty">
        <Icon name="grid" size={34} />
        <h2 className="h2">Nothing to <i>compare yet</i></h2>
        <p>Tick “Compare” on up to three sarees, kurta sets or lehengas to see fabric, craft, sizes and delivery side by side.</p>
        <div className="cta-row">
          <Link className="btn" href="/c/sarees">Browse sarees</Link>
          <Link className="btn ghost" href="/c/all">Shop all</Link>
        </div>
      </div>
    );

  const [from, to] = deliveryWindow(region);
  const rows: { label: string; cell: (p: ProductDTO) => React.ReactNode }[] = [
    {
      label: "Price",
      cell: (p) => {
        const m = effectivePrice(p, region, sales);
        const off = discountPct(m);
        return (
          <div className="price">
            <strong className={m.sale ? "text-sale" : undefined}>{formatMoney(m.now, region)}</strong>
            {off > 0 && <><s>{formatMoney(m.mrp, region)}</s><span className="off">{m.sale ? saleTag(m.sale) : `${off}% off`}</span></>}
          </div>
        );
      },
    },
    { label: "Category", cell: (p) => categoryLabel(p.category) },
    { label: "Fabric", cell: (p) => p.fabric },
    { label: "Craft", cell: (p) => p.craft || "—" },
    { label: "Origin", cell: (p) => p.origin || "—" },
    { label: "Colour", cell: (p) => <span className="inline-flex items-center gap-2"><span className="dot" style={{ background: p.hex }} />{cap(p.colour)}</span> },
    { label: "Occasions", cell: (p) => (p.occasions.length ? p.occasions.map(cap).join(", ") : "—") },
    {
      label: "Sizes in stock",
      cell: (p) => {
        const sizes = sizesFor(p.freeSize, region);
        const ok = sizes.filter((s) => (p.stock[canonicalSize(s)] ?? 0) > 0);
        if (p.freeSize) return ok.length ? "Free size, blouse piece included" : <span className="text-sale">Sold out</span>;
        return ok.length ? ok.map((s) => s.replace("UK ", "")).join(" · ") + (region === "uk" ? " (UK)" : "") : <span className="text-sale">Sold out</span>;
      },
    },
    { label: "Care", cell: (p) => p.care || "—" },
    { label: "Rating", cell: (p) => (p.ratingCount > 0 ? <span className="rate">{p.rating.toFixed(1)} ★ <span>| {p.ratingCount}</span></span> : "Not rated yet") },
    { label: "Delivery", cell: () => `${shortDate(from, region)} – ${shortDate(to, region)}${region === "in" ? ", COD available" : ", duties included"}` },
  ];

  return (
    <>
      <p className="muted m-0">{list.length < 3 ? `Add ${3 - list.length === 1 ? "one more piece" : "up to two more pieces"} from any listing to compare.` : "Comparing three pieces."} Prices in {REGION_CONFIG[region].currency}.</p>
      <div className="table-wrap cmp-wrap">
        <table className="t cmp">
          <caption className="sr-only">Comparison of {list.map((p) => p.name).join(", ")}</caption>
          <thead>
            <tr>
              <td />
              {list.map((p) => (
                <th key={p.slug} scope="col">
                  <div className="cmp-head">
                    <Link href={`/p/${p.slug}`} className="mount cmp-pic">
                      <Image src={p.images[0]} alt="" fill sizes="(min-width:900px) 220px, 30vw" />
                    </Link>
                    <Link href={`/p/${p.slug}`} className="cmp-name">{p.name}</Link>
                    <button type="button" className="cmp-rm" onClick={() => c.remove(p.slug)} aria-label={`Remove ${p.name} from compare`}>
                      <Icon name="x" size={12} /> Remove
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                {list.map((p) => <td key={p.slug}>{r.cell(p)}</td>)}
              </tr>
            ))}
            <tr>
              <th scope="row"><span className="sr-only">Actions</span></th>
              {list.map((p) => (
                <td key={p.slug}><Link className="btn ghost cmp-go" href={`/p/${p.slug}`}>View &amp; buy</Link></td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="cta-row justify-start!">
        <button type="button" className="link" onClick={c.clear}>Clear comparison</button>
      </div>
    </>
  );
}
