import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { renderMarkdown } from "@/lib/markdown";
import { getPost, listPosts } from "@/lib/queries";
import "@/styles/home.css";

type Params = Promise<{ slug: string }>;
const load = cache((slug: string) => getPost(slug));
const date = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");
const plain = (md: string) => md.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[#*_>`]/g, "").replace(/\s+/g, " ").trim();

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = await load((await params).slug);
  if (!p) return { title: "Story not found" };
  return {
    title: `${p.title}`,
    description: (p.excerpt || plain(p.body)).slice(0, 158),
    alternates: { canonical: `/journal/${p.slug}` },
    openGraph: { type: "article", title: p.title, description: p.excerpt || undefined },
  };
}

export default async function PostPage({ params }: { params: Params }) {
  const p = await load((await params).slug);
  if (!p) notFound();
  const more = (await listPosts(4)).filter((x) => x.slug !== p.slug).slice(0, 2);
  const ld = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: p.title,
    datePublished: p.publishedAt || undefined,
    author: { "@type": "Organization", name: p.author },
    publisher: { "@type": "Organization", name: "House of Muddhugumma" },
    description: p.excerpt || plain(p.body).slice(0, 200),
  };
  return (
    <article className="jr-post pb-16">
      <nav className="crumbs pad" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span><Link href="/journal">Journal</Link></span>
        <span aria-current="page">{p.title}</span>
      </nav>
      <header className="jr-head pad">
        <span className="kick">{p.tags[0] || "Journal"}</span>
        <h1 className="h1">{p.title}</h1>
        {p.excerpt && <p className="jr-dek">{p.excerpt}</p>}
        <small className="muted">By {p.author}{p.publishedAt ? ` · ${date(p.publishedAt)}` : ""}</small>
      </header>
      {p.cover && (
        <div className="pad">
          <div className="mount jr-cover"><Image src={p.cover} alt="" fill priority sizes="(min-width:900px) 900px, 100vw" /></div>
        </div>
      )}
      <div className="jr-body pad" dangerouslySetInnerHTML={{ __html: renderMarkdown(p.body) }} />
      {p.tags.length > 1 && (
        <div className="pad jr-tags">
          {p.tags.map((t) => <Link key={t} className="chip" href={`/search?q=${encodeURIComponent(t)}`}>{t}</Link>)}
        </div>
      )}
      {more.length > 0 && (
        <section className="pad mt-14 flex flex-col gap-4" aria-labelledby="more-jr">
          <div className="sec-head">
            <div><span className="kick">Keep reading</span><h2 className="h2" id="more-jr">From <i>the journal</i></h2></div>
            <Link className="link" href="/journal">All stories</Link>
          </div>
          <ul className="jr-list">
            {more.map((m) => (
              <li key={m.slug}>
                <Link href={`/journal/${m.slug}`} className="jr-card">
                  <div className="mount jr-pic">{m.cover && <Image src={m.cover} alt="" fill sizes="(min-width:720px) 45vw, 100vw" />}</div>
                  <div className="jr-copy"><b>{m.title}</b>{m.excerpt && <p>{m.excerpt}</p>}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
    </article>
  );
}
