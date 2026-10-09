"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { logout } from "@/lib/actions/auth";

const LINKS: { href: string; label: string; icon: IconName; exact?: boolean }[] = [
  { href: "/account", label: "Overview", icon: "user", exact: true },
  { href: "/account/orders", label: "Orders", icon: "box" },
  { href: "/account/returns", label: "Returns", icon: "back" },
  { href: "/account/rewards", label: "Rewards", icon: "star" },
  { href: "/account/addresses", label: "Addresses", icon: "pin" },
  { href: "/account/profile", label: "Profile", icon: "edit" },
  { href: "/wishlist", label: "Wishlist", icon: "heart" },
];

export function AccountNav({ name, email }: { name: string; email: string }) {
  const path = usePathname();
  return (
    <nav className="ac-nav" aria-label="Your account">
      <div className="ac-who">
        <span className="ac-mono" aria-hidden="true">{name.trim().charAt(0).toUpperCase() || "M"}</span>
        <div>
          <b>{name}</b>
          <small>{email}</small>
        </div>
      </div>
      <ul>
        {LINKS.map((l) => {
          const active = l.exact ? path === l.href : path === l.href || path.startsWith(`${l.href}/`);
          return (
            <li key={l.href}>
              <Link href={l.href} aria-current={active ? "page" : undefined}>
                <Icon name={l.icon} />
                <span>{l.label}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <form action={logout}>
            <button type="submit">
              <Icon name="logout" />
              <span>Sign out</span>
            </button>
          </form>
        </li>
      </ul>
    </nav>
  );
}
