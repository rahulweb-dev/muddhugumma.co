import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { listPosts } from "@/lib/queries";
import "@/styles/home.css";

export const metadata: Metadata = {
  title: "The Journal",
  description: "Drape guides, care notes and what-to-wear advice for weddings and festivals in India and the UK.",
  alternates: { canonical: "/journal" },
};

const date = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");

export default async function JournalPage() {
  const posts = await listPosts();
  return (
    <div className="pad pb-16">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-current="page">Journal</span>
      </nav>
      <header className="page-head">
        <span className="kick">Notes from the house</span>
        <h1 className="h1">The <i>journal</i></h1>
        <p className="muted max-w-[60ch] m-0">How to drape it, how to care for it and what to wear where, written by our stylists.</p>
      </header>
      {posts.length ? (
        <ul className="jr-list">
          {posts.map((p, i) => (
            <li key={p.slug}>
              <Link href={`/journal/${p.slug}`} className="jr-card">
                <div className="mount jr-pic">{p.cover && <Image src={p.cover} alt="" fill sizes="(min-width:720px) 45vw, 100vw" priority={i === 0} />}</div>
                <div className="jr-copy">
                  <span className="kick">{p.tags[0] || "Journal"}</span>
                  <b>{p.title}</b>
                  {p.excerpt && <p>{p.excerpt}</p>}
                  <small className="muted">{date(p.publishedAt)}</small>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <p>Our first stories are on their way.</p>
          <Link className="btn" href="/c/new">Shop new arrivals</Link>
        </div>
      )}
    </div>
  );
}
