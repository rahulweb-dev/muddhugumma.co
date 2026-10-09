import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ProductCard } from "@/components/ProductCard";
import { getLookbook, getProductsBySlugs, listLookbooks } from "@/lib/queries";
import "@/styles/home.css";

type Params = Promise<{ slug: string }>;
const load = cache((slug: string) => getLookbook(slug));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const b = await load((await params).slug);
  if (!b) return { title: "Lookbook not found" };
  return {
    title: `${b.title}`,
    description: (b.intro || `${b.title}: our ${b.festival || "festival"} lookbook.`).replace(/\s+/g, " ").slice(0, 158),
    alternates: { canonical: `/lookbook/${b.slug}` },
  };
}

export default async function LookbookPage({ params }: { params: Params }) {
  const b = await load((await params).slug);
  if (!b) notFound();
  const [products, all] = await Promise.all([getProductsBySlugs(b.productSlugs), listLookbooks()]);
  const others = all.filter((x) => x.slug !== b.slug).slice(0, 3);
  return (
    <div className="pb-16">
      <nav className="crumbs pad" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span><Link href="/lookbook">Lookbooks</Link></span>
        <span aria-current="page">{b.title}</span>
      </nav>
      <header className="lb-hero pad">
        <div className="mount lb-hero-pic">
          {b.hero && <Image src={b.hero} alt="" fill priority sizes="(min-width:900px) 55vw, 100vw" />}
        </div>
        <div className="lb-hero-copy">
          <span className="kick">{b.festival || "Lookbook"}</span>
          <h1 className="h1">{b.title}</h1>
          {b.intro.split(/\n+/).filter(Boolean).map((para, i) => <p key={i}>{para}</p>)}
          <span className="lb-count">{products.length} piece{products.length === 1 ? "" : "s"} in this edit</span>
        </div>
      </header>
      <section className="pad mt-10" aria-label="Pieces in this lookbook">
        {products.length ? (
          <div className="pgrid g3">{products.map((p, i) => <ProductCard key={p.slug} p={p} priority={i < 3} />)}</div>
        ) : (
          <p className="muted">These pieces have sold through. <Link className="link" href="/c/new">See what is new</Link></p>
        )}
      </section>
      {others.length > 0 && (
        <section className="pad mt-14 flex flex-col gap-4" aria-labelledby="more-lb">
          <div className="sec-head"><div><span className="kick">Keep browsing</span><h2 className="h2" id="more-lb">More <i>lookbooks</i></h2></div></div>
          <ul className="lb-list">
            {others.map((o) => (
              <li key={o.slug}>
                <Link href={`/lookbook/${o.slug}`} className="lb-card">
                  <div className="mount lb-pic">{o.hero && <Image src={o.hero} alt="" fill sizes="(min-width:900px) 33vw, 50vw" />}</div>
                  <span className="kick">{o.festival || "Lookbook"}</span>
                  <b>{o.title}</b>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
