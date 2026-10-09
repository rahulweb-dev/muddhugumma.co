import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getPage } from "@/lib/pages";
import { CmsArticle } from "@/components/CmsArticle";

export async function generateMetadata(): Promise<Metadata> {
  const saved = await getPage("about");
  return saved ? { title: saved.title, description: saved.intro || undefined } : metadata;
}

const metadata: Metadata = {
  title: "Our story",
  description: "House of Muddhugumma brings handloom sarees, chikankari and bridal lehengas from India's weaving clusters to women in India and the UK.",
};

const WEAVERS = [
  { place: "Kanchipuram", region: "Tamil Nadu", craft: "Korvai silk", text: "Heavy mulberry silk with borders interlocked by hand, a technique that takes two weavers working together." },
  { place: "Varanasi", region: "Uttar Pradesh", craft: "Banarasi brocade", text: "Kadhua weaving, where each motif is woven separately with its own shuttle of zari." },
  { place: "Lucknow", region: "Uttar Pradesh", craft: "Chikankari", text: "Thirty-two kinds of white-on-white stitches, embroidered by women artisans at home." },
  { place: "Bagru", region: "Rajasthan", craft: "Block print", text: "Carved teak blocks and natural dyes from pomegranate, indigo and iron, printed on riverside tables." },
  { place: "Pochampally", region: "Telangana", craft: "Ikat", text: "Threads tie-dyed before weaving, so the pattern appears as the cloth grows on the loom." },
];

const PROMISES = [
  ["Real craft, clearly labelled", "Every product page names the cluster, the technique and the fabric. Silk Mark tags come with our silks."],
  ["Fair to the weaver", "We pay weavers directly and agree prices before the loom is set up, not after."],
  ["Easy wherever you live", "Cash on delivery across India, duties included in the UK, and returns collected or prepaid."],
  ["Help from real people", "Video styling calls for bridal and festive shopping, with a stylist who knows the weaves."],
];

export default async function AboutPage() {
  // Written in Admin → Pages ("about"): replaces the built-in story below.
  const saved = await getPage("about");
  if (saved)
    return (
      <div className="pad pb-16">
        <nav className="crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>{saved.title}</span></nav>
        <div className="mx-auto max-w-[760px] pt-2 lg:pt-6"><CmsArticle page={saved} /></div>
      </div>
    );
  return (
    <>
      <section className="pad grid items-center gap-6 pb-10 pt-7 md:grid-cols-2 md:gap-14 md:pb-16 md:pt-12">
        <div className="mount arch aspect-[4/4.6]">
          <Image src="products/hero-banarasi-green.webp" alt="Model in a green Banarasi silk saree" fill sizes="(min-width:720px) 45vw, 100vw" priority className="object-[50%_20%]" />
        </div>
        <div className="flex flex-col gap-4">
          <span className="kick">Our story</span>
          <h1 className="h1">A house built on <i>what our mothers wore</i></h1>
          <p className="m-0 max-w-[52ch] text-base leading-relaxed text-muted">
            Muddhugumma is what our grandmother called the youngest girl in the family: a cherished, darling child. The name holds what we want every piece to feel like, something chosen with love and kept for years.
          </p>
          <p className="m-0 max-w-[52ch] text-base leading-relaxed text-muted">
            We buy directly from weaving families in five clusters, pay fair prices and tell you exactly where each piece comes from. Then we bring them to women in India and across the United Kingdom, with duties included and returns made easy.
          </p>
          <div><Link className="btn" href="/c/all">Shop the collection</Link></div>
        </div>
      </section>

      <section id="weavers" className="pad flex scroll-mt-24 flex-col gap-5 bg-stone py-11">
        <div className="sec-head"><div><span className="kick">Our weavers</span><h2 className="h2">Five clusters, <i>one house</i></h2></div></div>
        <div className="grid gap-2.5 md:grid-cols-3 xl:grid-cols-5">
          {WEAVERS.map((w) => (
            <div key={w.place} className="relative flex flex-col gap-1.5 bg-paper p-5 after:pointer-events-none after:absolute after:inset-1.5 after:border after:border-line after:content-['']">
              <span className="text-[11px] font-bold uppercase tracking-[.14em] text-bronze">{w.craft}</span>
              <b className="font-serif text-2xl font-medium">{w.place}</b>
              <small className="text-muted">{w.region}</small>
              <p className="m-0 text-muted">{w.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pad grid gap-6 py-11 md:grid-cols-[1fr_1.4fr] md:gap-14">
        <div><span className="kick">Our promise</span><h2 className="h2">How we <i>do things</i></h2></div>
        <ol className="m-0 grid list-none gap-4 p-0">
          {PROMISES.map(([title, text], i) => (
            <li key={title} className="grid grid-cols-[48px_1fr] items-start gap-3">
              <span className="font-display text-[22px] text-bronze tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <b className="mb-1 block font-display text-[13px] font-normal uppercase tracking-[.1em]">{title}</b>
                <p className="m-0 text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
