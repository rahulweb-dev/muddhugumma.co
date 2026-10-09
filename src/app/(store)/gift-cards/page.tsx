import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { PurchaseForm } from "@/components/giftcards/PurchaseForm";
import "@/styles/checkout.css";

export const metadata: Metadata = {
  title: "Gift cards",
  description: "Send a House of Muddhugumma gift card by email: sarees, kurta sets and lehengas, in India (₹) or the UK (£).",
};

export default async function GiftCardsPage() {
  const session = await getSession();
  return (
    <div className="pad wrap pb-16">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span>Gift cards</span>
      </nav>
      <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-8 pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16 lg:pt-10">
        <section className="flex flex-col gap-4">
          <span className="kick">Gift cards</span>
          <h1 className="h1">Let them <i>choose</i></h1>
          <p className="m-0 max-w-[48ch] text-[15px] text-muted">
            A Kanjivaram for Amma, a festive kurta set for your sister, or the lehenga she&apos;s been saving to her wishlist. Send a gift card by email in minutes and let them pick the piece they love.
          </p>
          <div className="mt-2 flex flex-col gap-3 border border-dashed border-bronze bg-stone p-6 text-center">
            <span className="font-display text-[10px] tracking-[.38em] text-muted">HOUSE OF</span>
            <span className="font-script text-[44px] leading-none text-cocoa">Muddhugumma</span>
            <span className="font-display text-[13px] tracking-[.3em]">MG-XXXX-XXXX</span>
          </div>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13.5px]">
            <li>· Emailed to them straight after payment, with your message</li>
            <li>· Use it over several orders until the balance runs out</li>
            <li>· Valid for 12 months; works with sale prices and coupons</li>
            <li>· Cards bought in ₹ are for India orders, cards bought in £ for UK orders</li>
          </ul>
          <p className="m-0 text-[13px]">
            Already have one? <Link className="link" href="/gift-cards/balance">Check your balance</Link>
          </p>
        </section>
        <section className="border border-line bg-paper p-4 sm:p-6 md:p-8" aria-label="Buy a gift card">
          <PurchaseForm email={session?.email ?? ""} />
        </section>
      </div>
    </div>
  );
}
