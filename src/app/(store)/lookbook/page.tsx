import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { listLookbooks } from "@/lib/queries";
import "@/styles/home.css";

export const metadata: Metadata = {
  title: "Lookbooks",
  description: "Festival and occasion lookbooks: what to wear for Diwali, Onam and weddings, in India and the UK.",
  alternates: { canonical: "/lookbook" },
};

export default async function LookbooksPage() {
  const books = await listLookbooks();
  return (
    <div className="pad pb-16">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-current="page">Lookbooks</span>
      </nav>
      <header className="page-head">
        <span className="kick">Festivals &amp; occasions</span>
        <h1 className="h1">The <i>lookbooks</i></h1>
        <p className="muted max-w-[60ch] m-0">Season by season, the pieces we would wear ourselves, with notes on how to style them.</p>
      </header>
      {books.length ? (
        <ul className="lb-list">
          {books.map((b, i) => (
            <li key={b.slug}>
              <Link href={`/lookbook/${b.slug}`} className="lb-card">
                <div className="mount lb-pic">
                  {b.hero && <Image src={b.hero} alt="" fill sizes="(min-width:900px) 33vw, (min-width:480px) 50vw, 100vw" priority={i < 2} />}
                </div>
                <span className="kick">{b.festival || "Lookbook"}</span>
                <b>{b.title}</b>
                {b.intro && <p>{b.intro.split("\n")[0].slice(0, 150)}{b.intro.split("\n")[0].length > 150 ? "…" : ""}</p>}
                <span className="link">Open the lookbook</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <p>The next lookbook is being shot. In the meantime, the festive edit is the place to start.</p>
          <Link className="btn" href="/c/festive">Shop festive</Link>
        </div>
      )}
    </div>
  );
}
