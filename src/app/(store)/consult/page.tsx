import type { Metadata } from "next";
import Link from "next/link";
import { getRegion } from "@/lib/queries";
import { getSession } from "@/lib/auth";
import { ConsultForm } from "./ConsultForm";
import { consultDates } from "./slots";

export const metadata: Metadata = {
  title: "Book a video consult",
  description: "Book a free 30-minute video call with our stylists for bridal, trousseau or festive shopping, from India or the UK.",
};

const EXPECT = [
  ["See the weave up close", "We hold each piece to the camera in daylight so you see the true colour, the zari and the drape."],
  ["Honest advice", "Sizes, blouse styles and what suits the occasion. No pressure to buy."],
  ["Plan the whole look", "Saree or lehenga, blouse stitching, dupatta and jewellery ideas, and delivery dates."],
  ["Free, about 30 minutes", "On WhatsApp video or Google Meet, whichever you prefer."],
];

export default async function ConsultPage() {
  const [region, session] = await Promise.all([getRegion(), getSession()]);
  return (
    <div className="pad mx-auto max-w-[1180px] pb-16">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span>Book a consult</span>
      </nav>
      <header className="page-head">
        <span className="kick">Free · 30 minutes · India &amp; UK</span>
        <h1 className="h1">
          Book a video <i>consult</i>
        </h1>
        <p className="m-0 max-w-[62ch] text-base text-muted">
          Shop with a stylist from our Hyderabad studio, wherever you are. Choose a day and time, and we&apos;ll confirm within a working day.
        </p>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-14">
        <ConsultForm
          dates={consultDates()}
          defaults={{ region, name: session?.name ?? "", email: session?.email ?? "" }}
        />
        <aside aria-labelledby="expect-h" className="flex flex-col gap-5 self-start bg-stone p-6 lg:sticky lg:top-24">
          <h2 id="expect-h" className="h3">What to expect</h2>
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {EXPECT.map(([h, t]) => (
              <li key={h} className="flex flex-col gap-1">
                <b className="font-serif text-[19px] font-medium italic text-cocoa">{h}</b>
                <span className="text-[13.5px] text-muted">{t}</span>
              </li>
            ))}
          </ul>
          <p className="m-0 border-t border-line pt-4 text-[13px] text-muted">
            Prefer to talk now? See WhatsApp numbers on our <Link className="underline underline-offset-2" href="/contact">contact page</Link>.
          </p>
        </aside>
      </div>
    </div>
  );
}
