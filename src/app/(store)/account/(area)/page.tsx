import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { requireUser } from "@/lib/auth";
import { Icon, type IconName } from "@/components/Icon";
import { db } from "@/lib/db";
import { ReturnRequest, User } from "@/lib/models";
import { getProductsBySlugs, getRegion } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/region";
import { logout } from "@/lib/actions/auth";
import { getOrders, getProfile, STATUS_LABEL, itemCount, type OrderView } from "../_components/data";

export const metadata: Metadata = { title: "Overview", robots: { index: false, follow: false } };

const LIVE = ["placed", "confirmed", "packed", "shipped"];
const OPEN_RETURNS = ["requested", "approved", "pickup_scheduled", "picked_up", "received"];
const STEPS = [
  { key: "confirmed", label: "Confirmed" },
  { key: "packed", label: "Packed" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
];
const stepIndex = (s: string) => (s === "placed" || s === "confirmed" ? 0 : s === "packed" ? 1 : s === "shipped" ? 2 : s === "delivered" ? 3 : -1);

/** Short "what's happening" line for the live order card. */
function liveLine(o: OrderView) {
  const latest = o.shipment?.events?.[0];
  if (latest?.code === "out_for_delivery") return "Out for delivery today";
  if (o.status === "shipped") return o.shipment?.expectedBy ? `On its way · expected ${new Date(o.shipment.expectedBy).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}` : "On its way";
  if (o.status === "packed") return "Packed, ready to ship";
  if (o.status === "placed") return o.payment.status === "paid" ? "Confirming your order" : "Waiting for payment";
  return "Confirmed, being prepared";
}

export default async function AccountOverview({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const session = await requireUser("/account");
  const { reset } = await searchParams;
  await db();
  const [profile, orders, region, settings, user, returnsOpen] = await Promise.all([
    getProfile(session.uid),
    getOrders(session.uid, 50),
    getRegion(),
    getSettings(),
    User.findById(session.uid, { wishlist: 1, loyaltyPoints: 1 }).lean<{ wishlist?: string[]; loyaltyPoints?: number }>(),
    ReturnRequest.countDocuments({ userId: session.uid, status: { $in: OPEN_RETURNS } }),
  ]);
  const first = (profile?.name || session.name).split(" ")[0];
  const live = orders.find((o) => LIVE.includes(o.status));
  const liveCount = orders.filter((o) => LIVE.includes(o.status)).length;
  const wishlist = user?.wishlist ?? [];
  const points = user?.loyaltyPoints ?? 0;
  const pointsValue = points * (settings.loyalty?.pointValue?.[region] ?? 0);
  const addresses = profile?.addresses ?? [];
  const countries = [...new Set(addresses.map((a) => (a.region === "uk" ? "UK" : "India")))];
  // A couple of saved pieces that are in stock now, to bring the shopper back to them.
  const saved = wishlist.length ? (await getProductsBySlugs(wishlist.slice(0, 12))).filter((p) => Object.values(p.stock).some((n) => n > 0)).slice(0, 2) : [];
  const whatsapp = (region === "uk" ? settings.whatsappUk || settings.whatsappIn : settings.whatsappIn || settings.whatsappUk).replace(/\D/g, "");

  const tiles: { href: string; icon: IconName; title: string; note: string; tone: string }[] = [
    { href: "/account/orders", icon: "box", title: "Orders", note: orders.length ? `${orders.length} order${orders.length === 1 ? "" : "s"}${liveCount ? ` · ${liveCount} on its way` : ""}` : "No orders yet", tone: "blue" },
    { href: "/wishlist", icon: "heart", title: "Wishlist", note: wishlist.length ? `${wishlist.length} saved` : "Save pieces you love", tone: "pink" },
    { href: "/account/rewards", icon: "star", title: "Rewards", note: points ? `${points} points = ${formatMoney(pointsValue, region)} off` : "Earn points on every order", tone: "gold" },
    { href: "/account/returns", icon: "back", title: "Returns", note: returnsOpen ? `${returnsOpen} in progress` : "No open returns", tone: "green" },
    { href: "/account/addresses", icon: "pin", title: "Addresses", note: addresses.length ? `${addresses.length} saved · ${countries.join(" & ")}` : "Add for faster checkout", tone: "stone" },
    { href: "/account/profile", icon: "user", title: "Profile", note: "Name, birthday, password", tone: "stone" },
  ];

  return (
    <div className="acx">
      <header className="acx-head">
        <div>
          <span className="kick">My account</span>
          <h1 className="acx-hello">Hello, <i>{first}</i></h1>
          {profile?.since && <small className="muted">Member since {profile.since.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</small>}
        </div>
        <Link href="/account/profile" className="acx-avatar" aria-label="Your profile">{first.charAt(0).toUpperCase() || "M"}</Link>
      </header>

      {reset === "1" && <p className="notice ok m-0" role="status">Your password has been changed and you&apos;re signed in.</p>}

      {live ? (
        <Link href={`/account/orders/${live.number}`} className="acx-live">
          <div className="acx-live-top">
            <span className="acx-live-kick">Live order</span>
            <span className="acx-live-no">{live.number}</span>
          </div>
          <div className="acx-live-main">
            {live.items[0]?.image ? <Image src={live.items[0].image} alt="" width={52} height={66} className="acx-live-img" /> : null}
            <div>
              <b>{liveLine(live)}</b>
              <span>{itemCount(live)} piece{itemCount(live) === 1 ? "" : "s"} · {formatMoney(live.total, live.region)} · {STATUS_LABEL[live.status] ?? live.status}</span>
            </div>
          </div>
          <div className="acx-steps" aria-label={`Progress: ${STEPS[Math.max(0, stepIndex(live.status))].label}`}>
            {STEPS.map((s, i) => (
              <span key={s.key} className={i <= stepIndex(live.status) ? "on" : ""} />
            ))}
          </div>
          <div className="acx-step-labels" aria-hidden="true">
            {STEPS.map((s) => <span key={s.key}>{s.label}</span>)}
          </div>
        </Link>
      ) : orders.length === 0 ? (
        <div className="acx-empty">
          <b>Your first order will show up here</b>
          <span>Track it from packing to your door.</span>
          <Link className="btn" href="/c/new">Shop new arrivals</Link>
        </div>
      ) : null}

      <nav className="acx-tiles" aria-label="Your account">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className={`acx-tile ${t.tone}`}>
            <Icon name={t.icon} size={24} />
            <b>{t.title}</b>
            <small>{t.note}</small>
          </Link>
        ))}
      </nav>

      {saved.length > 0 && (
        <section className="acx-saved" aria-labelledby="saved-h">
          <div className="acx-sec-head">
            <h2 id="saved-h">From your wishlist</h2>
            <Link href="/wishlist">See all</Link>
          </div>
          {saved.map((p) => (
            <Link key={p.slug} href={`/p/${p.slug}`} className="acx-saved-row">
              {p.images[0] ? <Image src={p.images[0]} alt="" width={50} height={64} /> : null}
              <span>
                <b>{p.name}</b>
                <small>{formatMoney(p.price[region].now, region)}{p.freeSize ? " · Free size" : ""} · In stock</small>
              </span>
              <span className="acx-saved-cta">View</span>
            </Link>
          ))}
        </section>
      )}

      {whatsapp && (
        <a className="acx-wa" href={`https://wa.me/${whatsapp}?text=${encodeURIComponent("Hi House of Muddhugumma, I need help with my account.")}`} target="_blank" rel="noopener noreferrer">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Z" /></svg>
          Chat with us on WhatsApp
        </a>
      )}
      <form action={logout} className="acx-out">
        <button type="submit">Sign out</button>
      </form>
    </div>
  );
}
