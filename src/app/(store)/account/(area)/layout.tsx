import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { requireUser } from "@/lib/auth";
import { Icon } from "@/components/Icon";
import { CountBadge } from "@/components/HeaderClient";
import { AccountNav } from "../_components/AccountNav";
import "@/styles/account.css";

export const metadata: Metadata = {
  title: { default: "My account", template: "%s · My account · House of Muddhugumma" },
  robots: { index: false, follow: false },
};

export default async function AccountAreaLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser("/account");
  return (
    // .ac-area hides the shop header and footer (see account.css); this slim bar replaces them.
    <div className="ac-area">
      <div className="ac-top">
        <Link href="/" className="ac-top-back"><Icon name="back" size={18} /> Shop</Link>
        <Link href="/" className="ac-top-logo" aria-label="House of Muddhugumma home">
          <Image src="brand/logo.webp" alt="" width={36} height={36} quality={90} />
          <span><small>HOUSE OF</small><strong>Muddhugumma</strong></span>
        </Link>
        <Link href="/bag" className="ac-top-bag badge-n" aria-label="Bag">
          <Icon name="bag" />
          <CountBadge kind="cart" />
        </Link>
      </div>
      <div className="pad mx-auto grid max-w-[1240px] grid-cols-1 gap-5 pt-3 pb-14 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start lg:gap-14 lg:pt-10 lg:pb-20">
        <AccountNav name={session.name} email={session.email} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
