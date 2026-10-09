"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { can, type Permission } from "@/lib/permissions";

type NavLink = { href: string; label: string; icon: IconName; perm: Permission };
type NavGroup = { label: string; links: NavLink[] };

const GROUPS: NavGroup[] = [
  {
    label: "Overview",
    links: [
      { href: "/admin", label: "Dashboard", icon: "chart", perm: "dashboard.view" },
      { href: "/admin/reports", label: "Reports", icon: "sort", perm: "reports.view" },
    ],
  },
  {
    label: "Orders",
    links: [
      { href: "/admin/orders", label: "Orders", icon: "box", perm: "orders.view" },
      { href: "/admin/returns", label: "Returns", icon: "back", perm: "returns.manage" },
      { href: "/admin/packing", label: "Packing", icon: "truck", perm: "orders.ship" },
      { href: "/admin/stitching", label: "Stitching", icon: "ruler", perm: "stitching.manage" },
    ],
  },
  {
    label: "Catalogue",
    links: [
      { href: "/admin/products", label: "Products", icon: "grid", perm: "products.manage" },
      { href: "/admin/categories", label: "Categories", icon: "filter", perm: "products.manage" },
      { href: "/admin/products/import", label: "Bulk upload", icon: "upload", perm: "products.manage" },
      { href: "/admin/suppliers", label: "Suppliers", icon: "leaf", perm: "products.manage" },
    ],
  },
  {
    label: "Website",
    links: [
      { href: "/admin/homepage", label: "Homepage", icon: "home", perm: "content.manage" },
      { href: "/admin/pages", label: "Pages", icon: "edit", perm: "content.manage" },
    ],
  },
  {
    label: "Marketing",
    links: [
      { href: "/admin/sales", label: "Sales", icon: "tag", perm: "merch.manage" },
      { href: "/admin/bundles", label: "Bundles", icon: "bag", perm: "merch.manage" },
      { href: "/admin/lookbooks", label: "Lookbooks", icon: "heart", perm: "merch.manage" },
      { href: "/admin/coupons", label: "Coupons", icon: "cash", perm: "merch.manage" },
      { href: "/admin/gift-cards", label: "Gift cards", icon: "star", perm: "merch.manage" },
      { href: "/admin/journal", label: "Journal", icon: "edit", perm: "content.manage" },
    ],
  },
  {
    label: "Customers",
    links: [
      { href: "/admin/customers", label: "Customers", icon: "users", perm: "customers.view" },
      { href: "/admin/reviews", label: "Reviews", icon: "star", perm: "reviews.manage" },
      { href: "/admin/bookings", label: "Bookings", icon: "video", perm: "bookings.manage" },
      { href: "/admin/enquiries", label: "Customer messages", icon: "user", perm: "enquiries.manage" },
    ],
  },
  {
    label: "Admin",
    links: [
      { href: "/admin/messages", label: "Sent emails", icon: "globe", perm: "messages.view" },
      { href: "/admin/activity", label: "Activity", icon: "filter", perm: "activity.view" },
      { href: "/admin/staff", label: "Staff", icon: "user", perm: "staff.manage" },
      { href: "/admin/settings", label: "Settings", icon: "lock", perm: "settings.manage" },
    ],
  },
];

const ALL_HREFS = GROUPS.flatMap((g) => g.links.map((l) => l.href));

export function AdminNav({ role }: { role: string }) {
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
              <span>{l.label}</span>
            </Link>
          ))}
        </div>
      ))}
      <Link href="/" className="adm-store">
        <Icon name="home" size={18} />
        <span>View store</span>
      </Link>
    </nav>
  );
}
