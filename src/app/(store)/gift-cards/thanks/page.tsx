import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Icon } from "@/components/Icon";
import { db } from "@/lib/db";
import { GiftCard, type GiftCardDoc } from "@/lib/models";
import { activatePurchasedGiftCard } from "@/lib/giftcards";
import { razorpayConfigured, retrieveStripeSession, stripeConfigured } from "@/lib/payments";
import { formatMoney } from "@/lib/region";
import "@/styles/checkout.css";

export const metadata: Metadata = { title: "Gift card sent", robots: { index: false } };

export default async function GiftCardThanksPage({ searchParams }: { searchParams: Promise<{ ref?: string; session_id?: string; test?: string }> }) {
  const { ref: rawRef, session_id } = await searchParams;
  const ref = String(rawRef ?? "").toUpperCase();
  const jar = await cookies();
  const mine = jar.get("mg_last_gc")?.value === ref;

  let card: GiftCardDoc | null = null;
  if (/^GC\d{6}[A-Z0-9]{4}$/.test(ref)) {
    await db();
    card = await GiftCard.findOne({ orderNumber: ref }).lean<GiftCardDoc>();
    // Back from Stripe before the webhook: confirm with Stripe directly.
    if (card && !card.active && session_id) {
      const s = await retrieveStripeSession(session_id);
      if (s && s.payment_status === "paid" && s.metadata?.number === ref) card = (await activatePurchasedGiftCard(ref)) ?? card;
    }
  }

  if (!card || !mine) {
    return (
      <div className="pad wrap">
        <div className="empty">
          <Icon name="lock" size={36} />
          <h1 className="h2">Gift card <i>details</i></h1>
          <p>For security, gift card details are only shown on the device that bought the card. The code has been emailed to the recipient and the buyer.</p>
          <Link className="btn ghost" href="/gift-cards/balance">Check a balance</Link>
        </div>
      </div>
    );
  }

  const ready = card.active;
  const test = card.region === "in" ? !razorpayConfigured() : !stripeConfigured();
  return (
    <div className="pad wrap pb-16">
      <header className="co-thanks">
        <span className="co-tick" aria-hidden="true"><Icon name={ready ? "check" : "lock"} size={26} /></span>
        <span className="kick">{ready ? "Gift card sent" : "Awaiting payment"}</span>
        <h1 className="h1">{ready ? <>Your gift is <i className="serif">on its way</i></> : <>Almost <i className="serif">there</i></>}</h1>
        <p>
          {ready
            ? `We've emailed the ${formatMoney(card.initial, card.region)} gift card to ${card.recipientName || card.recipientEmail} at ${card.recipientEmail}, and a receipt to ${card.purchaserEmail}.`
            : "We haven't received the payment yet. If money left your account, the card will be sent automatically within a few minutes."}
        </p>
        {ready && test && <p className="notice">Test payment — no money was taken. Emails are logged in Admin → Messages.</p>}
      </header>
      {ready && (
        <div className="mx-auto flex max-w-[460px] flex-col gap-3 border border-dashed border-bronze bg-stone p-6 text-center">
          <span className="font-display text-[10px] tracking-[.38em] text-muted">HOUSE OF</span>
          <span className="font-script text-[40px] leading-none text-cocoa">Muddhugumma</span>
          <strong className="font-display text-[22px] tracking-[.2em]">{card.code}</strong>
          <span className="text-[13px] text-muted">{formatMoney(card.initial, card.region)} · {card.region === "in" ? "India (₹)" : "UK (£)"} orders · purchase {ref}</span>
        </div>
      )}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link className="btn" href="/c/new">Continue shopping</Link>
        <Link className="btn ghost" href="/gift-cards">Send another</Link>
      </div>
    </div>
  );
}
