import type { Metadata } from "next";
import Link from "next/link";
import { Listing } from "@/components/catalog/Listing";
import { activeCategories } from "@/lib/categories";
import { parseFilters, toListingQuery, type RawParams } from "@/components/catalog/filters";
import { Icon } from "@/components/Icon";
import { ProductCard } from "@/components/ProductCard";
import { PAGE_SIZE, getProducts, getRegion, listProducts } from "@/lib/queries";
import { describeSearch, understood } from "@/lib/search";
import "@/styles/catalog.css";
import { TrackOnMount } from "@/components/analytics/TrackOnMount";

type Search = Promise<RawParams>;

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const q = String((await searchParams).q ?? "").trim().slice(0, 80);
  return {
    title: q ? `Results for “${q}”` : "Search",
    description: q
      ? `Sarees, kurta sets and lehengas matching “${q}” at House of Muddhugumma.`
      : "Search handwoven sarees, kurta sets and lehengas from five weaving clusters.",
    robots: { index: false, follow: true },
  };
}

function SearchForm({ q }: { q?: string }) {
  return (
    <form className="srch" role="search" method="get" action="/search">
      <Icon name="search" size={18} />
      <label className="sr-only" htmlFor="srch-q">Search the catalogue</label>
      <input id="srch-q" name="q" type="search" defaultValue={q} placeholder="Try “red kanjeevaram under 20000” or “chikankari kurta”" maxLength={80} />
      <button type="submit" className="link">Search</button>
    </form>
  );
}

async function Popular({ q }: { q?: string }) {
  const cats = await activeCategories();
  return (
    <div className="popular">
      <small>Shop by category</small>
      <div>
        {cats.map((c) => (
          <Link key={c.slug} className="chip" href={`/c/${c.slug}`} aria-current={q?.toLowerCase() === c.name.toLowerCase() ? "true" : undefined}>
            {c.name}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function SearchPage({ searchParams }: { searchParams: Search }) {
  const region = await getRegion();
  const state = parseFilters(await searchParams, region);
  const q = state.q;

  if (!q) {
    const best = await getProducts({}, 8, { ratingCount: -1, rating: -1 });
    return (
      <div className="plp pad">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-current="page">Search</span>
        </nav>
        <header className="page-head srch-head">
          <span className="kick">Search</span>
          <h1 className="h1">Search the <i>house</i></h1>
          <SearchForm />
          <Popular />
        </header>
        <section className="srch-best">
          <div className="sec-head">
            <div><span className="kick">Most loved</span><h2 className="h2">Bestsellers <i>this week</i></h2></div>
            <Link className="link" href="/c/all">Shop all</Link>
          </div>
          <div className="pgrid">{best.map((p) => <ProductCard key={p.slug} p={p} />)}</div>
        </section>
      </div>
    );
  }

  const result = await listProducts(toListingQuery("all", state), region);
  const s = result.search;
  const shown = s?.corrected ? s.query : q;

  return (
    <div className="plp pad">
      <TrackOnMount event="search" data={{ search_term: q }} />
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span><Link href="/search">Search</Link></span>
        <span aria-current="page">{q}</span>
      </nav>
      <header className="page-head srch-head">
        <span className="kick">Search</span>
        <h1 className="h1">Results for <i>“{shown}”</i></h1>
        {s?.corrected && (
          <p className="srch-fix">
            Showing results for <b>{s.query}</b>.{" "}
            <Link href={`/search?q=${encodeURIComponent(q)}&exact=1`}>Search instead for “{q}”</Link>
          </p>
        )}
        <p className="muted">
          {result.total} {result.total === 1 ? "style" : "styles"} found
          {s && understood(s) ? <> · we looked for <b className="text-ink font-semibold">{describeSearch(s)}</b></> : null}
        </p>
        {result.total === 0 && s?.suggestion && s.suggestion.toLowerCase() !== shown.toLowerCase() && (
          <p className="srch-fix">
            Did you mean <Link href={`/search?q=${encodeURIComponent(s.suggestion)}`}>“{s.suggestion}”</Link>?
          </p>
        )}
        <SearchForm q={q} />
        <Popular q={q} />
      </header>
      <Listing base="/search" slug="all" state={state} result={result} region={region} pageSize={PAGE_SIZE} />
    </div>
  );
}
