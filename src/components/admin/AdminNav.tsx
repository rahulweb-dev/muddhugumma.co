"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { can, type Permission } from "@/lib/permissions";

type NavLink = { href: string; label: string; icon: IconName; perm: Permission };
type NavGroup = { label: string; links: NavLink[] };

// Grouped by task, in plain words. Each person only sees the links their role allows (src/lib/permissions.ts).
const GROUPS: NavGroup[] = [
  {
    label: "Today",
    links: [
      { href: "/admin", label: "Dashboard", icon: "chart", perm: "dashboard.view" },
      { href: "/admin/reports", label: "Sales reports", icon: "sort", perm: "reports.view" },
    ],
  },
  {
    label: "Orders",
    links: [
      { href: "/admin/orders", label: "All orders", icon: "box", perm: "orders.view" },
      { href: "/admin/packing", label: "Ready to pack", icon: "truck", perm: "orders.ship" },
      { href: "/admin/returns", label: "Returns & exchanges", icon: "back", perm: "returns.manage" },
      { href: "/admin/stitching", label: "Tailoring", icon: "ruler", perm: "stitching.manage" },
    ],
  },
  {
    label: "Stock & products",
    links: [
      { href: "/admin/stock", label: "Stock (India & UK)", icon: "grid", perm: "products.manage" },
      { href: "/admin/products", label: "Products", icon: "bag", perm: "products.manage" },
      { href: "/admin/categories", label: "Categories", icon: "filter", perm: "products.manage" },
      { href: "/admin/products/import", label: "Bulk upload (CSV)", icon: "upload", perm: "products.manage" },
      { href: "/admin/suppliers", label: "Suppliers", icon: "leaf", perm: "products.manage" },
    ],
  },
  {
    label: "Marketing",
    links: [
      { href: "/admin/sales", label: "Sales & discounts", icon: "tag", perm: "merch.manage" },
      { href: "/admin/coupons", label: "Coupon codes", icon: "cash", perm: "merch.manage" },
      { href: "/admin/gift-cards", label: "Gift cards", icon: "star", perm: "merch.manage" },
      { href: "/admin/bundles", label: "Shop the look", icon: "heart", perm: "merch.manage" },
      { href: "/admin/lookbooks", label: "Lookbooks", icon: "heart", perm: "merch.manage" },
    ],
  },
  {
    label: "Website",
    links: [
      { href: "/admin/homepage", label: "Homepage", icon: "home", perm: "content.manage" },
      { href: "/admin/pages", label: "Info pages", icon: "edit", perm: "content.manage" },
      { href: "/admin/journal", label: "Journal (blog)", icon: "edit", perm: "content.manage" },
    ],
  },
  {
    label: "Customers",
    links: [
      { href: "/admin/customers", label: "Customers", icon: "users", perm: "customers.view" },
      { href: "/admin/enquiries", label: "Messages from customers", icon: "user", perm: "enquiries.manage" },
      { href: "/admin/reviews", label: "Reviews", icon: "star", perm: "reviews.manage" },
      { href: "/admin/bookings", label: "Video consults", icon: "video", perm: "bookings.manage" },
    ],
  },
  {
    label: "Settings",
    links: [
      { href: "/admin/settings", label: "Store settings", icon: "lock", perm: "settings.manage" },
      { href: "/admin/staff", label: "Staff & roles", icon: "user", perm: "staff.manage" },
      { href: "/admin/messages", label: "Emails sent", icon: "globe", perm: "messages.view" },
      { href: "/admin/activity", label: "Activity log", icon: "filter", perm: "activity.view" },
    ],
  },
];

const ALL_HREFS = GROUPS.flatMap((g) => g.links.map((l) => l.href));

export function AdminNav({ role, counts = {} }: { role: string; counts?: Record<string, number> }) {
  const path = usePathname() || "/admin";
  // The most specific matching link wins, so /admin/products/import doesn't also light up Products.
  const match = ALL_HREFS.filter((h) => (h === "/admin" ? path === "/admin" : path === h || path.startsWith(h + "/"))).sort((a, b) => b.length - a.length)[0];
  const groups = GROUPS.map((g) => ({ ...g, links: g.links.filter((l) => can(role, l.perm)) })).filter((g) => g.links.length);
  return (
    <nav className="adm-nav" aria-label="Admin">
      {groups.map((g) => (
        <div key={g.label} className="adm-nav-group" role="group" aria-label={g.label}>
          <span className="adm-nav-label" aria-hidden="true">{g.label}</span>
          {g.links.map((l) => (
            <Link key={l.href} href={l.href} aria-current={match === l.href ? "page" : undefined}>
              <Icon name={l.icon} size={18} />
              <span className="adm-nav-text">{l.label}</span>
              {counts[l.href] ? <span className="adm-nav-badge" aria-label={`${counts[l.href]} waiting`}>{counts[l.href] > 99 ? "99+" : counts[l.href]}</span> : null}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

/** Phones and tablets: a top bar with a Menu button that slides the sidebar in. Desktop: the sidebar is always there. */
export function AdminSideShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);
  return (
    <>
      <div className="adm-mbar print:hidden">
        <button type="button" className="adm-mbar-btn" aria-label="Open menu" aria-expanded={open} aria-controls="adm-side" onClick={() => setOpen(true)}>
          <Icon name="menu" size={20} />
        </button>
        <Link href="/admin" className="adm-mbar-brand">Muddhugumma <small>Admin</small></Link>
      </div>
      {open && <div className="adm-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside id="adm-side" className={`adm-side print:hidden${open ? " open" : ""}`}>
        <button type="button" className="adm-side-close" aria-label="Close menu" onClick={() => setOpen(false)}>
          <Icon name="x" size={18} />
        </button>
        {children}
      </aside>
    </>
  );
}
