import Image from "next/image";
import Link from "next/link";
import { HeroSlider } from "@/components/home/HeroSlider";
import { NewArrivals, Newsletter } from "@/components/home/HomeClient";
import { TrustBar } from "@/components/Footer";
import { RecentlyViewed } from "@/components/product/RecentlyViewed";
import { getProducts, getRegion, listLookbooks, listPosts } from "@/lib/queries";
import { activeCategories } from "@/lib/categories";
import { getSettings } from "@/lib/settings";
import { DEFAULT_SLIDES, DEFAULT_STORY } from "@/lib/home-defaults";
import { BRAND, SITE, absImage, ldJson } from "@/lib/seo";
import { REGION_CONFIG } from "@/lib/region";
import { BASE_KEYWORDS, pageMeta } from "@/lib/seo-meta";
import "@/styles/home.css";
import { focusPosition } from "@/lib/image-focus";

const BENTO = ["big", "", "tall", ""]; // tile shapes, in category order

export async function generateMetadata() {
  const settings = await getSettings();
  const meta = await pageMeta({
    title: {
      in: "Buy Sarees, Half Sarees & Kurta Sets Online in India",
      uk: "Indian Sarees, Kurta Sets & Ethnic Wear Online in the UK",
    },
    description: {
      in: "House of Muddhugumma: handwoven silk, Kanjeevaram and Banarasi sarees, half sarees, kurta sets and bridal wear. Free shipping across India above ₹1,999, COD and easy 7-day returns.",
      uk: "House of Muddhugumma: Indian silk, Kanjeevaram and Banarasi sarees, half sarees, kurta sets and bridal wear delivered across the UK. Duties included, free video styling consults.",
    },
    keywords: BASE_KEYWORDS,
    path: "/",
    kicker: "Ethnic wear · India & UK",
    image: settings.home?.slides?.[0]?.image,
  });
  // The home page title stands alone (no "· House of Muddhugumma" suffix), with the brand in front.
  const t = String(meta.title);
  return { ...meta, title: { absolute: `${BRAND} | ${t}` } };
}

export default async function HomePage() {
  const region = await getRegion();
  const r = REGION_CONFIG[region];
  const [fresh, books, posts, cats, settings] = await Promise.all([
    getProducts({}, 16, { createdAt: -1, ratingCount: -1 }),
    listLookbooks(),
    listPosts(2),
    activeCategories(),
    getSettings(),
  ]);
  const slides = settings.home?.slides?.length ? settings.home.slides : DEFAULT_SLIDES;
  const story = settings.home?.story?.title ? settings.home.story : DEFAULT_STORY;
  const insta = settings.instagram?.replace(/^@/, "") || "houseofmuddhugumma";
  // A category without its own image borrows the cover of its newest product.
  const tiles = await Promise.all(
    cats.map(async (c) => ({ ...c, image: c.image || (await getProducts({ category: c.slug }, 1, { createdAt: -1 }))[0]?.images[0] || "" }))
  );
  const shown = tiles.filter((c) => c.image);
  const tabs = cats.filter((c) => fresh.some((p) => p.category === c.slug)).map((c) => ({ label: c.name, value: c.slug }));
  const ticker = settings.ticker?.[region]?.filter(Boolean).length ? settings.ticker[region]!.filter(Boolean) : r.ticker;
  // Who we are and how to search the store, for Google's knowledge panel and sitelinks search box.
  const orgLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE}/#org`,
        name: BRAND,
        url: SITE,
        logo: absImage("brand/logo.webp", "w-512,h-512,q-90"),
        ...(settings.supportEmail ? { email: settings.supportEmail } : {}),
        ...(settings.phone ? { telephone: settings.phone } : {}),
        sameAs: [`https://instagram.com/${insta}`],
        ...(settings.address ? { address: { "@type": "PostalAddress", streetAddress: settings.address } } : {}),
      },
      {
        "@type": "WebSite",
        "@id": `${SITE}/#website`,
        name: BRAND,
        url: SITE,
        publisher: { "@id": `${SITE}/#org` },
        potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${SITE}/search?q={search_term_string}` }, "query-input": "required name=search_term_string" },
      },
    ],
  };
  const strip = fresh.filter((p) => p.images[0]).slice(0, 6);

  return (
    <>
      <HeroSlider slides={slides} />

      <div className="ticker" aria-hidden="true">
        <div>{[...ticker, ...ticker].map((t, i) => <span key={i}>{t}</span>)}</div>
      </div>

      <section className="cats pad">
        <div className="sec-head"><div><span className="kick">Shop by category</span><h2 className="h2">Find your <i>drape</i></h2></div></div>
        <div className="cat-row">
          {shown.map((c) => (
            <Link className="cat" href={`/c/${c.slug}`} key={c.slug}>
              <span className="cat-ring"><span><Image src={c.image} alt="" fill sizes="104px" style={{ objectPosition: focusPosition(c.imageFocus) }} /></span></span>
              {c.name}
            </Link>
          ))}
        </div>
      </section>

      <section className="edits pad">
        <div className="sec-head">
          <div><span className="kick">Curated edits</span><h2 className="h2">Dressed for <i>the moment</i></h2></div>
          <Link className="link" href="/c/all">Shop all</Link>
        </div>
        <div className="bento">
          {shown.slice(0, 4).map((c, i) => (
            <Link className={`tile ${BENTO[i]}`} href={`/c/${c.slug}`} key={c.slug}>
              <div className="mount"><Image src={c.image} alt="" fill sizes={i === 0 ? "(min-width:720px) 45vw, 100vw" : "(min-width:720px) 27vw, 50vw"} style={{ objectPosition: focusPosition(c.imageFocus) }} /></div>
              <div className="cap">{c.kicker && <small>{c.kicker}</small>}<b>{c.name}</b>{i % 2 === 0 && <em>Shop now</em>}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="prods pad">
        <div className="sec-head">
          <div><span className="kick">Just landed</span><h2 className="h2">New <i>arrivals</i></h2></div>
          <Link className="link" href="/c/new">View all</Link>
        </div>
        <NewArrivals products={fresh} tabs={tabs} />
      </section>

      <RecentlyViewed className="prods pad" />

      <section className="pp pad">
        <div className="sec-head"><div><span className="kick">Shop by budget</span><h2 className="h2">Something for <i>every purse</i></h2></div></div>
        <div className="pp-row">
          {r.budgetTiles.map((b) => (
            <Link className="ppc" key={b.label} href={b.max ? `/c/all?max=${b.max}&sort=price-asc` : `/c/all?price=${r.priceBands.length - 1}`}>
              <small>{b.kicker}</small><b>{b.label}</b><span>{b.note}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="craft pad">
        <div className="pics">
          {story.image && <div className="mount"><Image src={story.image} alt="" fill sizes="(min-width:720px) 40vw, 80vw" /></div>}
          <div className="logo-c"><Image src="brand/logo.webp" alt="House of Muddhugumma crest" fill sizes="220px" /></div>
        </div>
        <div className="txt">
          {story.kicker && <span className="kick">{story.kicker}</span>}
          <h2 className="h2">{story.title} {story.accent && <i>{story.accent}</i>}</h2>
          {story.text?.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
          <div><Link className="btn" href="/about">Read our story</Link></div>
        </div>
      </section>

      {books.length > 0 && (
        <section className="home-lb pad" aria-labelledby="home-lb-h">
          <div className="sec-head">
            <div><span className="kick">Festival lookbooks</span><h2 className="h2" id="home-lb-h">What to wear <i>this season</i></h2></div>
            <Link className="link" href="/lookbook">All lookbooks</Link>
          </div>
          <ul className="lb-list">
            {books.slice(0, 3).map((b) => (
              <li key={b.slug}>
                <Link href={`/lookbook/${b.slug}`} className="lb-card">
                  <div className="mount lb-pic">{b.hero && <Image src={b.hero} alt="" fill sizes="(min-width:900px) 30vw, (min-width:480px) 50vw, 90vw" />}</div>
                  <span className="kick">{b.festival || "Lookbook"}</span>
                  <b>{b.title}</b>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {posts.length > 0 && (
        <section className="home-jr pad" aria-labelledby="home-jr-h">
          <div className="sec-head">
            <div><span className="kick">From the journal</span><h2 className="h2" id="home-jr-h">Drape notes <i>&amp; guides</i></h2></div>
            <Link className="link" href="/journal">Read the journal</Link>
          </div>
          <ul className="jr-list">
            {posts.map((p) => (
              <li key={p.slug}>
                <Link href={`/journal/${p.slug}`} className="jr-card">
                  <div className="mount jr-pic">{p.cover && <Image src={p.cover} alt="" fill sizes="(min-width:720px) 45vw, 100vw" />}</div>
                  <div className="jr-copy"><span className="kick">{p.tags[0] || "Journal"}</span><b>{p.title}</b>{p.excerpt && <p>{p.excerpt}</p>}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="social pad">
        <div className="sec-head">
          <div><span className="kick">@{insta}</span><h2 className="h2">Follow <i>the house</i></h2></div>
          <a className="link" href={`https://instagram.com/${insta}`} target="_blank" rel="noopener noreferrer">Follow on Instagram</a>
        </div>
        <div className="strip">
          {strip.map((p) => (
            <Link className="mount" key={p.slug} href={`/p/${p.slug}`} aria-label={p.name}><Image src={p.images[0]} alt="" fill sizes="(min-width:720px) 16vw, 42vw" /></Link>
          ))}
        </div>
      </section>

      <div style={{ marginTop: 44 }}><TrustBar region={region} /></div>

      <section id="newsletter" className="news pad scroll-mt-24">
        <span className="script">Join the house</span>
        <h2 className="h2">10% off <i>your first order</i></h2>
        <p>Early access to festive drops, styling notes and drape guides. One email a week at most.</p>
        <Newsletter />
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(orgLd) }} />
    </>
  );
}
