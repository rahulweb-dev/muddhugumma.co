import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { Listing } from "@/components/catalog/Listing";
import { parseFilters, toListingQuery, type RawParams } from "@/components/catalog/filters";
import { PAGE_SIZE, getListing, getRegion, listProducts } from "@/lib/queries";
import { REGION_CONFIG } from "@/lib/region";
import { getActiveSales } from "@/lib/sales";
import "@/styles/catalog.css";
import { TrackOnMount } from "@/components/analytics/TrackOnMount";
import { absImage, absUrl, breadcrumbLd, ldJson } from "@/lib/seo";
import { listingTerms, pageMeta } from "@/lib/seo-meta";
import { categoryContent } from "@/lib/category-content";
import { Icon } from "@/components/Icon";
import { LookPicker } from "@/components/catalog/LookPicker";
import { LOOKS, LOOK_COOKIE } from "@/components/catalog/looks";
import { focusPosition } from "@/lib/image-focus";

type Params = Promise<{ slug: string }>;
type Search = Promise<RawParams>;

/** Heading split into plain text + bronze italic accent (the last word). */
const splitTitle = (t: string): [string, string] => {
  const w = t.split(" ");
  return w.length > 1 ? [w.slice(0, -1).join(" "), w[w.length - 1]] : ["", t];
};

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: Search }): Promise<Metadata> {
  const { slug } = await params;
  const l = await getListing(slug);
  if (!l) return { title: "Not found" };
  const sp = await searchParams;
  // Filtered and sorted views stay out of the index; ?region only picks the country.
  const filtered = Object.keys(sp).some((k) => k !== "sort" && k !== "region");
  const terms = listingTerms(slug, l.title, l.blurb);
  return pageMeta({
    title: { in: terms.in.title, uk: terms.uk.title },
    description: { in: terms.in.desc, uk: terms.uk.desc },
    keywords: { in: terms.in.keywords, uk: terms.uk.keywords },
    path: `/c/${slug}`,
    kicker: l.kicker,
    image: l.image || "banners/plp-banner.webp",
    noindex: filtered,
  });
}

export default async function CategoryPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug } = await params;
  const l = await getListing(slug);
  if (!l) notFound();
  const region = await getRegion();
  const state = parseFilters(await searchParams, region);
  delete state.q;
  const [result, sales] = await Promise.all([listProducts(toListingQuery(slug, state), region), slug === "sale" ? getActiveSales() : Promise.resolve([])]);
  const running = sales.filter((s) => s.regions.includes(region));
  const [plain, accent] = splitTitle(l.title);
  const base = `/c/${slug}`;
  // Grid design preview (development only): pick 1–5 with the switcher above the grid.
  const preview = process.env.NODE_ENV !== "production";
  const chosen = (await cookies()).get(LOOK_COOKIE)?.value ?? "";
  const look = preview && LOOKS.some((l) => l.id === chosen) ? chosen : "1";
  const guide = categoryContent(slug, l.title, region);
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: guide.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  return (
    <div className="plp pad" data-look={look}>
      <TrackOnMount event="view_item_list" data={{ item_list_name: slug, items: result.items.slice(0, 12).map((p) => ({ item_id: p.slug, item_name: p.name, item_category: p.category })) }} />
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        {slug !== "all" && <span><Link href="/c/all">Shop</Link></span>}
        <span aria-current="page">{l.title}</span>
      </nav>

      <header className="plp-head">
        <div className="mount plp-ban">
          <Image src={l.image || "banners/plp-banner.webp"} alt="" fill sizes="(min-width:900px) 40vw, 100vw" priority style={{ objectPosition: focusPosition(l.imageFocus) }} />
        </div>
        <div className="plp-copy">
          <span className="kick">{l.kicker}</span>
          <h1 className="h1">
            {plain} <i>{accent}</i>
          </h1>
          {l.blurb && <p>{l.blurb}</p>}
          {running.map((s) => (
            <p key={s.id} className="text-sale! font-semibold text-[13.5px]">
              {s.name}: {s.banner || `${s.percentOff}% off`}, ends {new Date(s.endsAt).toLocaleDateString(REGION_CONFIG[region].locale, { weekday: "short", day: "numeric", month: "short" })}
            </p>
          ))}
          <span className="plp-count">
            {result.total} {result.total === 1 ? "style" : "styles"}
          </span>
        </div>
      </header>

      {preview && <LookPicker current={look} />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(breadcrumbLd([["Home", "/"], [l.title, base]])) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: ldJson({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: l.title,
            ...(l.blurb ? { description: l.blurb } : {}),
            url: absUrl(base),
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: result.total,
              itemListElement: result.items.slice(0, 24).map((p, i) => ({ "@type": "ListItem", position: i + 1, url: absUrl(`/p/${p.slug}`), name: p.name, image: absImage(p.images[0] ?? "") })),
            },
          }),
        }}
      />
      <Listing base={base} slug={slug} state={state} result={result} region={region} pageSize={PAGE_SIZE} />

      <section className="plp-guide" aria-labelledby="plp-guide-h">
        <div>
          <h2 className="h3" id="plp-guide-h">{guide.heading}</h2>
          {guide.intro.map((p, i) => <p key={i}>{p}</p>)}
        </div>
        <div className="plp-faq">
          <h2 className="h3">Questions shoppers ask</h2>
          {guide.faqs.map((f) => (
            <details key={f.q}>
              <summary>{f.q}<Icon name="plus" size={16} /></summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(faqLd) }} />
    </div>
  );
}
