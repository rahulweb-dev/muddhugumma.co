import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { Icon } from "./Icon";
import { Announcement, RegionPill, CountBadge, MobileMenu, SearchBox, HeadHeight } from "./HeaderClient";
import type { Region } from "@/lib/region";
import { activeCategories } from "@/lib/categories";
import { getSettings } from "@/lib/settings";
import { focusPosition } from "@/lib/image-focus";

export type NavItem = { label: string; href: string; sale?: boolean; image?: string; focus?: string };

/** Main menu: New In, every category marked "Show in menu" (Admin → Categories), then Sale. */
async function mainNav(): Promise<NavItem[]> {
  const cats = (await activeCategories()).filter((c) => c.inNav);
  return [{ label: "New In", href: "/c/new" }, ...cats.map((c) => ({ label: c.name, href: `/c/${c.slug}`, image: c.image, focus: c.imageFocus })), { label: "Sale", href: "/c/sale", sale: true }];
}

/** Inspiration and service links. Desktop: the slim bar above the header. Mobile: the end of the chip row (and the menu drawer). */
export const SECONDARY_NAV = [
  { label: "Lookbooks", href: "/lookbook" },
  { label: "Journal", href: "/journal" },
  { label: "Gift cards", href: "/gift-cards" },
  { label: "Book a consult", href: "/consult" },
  { label: "Track order", href: "/track" },
  { label: "Contact us", href: "/contact" },
];

export async function Header({ region }: { region: Region }) {
  const [NAV, settings] = await Promise.all([mainNav(), getSettings()]);
  return (
    <>
      <Announcement region={region} messages={settings.announcements?.[region]} />
      <nav aria-label="More from the house" className="pad hidden h-9 items-center justify-between border-b border-line bg-stone text-[11.5px] font-semibold tracking-[.12em] text-ink uppercase min-[80rem]:flex">
        <ul className="m-0 flex list-none gap-6 p-0">
          {SECONDARY_NAV.slice(0, 3).map((n) => (
            <li key={n.href}><Link className="hover:text-bronze focus-visible:text-bronze" href={n.href}>{n.label}</Link></li>
          ))}
        </ul>
        <ul className="m-0 flex list-none gap-6 p-0">
          {SECONDARY_NAV.slice(3).map((n) => (
            <li key={n.href}><Link className="hover:text-bronze focus-visible:text-bronze" href={n.href}>{n.label}</Link></li>
          ))}
        </ul>
      </nav>
      <HeadHeight />
      <header className="head">
        <div className="head-row">
          <div className="h-left">
            <MobileMenu nav={NAV} />
          </div>
          <Link className="logo" href="/" title="House of Muddhugumma home">
            <Image src="brand/logo.webp" alt="" width={64} height={64} quality={90} priority />
            <div>
              <small>HOUSE OF</small>
              <strong>Muddhugumma</strong>
            </div>
          </Link>
          <nav className="nav" aria-label="Main">
            {NAV.map((n) => (
              <div key={n.href}>
                <Link href={n.href} className={n.sale ? "sale" : undefined}>
                  {n.label}
                </Link>
              </div>
            ))}
          </nav>
          <div className="h-right">
            <Suspense fallback={null}><SearchBox variant="desktop" /></Suspense>
            <Link className="sicon" href="/search" aria-label="Search">
              <Icon name="search" />
            </Link>
            <RegionPill />
            <Link className="dsk" href="/account" aria-label="Account">
              <Icon name="user" />
            </Link>
            <Link className="dsk badge-n" href="/wishlist" aria-label="Wishlist">
              <Icon name="heart" />
              <CountBadge kind="wish" />
            </Link>
            <Link className="badge-n" href="/bag" aria-label="Bag">
              <Icon name="bag" />
              <CountBadge kind="cart" />
            </Link>
          </div>
        </div>
      </header>
      {/* Phones: only the logo row above stays pinned; search and the category circles scroll away with the page. */}
      <div className="head-sub">
        <Suspense fallback={null}><SearchBox variant="mobile" /></Suspense>
        <nav className="cat-dots" aria-label="Shop by category">
          {NAV.map((n, i) => (
            <Link key={n.href} href={n.href} className={n.sale ? "sale" : i === 0 ? "new" : undefined}>
              <span className="cd-ring" aria-hidden="true">
                {n.image ? (
                  <Image src={n.image} alt="" width={56} height={56} sizes="56px" style={{ objectPosition: focusPosition(n.focus) }} />
                ) : (
                  <span className="cd-mark">{n.sale ? "%" : i === 0 ? "New" : n.label.charAt(0)}</span>
                )}
              </span>
              {n.label}
            </Link>
          ))}
          {SECONDARY_NAV.slice(0, 3).map((n) => (
            <Link key={n.href} href={n.href} className="more">
              <span className="cd-ring" aria-hidden="true"><span className="cd-mark">{n.label.charAt(0)}</span></span>
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
