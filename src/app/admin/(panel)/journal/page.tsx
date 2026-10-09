import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import type { Types } from "mongoose";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Post, type PostDoc } from "@/lib/models";
import { escapeRx, first, fmtDate, qs } from "@/lib/admin-data";
import { Icon } from "@/components/Icon";

export const metadata: Metadata = { title: "Journal" };

type SP = Promise<Record<string, string | string[] | undefined>>;
type Row = Pick<PostDoc, "title" | "slug" | "excerpt" | "cover" | "tags" | "author" | "status" | "publishedAt"> & { _id: Types.ObjectId; updatedAt?: Date };

export default async function AdminJournal({ searchParams }: { searchParams: SP }) {
  await requireAdmin("content.manage");
  const sp = await searchParams;
  const raw = first(sp.status);
  const status = raw === "draft" || raw === "published" ? raw : "";
  const q = first(sp.q).trim().slice(0, 80);

  await db();
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (q) {
    const rx = new RegExp(escapeRx(q), "i");
    filter.$or = [{ title: rx }, { slug: rx }, { tags: rx }];
  }
  const [rows, counts] = await Promise.all([
    Post.find(filter, { body: 0 }).sort({ updatedAt: -1 }).limit(200).lean<Row[]>(),
    Post.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);
  const countOf = (s: string) => counts.find((c) => c._id === s)?.n ?? 0;

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">Content</p>
          <h1 className="adm-title">Journal <span className="muted">({countOf("published")} live, {countOf("draft")} drafts)</span></h1>
        </div>
        <Link className="btn adm-btn" href="/admin/journal/new"><Icon name="plus" size={16} /> New post</Link>
      </header>

      <nav className="adm-tabs" aria-label="Filter by status">
        <Link href={`/admin/journal${qs({ q })}`} aria-current={!status ? "page" : undefined}>All <span>{countOf("draft") + countOf("published")}</span></Link>
        <Link href={`/admin/journal${qs({ q }, { status: "published" })}`} aria-current={status === "published" ? "page" : undefined}>Published <span>{countOf("published")}</span></Link>
        <Link href={`/admin/journal${qs({ q }, { status: "draft" })}`} aria-current={status === "draft" ? "page" : undefined}>Drafts <span>{countOf("draft")}</span></Link>
      </nav>

      <form className="adm-filters" method="get">
        {status && <input type="hidden" name="status" value={status} />}
        <div className="field grow">
          <label htmlFor="q">Title, slug or tag</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="e.g. bridal" />
        </div>
        <button className="btn ghost adm-btn">Search</button>
        {q && <Link className="adm-more" href={`/admin/journal${qs({ status })}`}>Clear</Link>}
      </form>

      {rows.length ? (
        <ul className="list-none m-0 p-0 adm-card flush">
          {rows.map((p) => (
            <li key={String(p._id)} className="border-b border-line last:border-b-0">
              <Link href={`/admin/journal/${p._id}`} className="flex gap-3 items-center p-3 hover:bg-[#FAF7F2]">
                <span className="relative w-20 aspect-[3/2] bg-stone shrink-0 overflow-hidden">{p.cover ? <Image src={p.cover} alt="" fill sizes="80px" className="object-cover" /> : null}</span>
                <span className="flex flex-col gap-1 min-w-0 flex-1">
                  <b className="font-semibold truncate">{p.title || "Untitled"}</b>
                  <small className="muted truncate">{p.excerpt || "No excerpt"}</small>
                  <small className="muted">
                    {p.status === "published" ? `Published ${fmtDate(p.publishedAt)}` : `Edited ${fmtDate(p.updatedAt)}`}
                    {p.author ? ` · ${p.author}` : ""}
                    {p.tags?.length ? ` · ${p.tags.join(", ")}` : ""}
                  </small>
                </span>
                <span className={`status shrink-0 ${p.status === "published" ? "text-ok" : "text-muted"}`}>{p.status === "published" ? "Live" : "Draft"}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <p>{q || status ? "No posts match." : "No journal posts yet. Write about craft, drapes, care and the weavers behind each piece."}</p>
          <Link className="btn adm-btn" href="/admin/journal/new">Write the first post</Link>
        </div>
      )}
    </div>
  );
}
