"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";
import { useStore } from "./StoreProvider";

const ITEMS: { label: string; href: string; icon: IconName; match: (p: string) => boolean }[] = [
  { label: "Home", href: "/", icon: "home", match: (p) => p === "/" },
  { label: "Categories", href: "/c/all", icon: "grid", match: (p) => p.startsWith("/c/") || p.startsWith("/search") },
  { label: "Wishlist", href: "/wishlist", icon: "heart", match: (p) => p === "/wishlist" },
  { label: "Bag", href: "/bag", icon: "bag", match: (p) => p === "/bag" || p.startsWith("/checkout") },
  { label: "Account", href: "/account", icon: "user", match: (p) => p.startsWith("/account") },
];

/** Mobile bottom bar, hidden on product pages where the add-to-bag bar takes its place. */
export function AppBar() {
  const pathname = usePathname();
  const { cartCount } = useStore();
  if (pathname.startsWith("/p/") || pathname.startsWith("/admin") || pathname.startsWith("/checkout")) return null;
  return (
    <nav className="appbar" aria-label="Quick links">
      {ITEMS.map((it) => {
        const count = it.label === "Bag" ? cartCount : 0;
        return (
          <Link key={it.href} href={it.href} aria-current={it.match(pathname) ? "page" : undefined}>
            <span className="badge-n" aria-hidden="true">
              <Icon name={it.icon} />
              {it.label === "Bag" && <em hidden={!cartCount}>{cartCount}</em>}
            </span>
            {it.label}
            {count > 0 && <span className="sr-only">, {count} {count === 1 ? "item" : "items"}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
