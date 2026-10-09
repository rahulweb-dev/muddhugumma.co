import type { Metadata } from "next";
import Link from "next/link";
import { CompareView } from "@/components/compare/CompareView";
import "@/styles/catalog.css";

export const metadata: Metadata = {
  title: "Compare",
  description: "Compare up to three sarees, kurta sets or lehengas side by side: price, fabric, craft, sizes, care and delivery.",
  robots: { index: false, follow: true },
};

/** The picks live in the browser (localStorage), so the table is rendered by a client component. */
export default function ComparePage() {
  return (
    <div className="pad pb-16 flex flex-col gap-4">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-current="page">Compare</span>
      </nav>
      <header className="page-head pb-0!">
        <span className="kick">Side by side</span>
        <h1 className="h1">Compare <i>pieces</i></h1>
      </header>
      <CompareView />
    </div>
  );
}
