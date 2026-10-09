import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Icon } from "@/components/Icon";
import { getOrders, getProfile } from "../_components/data";
import { AddressLines, OrderCard } from "../_components/OrderBits";

export const metadata: Metadata = { title: "Overview", robots: { index: false, follow: false } };

const QUICK = [
  { href: "/account/orders", icon: "box", title: "Orders", note: "Track, return or get help" },
  { href: "/account/addresses", icon: "pin", title: "Addresses", note: "India and UK delivery" },
  { href: "/account/profile", icon: "lock", title: "Profile & password", note: "Name, birthday, sign-in" },
  { href: "/wishlist", icon: "heart", title: "Wishlist", note: "Pieces you saved" },
] as const;

export default async function AccountOverview({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const session = await requireUser("/account");
  const { reset } = await searchParams;
  const [profile, orders] = await Promise.all([getProfile(session.uid), getOrders(session.uid, 3)]);
  const first = (profile?.name || session.name).split(" ")[0];
  const address = profile?.addresses.find((a) => a.isDefault) ?? profile?.addresses[0];

  return (
    <div className="flex min-w-0 flex-col gap-7">
      <header className="flex min-w-0 flex-col gap-2">
        <span className="kick">My account</span>
        <h1 className="h2">
          Hello, <i>{first}</i>
        </h1>
        {profile?.since && (
          <p className="muted">
            Member since {profile.since.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
          </p>
        )}
      </header>

      {reset === "1" && (
        <p className="notice ok m-0" role="status">Your password has been changed and you&apos;re signed in.</p>
      )}

      <section className="flex min-w-0 flex-col gap-3.5" aria-labelledby="recent-h">
        <div className="sec-head">
          <h2 className="h3" id="recent-h">Recent orders</h2>
          {orders.length > 0 && <Link className="link" href="/account/orders">View all</Link>}
        </div>
        {orders.length ? (
          <div className="ac-orders">{orders.map((o) => <OrderCard key={o.number} order={o} />)}</div>
        ) : (
          <div className="ac-panel ac-quiet">
            <p>You have not placed an order yet. When you do, you can track it here.</p>
            <Link className="btn" href="/c/new">Shop new arrivals</Link>
          </div>
        )}
      </section>

      <section className="flex min-w-0 flex-col gap-3.5" aria-labelledby="quick-h">
        <h2 className="h3" id="quick-h">Quick links</h2>
        <ul className="ac-quick">
          {QUICK.map((q) => (
            <li key={q.href}>
              <Link href={q.href}>
                <Icon name={q.icon} />
                <b>{q.title}</b>
                <small>{q.note}</small>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex min-w-0 flex-col gap-3.5" aria-labelledby="addr-h">
        <div className="sec-head">
          <h2 className="h3" id="addr-h">Default address</h2>
          <Link className="link" href="/account/addresses">{address ? "Manage" : "Add address"}</Link>
        </div>
        <div className="ac-panel">
          {address ? (
            <>
              <AddressLines a={address} />
              {profile && profile.addresses.length > 1 && (
                <p className="muted ac-small">+ {profile.addresses.length - 1} more saved</p>
              )}
            </>
          ) : (
            <p className="muted">No saved address yet. Add one now for a quicker checkout.</p>
          )}
        </div>
      </section>
    </div>
  );
}
