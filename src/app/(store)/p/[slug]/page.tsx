import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { Icon } from "@/components/Icon";
import { ProductCard } from "@/components/ProductCard";
import { BuyBox } from "@/components/product/BuyBox";
import { Gallery } from "@/components/product/Gallery";
import { RecentlyViewed } from "@/components/product/RecentlyViewed";
import { ReviewForm } from "@/components/product/ReviewForm";
import { ReviewPhotos } from "@/components/product/ReviewPhotos";
import { CompleteThisLook } from "@/components/content/LookTeaser";
import { getSession } from "@/lib/auth";
import { effectivePrice } from "@/lib/pricing";
import { getBundlesForProduct, getCompleteTheLook, getMeasurements, getProduct, getProductsBySlugs, getRegion, getRelated, getReviews, type ReviewWithPhotos } from "@/lib/queries";
import { REGION_CONFIG, formatMoney, type Region } from "@/lib/region";
import { getActiveSales } from "@/lib/sales";
import { categoryLabel, type ProductDTO } from "@/lib/types";
import "@/styles/product.css";
import { TrackOnMount } from "@/components/analytics/TrackOnMount";
import { reviewEligibility, type ReviewEligibility } from "@/lib/reviews";
import { db } from "@/lib/db";
import { Coupon, Product, type CouponDoc } from "@/lib/models";
import { absImage, absUrl, breadcrumbLd, BRAND, ldJson } from "@/lib/seo";
import { pageMeta, productKeywords, regionPath } from "@/lib/seo-meta";

type Params = Promise<{ slug: string }>;

const load = cache((slug: string) => getProduct(slug));

/** Absolute-ish image URL for metadata and JSON-LD (ImageKit when configured, local copy otherwise). */
function imageUrl(path: string, w = 1200) {
  const ep = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT?.replace(/\/$/, "");
  return ep ? `${ep}/${path}?tr=w-${w},q-80,f-auto` : `/img/${path}`;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) return { title: "Product not found" };
  const [region, sales] = await Promise.all([getRegion(), getActiveSales()]);
  const cat = categoryLabel(p.category).toLowerCase();
  const lead = [p.fabric && !p.name.toLowerCase().includes(p.fabric.toLowerCase()) ? `In ${p.fabric.toLowerCase()}` : "", `${formatMoney(effectivePrice(p, region, sales).now, region)}`].filter(Boolean).join(", ");
  const where = region === "uk" ? "Delivered across the UK, duties included." : "Free shipping above ₹1,999, COD available.";
  const desc = `${p.name}. ${lead}. ${p.description ? `${p.description} ` : ""}Buy ${cat} online ${region === "uk" ? "in the UK" : "in India"} at ${BRAND}. ${where}`;
  const name = p.name.length > 55 ? `${p.name.slice(0, 52).replace(/[\s,]+\S*$/, "")}…` : p.name;
  const meta = await pageMeta({
    title: { in: `${name} | Buy Online India`, uk: `${name} | Buy Online UK` },
    description: desc,
    keywords: productKeywords(p, categoryLabel(p.category), region),
    path: `/p/${p.slug}`,
    kicker: categoryLabel(p.category),
    image: p.images[0],
    price: formatMoney(effectivePrice(p, region, sales).now, region),
    region,
  });
  // The branded card first, then the product photo itself (Pinterest and Google Images prefer the real photo).
  const photo = p.images[0] ? [{ url: imageUrl(p.images[0]), width: 1200, alt: p.name }] : [];
  const cards = Array.isArray(meta.openGraph?.images) ? meta.openGraph.images : [];
  return { ...meta, openGraph: { ...meta.openGraph, images: [...cards, ...photo] } };
}

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="stars" aria-hidden="true" style={{ "--pct": `${(value / 5) * 100}%`, fontSize: size } as React.CSSProperties}>
      ★★★★★<span>★★★★★</span>
    </span>
  );
}

/** Live coupon codes for this region (Admin → Coupons). Hidden when there are none. */
async function Offers({ region }: { region: Region }) {
  await db();
  const now = new Date();
  const codes = await Coupon.find({ active: true, regions: region, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] })
    .sort({ value: -1 })
    .limit(3)
    .lean<CouponDoc[]>();
  if (!codes.length) return null;
  const text = (c: CouponDoc) => {
    const off = c.type === "percent" ? `${c.value}% off` : `${formatMoney(c.value, region)} off`;
    const min = c.minOrder?.[region] ? ` orders of ${formatMoney(c.minOrder[region], region)} and above` : c.firstOrderOnly ? " your first order" : " your order";
    return c.description || `${off}${min}`;
  };
  return (
    <div className="offers">
      <b className="h3"><Icon name="tag" size={16} /> Offers for you</b>
      <ul>
        {codes.map((c) => (
          <li key={c.code}>
            <span className="code">{c.code}</span>
            <span>{text(c)}</span>
          </li>
        ))}
      </ul>
      <small className="muted">Apply codes in your bag. One code per order.</small>
    </div>
  );
}

function ShippingCopy({ region }: { region: Region }) {
  const r = REGION_CONFIG[region];
  return region === "in" ? (
    <ul>
      <li>Free shipping on orders above {formatMoney(r.freeShippingAt, region)}; {formatMoney(r.shippingFee, region)} below that.</li>
      <li>Dispatched from Hyderabad. Delivered in {r.eta[0]}–{r.eta[1]} working days to most pincodes.</li>
      <li>Cash on delivery available (+ {formatMoney(r.codFee, region)}).</li>
      <li>{r.returnsDays}-day returns with free pickup from home. Refunds to the original payment method, or to your bank account for COD orders.</li>
      <li>Stitched blouses and pieces with fall &amp; pico are made for you and can be exchanged, not returned.</li>
    </ul>
  ) : (
    <ul>
      <li>Free UK delivery on orders over {formatMoney(r.freeShippingAt, region)}; {formatMoney(r.shippingFee, region)} below that.</li>
      <li>Shipped by tracked courier from India in {r.eta[0]}–{r.eta[1]} working days. Duties and VAT are included: nothing to pay at the door.</li>
      <li>{r.returnsDays}-day returns with a prepaid UK returns label.</li>
      <li>Stitched blouses and pieces with fall &amp; pico are made for you and can be exchanged, not returned.</li>
    </ul>
  );
}

function Reviews({ p, reviews, can }: { p: ProductDTO; reviews: ReviewWithPhotos[]; can: ReviewEligibility }) {
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: reviews.filter((r) => r.rating === n).length }));
  const max = Math.max(1, ...dist.map((d) => d.c));
  const caption = (r: ReviewWithPhotos) => `${r.name}${r.city ? `, ${r.city}` : ""}: ${r.title || `${r.rating} stars`}`;
  const allPhotos = reviews.flatMap((r) => r.images.map((src) => ({ src, caption: caption(r) })));
  return (
    <section className="pdp-sec pad reviews" id="reviews" aria-labelledby="reviews-h">
      <div className="sec-head">
        <div><span className="kick">Ratings &amp; reviews</span><h2 className="h2" id="reviews-h">What our <i>customers say</i></h2></div>
      </div>
      <div className="rv-grid">
        <div className="rv-sum">
          {p.ratingCount > 0 ? (
            <>
              <div className="big">
                <b>{p.rating.toFixed(1)}</b>
                <div>
                  <Stars value={p.rating} size={18} />
                  <small>{p.ratingCount} ratings{reviews.length ? ` · ${reviews.length} written review${reviews.length > 1 ? "s" : ""}` : ""}</small>
                </div>
              </div>
              {reviews.length > 0 && (
                <ul className="bars-l" aria-label="Rating breakdown of written reviews">
                  {dist.map((d) => (
                    <li key={d.n}>
                      <span>{d.n} ★</span>
                      <span className="bar"><span style={{ width: `${(d.c / max) * 100}%` }} /></span>
                      <em>{d.c}</em>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="muted">No ratings yet.</p>
          )}
          {allPhotos.length > 0 && (
            <div className="rv-gallery">
              <b className="h3">Customer photos</b>
              <ReviewPhotos photos={allPhotos.slice(0, 12)} size="lg" label="Photos from customers" />
            </div>
          )}
          <div className="rv-write">
            {can === "ok" ? (
              <ReviewForm slug={p.slug} />
            ) : can === "reviewed" ? (
              <p className="muted">Thank you for reviewing this piece. Your review appears here once it has been checked.</p>
            ) : can === "not-bought" ? (
              <p className="muted">Only customers who have received this piece can review it. Once your order is delivered, you can review it here or from <Link className="link" href="/account/orders">My orders</Link>.</p>
            ) : (
              <p className="flex flex-col gap-2">
                <span className="muted">Reviews are written by customers who have received this piece.</span>
                <Link className="btn ghost self-start" href={`/account/login?next=${encodeURIComponent(`/p/${p.slug}#reviews`)}`}>Bought it? Sign in to review</Link>
              </p>
            )}
          </div>
        </div>
        <ul className="rv-list">
          {reviews.length === 0 && <li className="muted">No written reviews yet.</li>}
          {reviews.map((r) => (
            <li key={r.id}>
              <div className="rv-top">
                <span className="rate">{r.rating} ★</span>
                <b>{r.title}</b>
              </div>
              <p>{r.body}</p>
              {r.images.length > 0 && <ReviewPhotos photos={r.images.map((src) => ({ src, caption: caption(r) }))} label={`Photos from ${r.name}`} />}
              <small className="muted">
                {r.name}
                {r.city ? `, ${r.city}` : ""}
                {r.date ? ` · ${new Date(r.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                {r.verified && <span className="ver"><Icon name="check" size={12} /> Verified buyer</span>}
              </small>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default async function ProductPage({ params, searchParams }: { params: Params; searchParams: Promise<{ region?: string }> }) {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) {
    // A renamed product: send old links (and search engines) to the new URL for good.
    await db();
    const moved = await Product.findOne({ oldSlugs: slug, active: true }, { slug: 1 }).lean<{ slug: string }>();
    if (moved) permanentRedirect(`/p/${moved.slug}${(await searchParams).region === "uk" ? "?region=uk" : ""}`);
    notFound();
  }
  const [region, sales, session] = await Promise.all([getRegion(), getActiveSales(), getSession()]);
  const r = REGION_CONFIG[region];
  const [reviews, related, look, bundles, saved] = await Promise.all([
    getReviews(p.slug),
    getRelated(p, 8),
    getCompleteTheLook(p, 8),
    getBundlesForProduct(p.slug),
    session && !p.freeSize ? getMeasurements(session.uid) : Promise.resolve(null),
  ]);
  const bundleProducts = bundles.length ? await getProductsBySlugs([...new Set(bundles.flatMap((b) => b.productSlugs))]) : [];
  const priceNow = effectivePrice(p, region, sales);
  const catLabel = categoryLabel(p.category);
  const inStock = Object.values(p.stock).some((n) => n > 0);

  const sku = p.details.find((d) => d.startsWith("SKU: "))?.slice(5) || p.slug;
  const ld = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    sku,
    url: absUrl(`/p/${p.slug}`),
    description: p.description || `${p.name} from ${BRAND}.`,
    image: p.images.map((i) => absImage(i)),
    ...(p.colour ? { color: p.colour } : {}),
    ...(p.fabric ? { material: p.fabric } : {}),
    category: catLabel,
    brand: { "@type": "Brand", name: BRAND },
    ...(p.ratingCount > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: p.rating, reviewCount: p.ratingCount, bestRating: 5, worstRating: 1 } } : {}),
    ...(reviews.length
      ? {
          review: reviews.slice(0, 5).map((rv) => ({
            "@type": "Review",
            author: { "@type": "Person", name: rv.name },
            ...(rv.date ? { datePublished: rv.date.slice(0, 10) } : {}),
            name: rv.title,
            reviewBody: rv.body,
            reviewRating: { "@type": "Rating", ratingValue: rv.rating, bestRating: 5, worstRating: 1 },
          })),
        }
      : {}),
    offers: {
      "@type": "Offer",
      url: absUrl(regionPath(`/p/${p.slug}`, region)),
      priceCurrency: r.currency,
      price: priceNow.now,
      ...(priceNow.sale ? { priceValidUntil: priceNow.sale.endsAt.slice(0, 10) } : {}),
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: BRAND },
      // Delivery and returns for this country, shown by Google in Shopping results.
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingDestination: { "@type": "DefinedRegion", addressCountry: region === "uk" ? "GB" : "IN" },
        shippingRate: { "@type": "MonetaryAmount", value: priceNow.now >= r.freeShippingAt ? 0 : r.shippingFee, currency: r.currency },
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          handlingTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 2, unitCode: "DAY" },
          transitTime: { "@type": "QuantitativeValue", minValue: r.eta[0], maxValue: r.eta[1], unitCode: "DAY" },
        },
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: region === "uk" ? "GB" : "IN",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: r.returnsDays,
        returnMethod: "https://schema.org/ReturnByMail",
      },
    },
  };
  const crumbsLd = breadcrumbLd([["Home", "/"], [catLabel, `/c/${p.category}`], [p.name, `/p/${p.slug}`]]);

  return (
    <div className="pdp">
      <TrackOnMount event="view_item" data={{ currency: region === "uk" ? "GBP" : "INR", value: priceNow.now, items: [{ item_id: p.slug, item_name: p.name, item_brand: "House of Muddhugumma", item_category: p.category, price: priceNow.now }] }} />
      <nav className="crumbs pad" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span><Link href={`/c/${p.category}`}>{catLabel}</Link></span>
        <span aria-current="page">{p.name}</span>
      </nav>

      <div className="pdp-top pad">
        <Gallery images={p.images} name={p.name} video={p.video} />

        <div className="pdp-info">
          <span className="kick">House of Muddhugumma{p.craft ? ` · ${p.craft}` : ""}</span>
          <h1 className="pdp-name">{p.name}</h1>
          {p.ratingCount > 0 ? (
            <a className="pdp-rate" href="#reviews">
              <span className="rate">{p.rating.toFixed(1)} ★ <span>| {p.ratingCount} ratings</span></span>
              <span className="link">Read reviews</span>
            </a>
          ) : (
            <a className="pdp-rate muted" href="#reviews">Be the first to review</a>
          )}

          <BuyBox p={p} email={session?.email} signedIn={!!session} saved={saved} />
          <Offers region={region} />

          <div className="acc">
            {p.description && (
              <details open>
                <summary>Description<Icon name="plus" size={16} /></summary>
                <div><p>{p.description}</p></div>
              </details>
            )}
            {(p.details.length > 0 || p.fabric || p.colour) && (
              <details open={!p.description}>
                <summary>Details<Icon name="plus" size={16} /></summary>
                <div>
                  {p.details.length > 0 && <ul>{p.details.map((d) => <li key={d}>{d}</li>)}</ul>}
                  <dl className="spec">
                    {p.fabric && (<><dt>Fabric</dt><dd>{p.fabric}</dd></>)}
                    {p.colour && (<><dt>Colour</dt><dd style={{ textTransform: "capitalize" }}>{p.colour}</dd></>)}
                    {p.occasions.length > 0 && (<><dt>Occasion</dt><dd style={{ textTransform: "capitalize" }}>{p.occasions.join(", ")}</dd></>)}
                    <dt>Product code</dt><dd>{sku.toUpperCase().slice(0, 24)}</dd>
                  </dl>
                </div>
              </details>
            )}
            {(p.craft || p.origin) && (
              <details>
                <summary>Craft &amp; origin<Icon name="plus" size={16} /></summary>
                <div>
                  <p>
                    {p.craft ? <b>{p.craft}</b> : null}
                    {p.craft && p.origin ? ", from " : p.origin ? "From " : ""}
                    {p.origin}.
                  </p>
                </div>
              </details>
            )}
            {p.care && (
              <details>
                <summary>Care<Icon name="plus" size={16} /></summary>
                <div><p>{p.care}</p></div>
              </details>
            )}
            <details>
              <summary>Shipping &amp; returns<Icon name="plus" size={16} /></summary>
              <div><ShippingCopy region={region} /></div>
            </details>
          </div>
        </div>
      </div>

      <Reviews p={p} reviews={reviews} can={await reviewEligibility(session, p.slug)} />

      {bundles.length > 0 && <CompleteThisLook bundles={bundles} products={bundleProducts} current={p.slug} />}

      {look.length > 0 && (
        <section className="pdp-sec pad" aria-labelledby="look-h">
          <div className="sec-head">
            <div><span className="kick">Same occasion</span><h2 className="h2" id="look-h">Pairs <i>well with</i></h2></div>
          </div>
          <div className="rail">{look.map((x) => <ProductCard key={x.slug} p={x} />)}</div>
        </section>
      )}

      {related.length > 0 && (
        <section className="pdp-sec pad" aria-labelledby="rel-h">
          <div className="sec-head">
            <div><span className="kick">More {catLabel.toLowerCase()}</span><h2 className="h2" id="rel-h">You may <i>also like</i></h2></div>
            <Link className="link" href={`/c/${p.category}`}>View all</Link>
          </div>
          <div className="rail">{related.map((x) => <ProductCard key={x.slug} p={x} />)}</div>
        </section>
      )}

      <RecentlyViewed slug={p.slug} />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(ld) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(crumbsLd) }} />
    </div>
  );
}
