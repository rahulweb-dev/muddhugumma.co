import Image from "next/image";
import Link from "next/link";
import type { BundleDTO } from "@/lib/queries";
import type { ProductDTO } from "@/lib/types";

/** Card for a curated look (bundle): hero image, name and the pieces in it. */
export function LookCard({ b, products, current }: { b: BundleDTO; products: ProductDTO[]; current?: string }) {
  const pieces = b.productSlugs.map((s) => products.find((p) => p.slug === s)).filter((p): p is ProductDTO => !!p);
  const hero = b.image || pieces[0]?.images[0] || "brand/logo.webp";
  return (
    <Link href={`/look/${b.slug}`} className="lkc">
      <div className="mount lkc-pic">
        <Image src={hero} alt={b.name} fill sizes="(min-width:900px) 30vw, (min-width:480px) 45vw, 90vw" />
      </div>
      <div className="lkc-copy">
        <span className="kick">{pieces.length} piece{pieces.length === 1 ? "" : "s"} · styled together</span>
        <b>{b.name}</b>
        {b.description && <p>{b.description.length > 140 ? `${b.description.slice(0, 137).trimEnd()}…` : b.description}</p>}
        <ul className="lkc-thumbs" aria-label="Pieces in this look">
          {pieces.slice(0, 4).map((p) => (
            <li key={p.slug} className={p.slug === current ? "cur" : undefined} title={p.name}>
              <Image src={p.images[0]} alt={p.name} fill sizes="48px" />
            </li>
          ))}
        </ul>
        <span className="link">Shop the look</span>
      </div>
    </Link>
  );
}

/** PDP section: curated looks that include this product. */
export function CompleteThisLook({ bundles, products, current }: { bundles: BundleDTO[]; products: ProductDTO[]; current: string }) {
  return (
    <section className="pdp-sec pad" aria-labelledby="ctl-h">
      <div className="sec-head">
        <div><span className="kick">Shop the look</span><h2 className="h2" id="ctl-h">Complete <i>this look</i></h2></div>
        <Link className="link" href="/look">All looks</Link>
      </div>
      <div className="lkc-grid">
        {bundles.map((b) => <LookCard key={b.slug} b={b} products={products} current={current} />)}
      </div>
    </section>
  );
}
