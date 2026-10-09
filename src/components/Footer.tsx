import Link from "next/link";
import Image from "next/image";
import { REGION_CONFIG, type Region } from "@/lib/region";
import { Icon, type IconName } from "./Icon";
import { AppBar } from "./AppBar";
import { CookieSettingsButton } from "./analytics/CookieSettingsButton";
import { activeCategories } from "@/lib/categories";

const TRUST_ICONS: IconName[] = ["truck", "cash", "back", "leaf"];

export function TrustBar({ region }: { region: Region }) {
  return (
    <section className="trust" aria-label="Why shop with us">
      {REGION_CONFIG[region].trust.map((t, i) => (
        <div className="tr" key={t.title}>
          <Icon name={TRUST_ICONS[i]} />
          <b>{t.title}</b>
          <span>{t.note}</span>
        </div>
      ))}
    </section>
  );
}

// Column headings are h2 (not h4) so the outline has no skipped levels; the utilities match the old .foot h4 look.
const COL_H = "m-0 mb-3 font-display text-[11.5px] font-normal uppercase tracking-[.18em] text-paper";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Shop",
    links: [
      // Categories are added in Footer() from Admin → Categories.
      { label: "Sale", href: "/c/sale" },
      { label: "Gift cards", href: "/gift-cards" },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "Track your order", href: "/track" },
      { label: "Returns & exchanges", href: "/help/returns" },
      { label: "Size guide", href: "/help/size-guide" },
      { label: "Shipping", href: "/help/shipping" },
      { label: "FAQ", href: "/help/faq" },
      { label: "Contact us", href: "/contact" },
    ],
  },
  {
    title: "House",
    links: [
      { label: "Our story", href: "/about" },
      { label: "Journal", href: "/journal" },
      { label: "Lookbooks", href: "/lookbook" },
      { label: "Book a video consult", href: "/consult" },
    ],
  },
];

export async function Footer({ region }: { region: Region }) {
  const r = REGION_CONFIG[region];
  const cats = (await activeCategories()).filter((c) => c.inNav).slice(0, 6);
  const columns = COLUMNS.map((col) => (col.title === "Shop" ? { ...col, links: [...cats.map((c) => ({ label: c.name, href: `/c/${c.slug}` })), ...col.links] } : col));
  return (
    <>
      <footer className="foot pad">
        <div className="fb">
          <Link className="fb-logo" href="/" aria-label="House of Muddhugumma home">
            <Image src="brand/logo.webp" alt="" width={72} height={72} quality={90} />
          </Link>
          <small>HOUSE OF</small>
          <strong>Muddhugumma</strong>
          <p>{r.footerNote}</p>
        </div>
        {columns.map((col) => (
          <nav key={col.title} aria-labelledby={`foot-${col.title}`}>
            <h2 id={`foot-${col.title}`} className={COL_H}>{col.title}</h2>
            <ul>
              {col.links.map((l) => (
                <li key={l.href}><Link className="hover:text-paper focus-visible:text-paper" href={l.href}>{l.label}</Link></li>
              ))}
            </ul>
          </nav>
        ))}
        <div className="pay" role="group" aria-label="Payment options">
          {r.payments.map((p) => <span key={p}>{p}</span>)}
        </div>
        <div className="legal">
          <span>© {new Date().getFullYear()} House of Muddhugumma</span>
          <nav aria-label="Legal">
            <Link href="/help/privacy">Privacy</Link>
            <Link href="/help/terms">Terms</Link>
            <Link href="/help/shipping">Shipping policy</Link>
            <Link href="/help/cookies">Cookie policy</Link>
            <CookieSettingsButton className="underline-offset-2 hover:underline" />
          </nav>
        </div>
      </footer>
      <div className="appbar-space" />
      <AppBar />
    </>
  );
}
