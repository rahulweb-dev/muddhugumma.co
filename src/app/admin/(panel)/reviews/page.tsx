import type { Metadata } from "next";
import Link from "next/link";
import type { Types } from "mongoose";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Product, Review, type ReviewDoc } from "@/lib/models";
import { escapeRx, first, fmtDate, qs } from "@/lib/admin-data";
import { ReviewQueue, type ReviewRow } from "@/components/admin/content/ReviewQueue";

export const metadata: Metadata = { title: "Reviews" };

const PER_PAGE = 30;
const TABS = [
  { key: "pending", label: "Waiting" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
] as const;
type Tab = (typeof TABS)[number]["key"];
type SP = Promise<Record<string, string | string[] | undefined>>;
type LeanReview = ReviewDoc & { _id: Types.ObjectId };

export default async function AdminReviews({ searchParams }: { searchParams: SP }) {
  await requireAdmin("reviews.manage");
  const sp = await searchParams;
  const raw = first(sp.tab);
  const tab: Tab = raw === "approved" || raw === "rejected" ? raw : "pending";
  const q = first(sp.q).trim().slice(0, 80);
  const page = Math.max(1, Math.floor(Number(first(sp.page)) || 1));

  await db();
  const filter: Record<string, unknown> = { status: tab };
  if (q) {
    const rx = new RegExp(escapeRx(q), "i");
    filter.$or = [{ productSlug: rx }, { name: rx }, { title: rx }, { body: rx }];
  }
  const [total, rows, counts] = await Promise.all([
    Review.countDocuments(filter),
    Review.find(filter).sort({ createdAt: tab === "pending" ? 1 : -1 }).skip((page - 1) * PER_PAGE).limit(PER_PAGE).lean<LeanReview[]>(),
    Review.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);
  const slugs = [...new Set(rows.map((r) => r.productSlug))];
  const products = slugs.length ? await Product.find({ slug: { $in: slugs } }, { slug: 1, name: 1, images: 1 }).lean<{ slug: string; name: string; images?: string[] }[]>() : [];
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const countOf = (s: string) => counts.find((c) => c._id === s)?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const base = { tab: tab === "pending" ? undefined : tab, q };

  const data: ReviewRow[] = rows.map((r) => {
    const p = bySlug.get(r.productSlug);
    return {
      id: String(r._id),
      slug: r.productSlug,
      productName: p?.name ?? r.productSlug,
      productImage: p?.images?.[0] ?? "",
      name: r.name ?? "",
      city: r.city ?? "",
      rating: Math.min(5, Math.max(1, Math.round(r.rating || 1))),
      title: r.title ?? "",
      body: r.body ?? "",
      images: (r.images ?? []).filter(Boolean),
      verified: !!r.verified,
      status: (r.status ?? "approved") as ReviewRow["status"],
      date: fmtDate(r.createdAt),
    };
  });

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">Customer service</p>
          <h1 className="adm-title">Reviews <span className="muted">({countOf("pending")} waiting)</span></h1>
          <p className="muted adm-small">Only approved reviews show on product pages and count towards star ratings.</p>
        </div>
      </header>

      <nav className="adm-tabs" aria-label="Review status">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/reviews${qs({ q }, { tab: t.key === "pending" ? undefined : t.key })}`} aria-current={tab === t.key ? "page" : undefined}>
            {t.label} <span>{countOf(t.key)}</span>
          </Link>
        ))}
      </nav>

      <form className="adm-filters" method="get">
        {tab !== "pending" && <input type="hidden" name="tab" value={tab} />}
        <div className="field grow">
          <label htmlFor="q">Search product slug, reviewer or text</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="e.g. kanchi or Priya" />
        </div>
        <button className="btn ghost adm-btn">Search</button>
        {q && <Link className="adm-more" href={`/admin/reviews${qs({ tab: base.tab })}`}>Clear</Link>}
      </form>

      {data.length ? (
        <>
          <ReviewQueue key={`${tab}-${page}-${q}`} rows={data} tab={tab} />
          {pages > 1 && (
            <nav className="adm-pager" aria-label="Pages">
              {page > 1 ? <Link href={`/admin/reviews${qs(base, { page: page - 1 })}`}>← Previous</Link> : <span />}
              <span className="muted">Page {page} of {pages}</span>
              {page < pages ? <Link href={`/admin/reviews${qs(base, { page: page + 1 })}`}>Next →</Link> : <span />}
            </nav>
          )}
        </>
      ) : (
        <div className="empty">
          <p>{q ? "No reviews match this search." : tab === "pending" ? "Nothing waiting. New reviews land here before they go live." : `No ${tab} reviews.`}</p>
        </div>
      )}
    </div>
  );
}
