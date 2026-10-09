import type { Metadata } from "next";
import Link from "next/link";
import { BalanceChecker } from "@/components/giftcards/BalanceChecker";
import "@/styles/checkout.css";

export const metadata: Metadata = { title: "Gift card balance", robots: { index: false } };

export default async function GiftCardBalancePage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return (
    <div className="pad wrap pb-16">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span><Link href="/gift-cards">Gift cards</Link></span>
        <span>Balance</span>
      </nav>
      <div className="mx-auto flex max-w-[520px] flex-col gap-5 pt-8">
        <span className="kick">Gift cards</span>
        <h1 className="h1">Check your <i>balance</i></h1>
        <p className="m-0 text-muted">Enter the code from your gift card email. It looks like MG-7KQ2-X9PA.</p>
        <BalanceChecker initial={typeof code === "string" ? code.slice(0, 20).toUpperCase() : ""} />
        <p className="m-0 text-[13px] text-muted">
          To spend it, add pieces to your bag and enter the code in the <b>Gift card</b> box on the payment step. <Link className="link" href="/gift-cards">Buy a gift card</Link>
        </p>
      </div>
    </div>
  );
}
