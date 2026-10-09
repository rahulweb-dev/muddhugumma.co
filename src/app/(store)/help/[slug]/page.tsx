import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo-meta";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { getRegion } from "@/lib/queries";
import { REGION_CONFIG, SIZE_CHART, formatMoney, type Region } from "@/lib/region";
import { CookieSettingsButton } from "@/components/analytics/CookieSettingsButton";
import { CONSENT_COOKIE } from "@/lib/analytics";
import { getPage } from "@/lib/pages";
import { CmsArticle } from "@/components/CmsArticle";

type Section = { h: string; body: React.ReactNode };
type HelpPage = { title: string; accent: string; intro: string; sections: (r: Region) => Section[] };

const both = (fn: (r: Region) => React.ReactNode) => (
  <div className="grid gap-3.5 md:grid-cols-2">
    {(["in", "uk"] as const).map((r) => (
      <div key={r} className="flex flex-col gap-2 bg-stone px-[18px] py-4">
        <span className="kick">{REGION_CONFIG[r].label}</span>
        {fn(r)}
      </div>
    ))}
  </div>
);

const PAGES: Record<string, HelpPage> = {
  shipping: {
    title: "Shipping", accent: "& delivery",
    intro: "We ship every order from our studio in Hyderabad. Delivery times below are counted in working days from dispatch.",
    sections: () => [
      {
        h: "Delivery charges and times",
        body: both((r) => {
          const c = REGION_CONFIG[r];
          return (
            <ul>
              <li>Free delivery on orders of {formatMoney(c.freeShippingAt, r)} or more.</li>
              <li>Below that, delivery costs {formatMoney(c.shippingFee, r)}.</li>
              <li>Arrives in {c.eta[0]}–{c.eta[1]} working days after dispatch.</li>
              {r === "in" ? <li>Cash on delivery available across India for a {formatMoney(c.codFee, r)} handling fee.</li> : <li>Duties and VAT are included in our prices, so there is nothing to pay at the door.</li>}
            </ul>
          );
        }),
      },
      { h: "Dispatch", body: <p>Ready-to-ship pieces leave our studio within 1–2 working days. Stitched blouses add 5–7 days. Made-to-order bridal lehengas take 4–6 weeks and we confirm the date on a call.</p> },
      { h: "Tracking", body: <p>You will get a tracking link by email and SMS once your parcel is dispatched. You can also follow it in <Link href="/account/orders">My orders</Link>.</p> },
      { h: "Festive cut-off dates", body: both((r) => <p>{REGION_CONFIG[r].announcements[2]}. Order before this date for delivery before Diwali.</p>) },
    ],
  },
  returns: {
    title: "Returns", accent: "& exchanges",
    intro: "If something is not right, we will make it right. Here is how returns work in each country.",
    sections: () => [
      {
        h: "Return window",
        body: both((r) => (
          <ul>
            <li>Return within {REGION_CONFIG[r].returnsDays} days of delivery.</li>
            <li>{r === "in" ? "We arrange a free pickup from your address." : "We email you a prepaid UK returns label."}</li>
            <li>Refunds reach your original payment method within 5–7 working days of the return reaching us{r === "in" ? "; COD orders are refunded to your bank account or as store credit." : "."}</li>
          </ul>
        )),
      },
      { h: "What can be returned", body: <ul><li>Unworn pieces with tags and the original packaging.</li><li>Sarees with an unstitched blouse piece and no fall or pico work.</li></ul> },
      { h: "What cannot be returned", body: <ul><li>Stitched blouses and pieces altered to your measurements.</li><li>Made-to-order bridal lehengas.</li><li>Sarees with fall and pico added at your request.</li></ul> },
      { h: "Exchanges", body: <p>Need a different size? Start a return from <Link href="/account/orders">My orders</Link> and choose “Exchange”. We ship the new size as soon as the pickup is done.</p> },
    ],
  },
  "size-guide": {
    title: "Size", accent: "guide",
    intro: "Our kurta sets and lehenga blouses follow the chart below. Measure over light clothing, keeping the tape snug but not tight.",
    sections: () => [
      {
        h: "Body measurements (inches)",
        body: (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>India</th><th>UK</th><th className="num">Bust</th><th className="num">Waist</th><th className="num">Hip</th></tr></thead>
              <tbody>{SIZE_CHART.map((s) => <tr key={s.in}><td>{s.in}</td><td>{s.uk}</td><td className="num">{s.bust}</td><td className="num">{s.waist}</td><td className="num">{s.hip}</td></tr>)}</tbody>
            </table>
          </div>
        ),
      },
      { h: "Sarees", body: <p>Sarees are free size: 5.5 m of drape plus a 0.8 m blouse piece. Add blouse stitching on the product page and we will call you for measurements.</p> },
      { h: "Between sizes?", body: <p>Pick the larger size for kurtas; most have 1.5 inches of seam allowance at the sides. For lehengas, <Link href="/consult">book a free video fitting</Link> with a stylist.</p> },
    ],
  },
  faq: {
    title: "Frequently", accent: "asked",
    intro: "Quick answers to what our customers ask most.",
    sections: (r) => [
      { h: "Are your silks genuine?", body: <p>Our Kanjeevaram and Banarasi silks come with a Silk Mark tag, and pure-zari sarees include a zari test certificate.</p> },
      { h: "Do you ship outside India and the UK?", body: <p>Not yet. We are starting with India and the United Kingdom and plan to add the US, Canada and the UAE next.</p> },
      { h: "Will I pay customs in the UK?", body: <p>No. UK prices include duties and VAT, and we clear customs before the parcel reaches you.</p> },
      { h: "Can I pay cash on delivery?", body: <p>Yes, everywhere in India, for a {formatMoney(REGION_CONFIG.in.codFee, "in")} handling fee. In the UK we accept cards, Apple Pay, Google Pay and Pay in 3.</p> },
      { h: "Can I get a blouse stitched?", body: <p>Yes. Choose “Stitched to measurement” on any saree for {formatMoney(REGION_CONFIG[r].blouseStitching, r)}. Our tailor will call you within a day of your order.</p> },
      { h: "How do I care for silk?", body: <p>Dry clean only, store folded in muslin and refold every few months so the zari does not crease in one place.</p> },
    ],
  },
  contact: {
    title: "Contact", accent: "us",
    intro: "Talk to a stylist, ask about an order, or book a free video consult for bridal and trousseau shopping.",
    sections: () => [
      {
        h: "Customer care",
        body: both((r) => (
          <ul>
            <li>WhatsApp: {r === "in" ? "+91 90000 00000" : "+44 7000 000000"}</li>
            <li>Email: care@muddhugumma.com</li>
            <li>Hours: {r === "in" ? "Mon–Sat, 10am–7pm IST" : "Mon–Sat, 9am–5pm GMT"}</li>
          </ul>
        )),
      },
      {
        h: "Video styling and bridal consults",
        body: (
          <>
            <p>Book a free 30-minute video call to see sarees and lehengas up close, check colours in daylight and plan your trousseau. Choose a day and time online and we will confirm within a working day.</p>
            <p><Link className="btn mt-1 no-underline!" href="/consult">Book a video consult</Link></p>
          </>
        ),
      },
      { h: "Studio", body: <p>House of Muddhugumma, Jubilee Hills, Hyderabad, Telangana 500033, India. Visits by appointment.</p> },
    ],
  },
  privacy: {
    title: "Privacy", accent: "policy",
    intro: "How we collect and use your personal information. This summary is a starting point and should be reviewed by your legal adviser before launch.",
    sections: () => [
      { h: "What we collect", body: <p>Your name, contact details and delivery address when you order; your order history; and basic analytics about how the site is used.</p> },
      { h: "How we use it", body: <p>To deliver orders, provide customer care, prevent fraud and, if you opt in, send you news about new collections.</p> },
      { h: "Payments", body: <p>Card and UPI details are handled by our payment partners (Razorpay in India, Stripe in the UK). We never store full card numbers.</p> },
      { h: "Cookies", body: <p>We use essential cookies to run the shop and, only if you agree, analytics and marketing cookies. See our <Link href="/help/cookies">cookie policy</Link>.</p> },
      { h: "Your rights", body: <p>You can ask for a copy of your data or ask us to delete it by emailing care@muddhugumma.com. UK customers have rights under UK GDPR; Indian customers under the Digital Personal Data Protection Act, 2023.</p> },
    ],
  },
  cookies: {
    title: "Cookie", accent: "policy",
    intro: "Cookies are small files your browser keeps for a website. Here is every kind we use, and how to change your choice at any time.",
    sections: () => [
      {
        h: "Your choice",
        body: (
          <>
            <p>When you first visit, we ask before using any cookie that is not essential. You can accept all, reject everything non-essential, or choose by category. We remember your choice for six months, then ask again.</p>
            <p><CookieSettingsButton className="btn ghost mt-1">Change cookie settings</CookieSettingsButton></p>
          </>
        ),
      },
      {
        h: "Essential (always on)",
        body: (
          <ul>
            <li><b>mg_region</b>: whether you shop in India (₹) or the UK (£). One year.</li>
            <li><b>mg_session</b>: keeps you signed in. 30 days, or until you sign out.</li>
            <li><b>{CONSENT_COOKIE}</b>: remembers your cookie choice. Six months.</li>
            <li>Your bag and wishlist are kept in your browser&apos;s own storage on this device, not in a cookie, and are never shared.</li>
          </ul>
        ),
      },
      {
        h: "Analytics (only with your permission)",
        body: <p>Google Analytics 4 (cookies starting <b>_ga</b>, up to 13 months) tells us which pages and products are viewed and where visitors come from, so we can make the shop easier to use. IP addresses are not stored, and we never sell this information.</p>,
      },
      {
        h: "Marketing (only with your permission)",
        body: <p>Meta Pixel (cookies <b>_fbp</b> and <b>_fbc</b>, up to 3 months) measures our Instagram and Facebook ads and lets Meta show you pieces you looked at here. Meta acts as a separate controller for this data under its own privacy policy.</p>,
      },
      {
        h: "Changing your mind",
        body: <p>Use “Cookie settings” at the bottom of any page. If you switch analytics or marketing off, we delete their cookies and reload the page so they stop straight away. You can also clear cookies in your browser settings. Questions: care@muddhugumma.com.</p>,
      },
      {
        h: "The law",
        body: <p>For UK shoppers we follow UK GDPR and the Privacy and Electronic Communications Regulations (PECR); for Indian shoppers, the Digital Personal Data Protection Act, 2023. Read more in our <Link href="/help/privacy">privacy policy</Link>.</p>,
      },
    ],
  },
  terms: {
    title: "Terms", accent: "of sale",
    intro: "The terms that apply when you buy from House of Muddhugumma. Review with your legal adviser before launch.",
    sections: () => [
      { h: "Products and colours", body: <p>Handwoven and hand-printed pieces have small irregularities that are part of the craft. Colours may vary slightly from screen to fabric.</p> },
      { h: "Prices", body: <p>Prices are in Indian rupees for India and pounds sterling for the UK, and include applicable taxes and duties.</p> },
      { h: "Orders", body: <p>Your order is confirmed when you receive a confirmation email. We may cancel and refund an order if an item is unavailable.</p> },
      { h: "Governing law", body: <p>These terms are governed by the laws of India, without affecting the statutory rights of UK consumers.</p> },
    ],
  },
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const saved = await getPage(slug);
  const p = PAGES[slug];
  const title = saved?.title || (p ? `${p.title} ${p.accent}`.replace("& ", "and ") : "");
  if (!title) return {};
  return pageMeta({ title, description: saved?.intro || p?.intro || title, path: `/help/${slug}`, kicker: "Help" });
}

export default async function HelpPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === "contact") permanentRedirect("/contact");
  const page = PAGES[slug];
  const saved = await getPage(slug); // edited in Admin → Pages; replaces the built-in text
  if (!page && !saved) notFound();
  const heading = saved?.title ?? `${page!.title} ${page!.accent}`;
  const region = await getRegion();
  const titles = Object.fromEntries(await Promise.all(Object.keys(PAGES).map(async (k) => [k, (await getPage(k))?.title] as const)));
  return (
    <div className="pad pb-16">
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>Help</span><span>{heading}</span></nav>
      <div className="grid grid-cols-1 gap-7 pt-2 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-14 lg:pt-6">
        <aside aria-label="Help topics" className="lg:sticky lg:top-24 lg:self-start">
          <span className="kick">Help centre</span>
          <ul className="mt-2.5 flex gap-2 overflow-x-auto [scrollbar-width:none] lg:flex-col lg:gap-0.5">
            {Object.entries(PAGES).map(([k, v]) => (
              <li key={k}>
                <Link
                  href={k === "contact" ? "/contact" : `/help/${k}`}
                  aria-current={k === slug ? "page" : undefined}
                  className="block whitespace-nowrap rounded-full border border-line px-3 py-[7px] text-[13px] aria-[current=page]:border-ink aria-[current=page]:bg-ink aria-[current=page]:text-paper lg:rounded-none lg:border-0 lg:border-b lg:px-0 lg:py-2 lg:aria-[current=page]:border-line lg:aria-[current=page]:bg-transparent lg:aria-[current=page]:text-bronze"
                >
                  {titles[k] ?? `${v.title} ${v.accent}`}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
        {saved ? (
          <CmsArticle page={saved} />
        ) : (
        <article className="min-w-0 max-w-[760px]">
          <header className="page-head">
            <h1 className="h1">{page!.title} <i>{page!.accent}</i></h1>
            <p className="m-0 max-w-[60ch] text-base text-muted">{page!.intro}</p>
          </header>
          {page!.sections(region).map((s) => (
            <section key={s.h} className="flex flex-col gap-3 border-t border-line py-[22px] text-[15px] leading-relaxed text-[#3E3A35] [&_a]:underline [&_a]:underline-offset-[3px] [&_li]:max-w-[65ch] [&_p]:m-0 [&_p]:max-w-[65ch] [&_ul]:m-0 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-[18px]">
              <h2 className="h3">{s.h}</h2>
              {s.body}
            </section>
          ))}
        </article>
        )}
      </div>
    </div>
  );
}
