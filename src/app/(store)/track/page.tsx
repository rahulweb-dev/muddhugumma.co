import type { Metadata } from "next";
import Link from "next/link";
import { TrackForm } from "@/components/tracking/TrackForm";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Track your order",
  description: "Track your House of Muddhugumma order with your order number and the email or phone you used at checkout.",
};

export default async function TrackPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const [{ order }, session] = await Promise.all([searchParams, getSession()]);
  return (
    <div className="pad mx-auto max-w-[920px] pb-16">
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>Track order</span></nav>
      <header className="page-head">
        <span className="kick">Where is my parcel?</span>
        <h1 className="h1">Track your <i>order</i></h1>
        <p className="m-0 max-w-[60ch] text-base text-muted">
          Enter the order number from your confirmation email and the email or phone you used at checkout.
          {session ? <> You&apos;re signed in, so you can also open any order from <Link className="link" href="/account/orders">My orders</Link>.</> : null}
        </p>
      </header>
      <div className="mt-6">
        <TrackForm initialNumber={order?.slice(0, 40)} />
      </div>
    </div>
  );
}
