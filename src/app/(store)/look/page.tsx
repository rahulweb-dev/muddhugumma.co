import type { Metadata } from "next";
import Link from "next/link";
import { LookCard } from "@/components/content/LookTeaser";
import { getProductsBySlugs, listBundles } from "@/lib/queries";
import "@/styles/product.css";

export const metadata: Metadata = {
  title: "Shop the look",
  description: "Outfits our stylists have put together: festive evenings, wedding weekends and easy office weeks, ready to add to your bag in one go.",
  alternates: { canonical: "/look" },
};

export default async function LooksPage() {
  const bundles = await listBundles();
  const products = await getProductsBySlugs([...new Set(bundles.flatMap((b) => b.productSlugs))]);
  return (
    <div className="pad pb-16">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-current="page">Shop the look</span>
      </nav>
      <header className="page-head">
        <span className="kick">Styled by our team</span>
        <h1 className="h1">Shop <i>the look</i></h1>
        <p className="muted max-w-[60ch] m-0">Pieces that work together, chosen by the people who buy from the looms. Pick your sizes once and add the whole outfit to your bag.</p>
      </header>
      {bundles.length ? (
        <div className="lkc-grid mt-6">
          {bundles.map((b) => <LookCard key={b.slug} b={b} products={products} />)}
        </div>
      ) : (
        <div className="empty">
          <p>Our stylists are putting the next looks together. Browse the festive edit in the meantime.</p>
          <Link className="btn" href="/c/festive">Shop festive</Link>
        </div>
      )}
    </div>
  );
}
