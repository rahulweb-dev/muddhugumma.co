import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo-meta";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { LookBuilder } from "@/components/content/LookBuilder";
import { getBundle, getProductsBySlugs } from "@/lib/queries";
import "@/styles/product.css";

type Params = Promise<{ slug: string }>;
const load = cache((slug: string) => getBundle(slug));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const b = await load((await params).slug);
  if (!b) return { title: "Look not found" };
  return pageMeta({
    title: `${b.name} · Shop the look`,
    description: b.description || `A look put together by our stylists: ${b.name}.`,
    path: `/look/${b.slug}`,
    kicker: "Shop the look",
    image: b.image || undefined,
  });
}

export default async function LookPage({ params }: { params: Params }) {
  const b = await load((await params).slug);
  if (!b) notFound();
  const products = await getProductsBySlugs(b.productSlugs);
  if (!products.length) notFound();
  const hero = b.image || products[0].images[0];
  return (
    <div className="pad pb-16">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span><Link href="/look">Shop the look</Link></span>
        <span aria-current="page">{b.name}</span>
      </nav>
      <div className="lk-top">
        <div className="mount arch lk-hero">
          <Image src={hero} alt={b.name} fill priority sizes="(min-width:900px) 42vw, 100vw" />
        </div>
        <div className="lk-copy">
          <span className="kick">Shop the look · {products.length} pieces</span>
          <h1 className="h1">{b.name}</h1>
          {b.description && <p className="lk-desc">{b.description}</p>}
          <LookBuilder products={products} />
        </div>
      </div>
    </div>
  );
}
