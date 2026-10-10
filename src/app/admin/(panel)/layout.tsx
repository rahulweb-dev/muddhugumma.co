import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { ROLE_LABEL, isStaff } from "@/lib/permissions";
import { AdminNav } from "@/components/admin/AdminNav";
import { Icon } from "@/components/Icon";
import { adminLogout } from "@/lib/actions/auth";
import { AdminTopBar } from "@/components/admin/AdminTopBar";
import { getAdminScope } from "@/lib/admin-scope";
import "@/styles/admin.css";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin · House of Muddhugumma" },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [admin, scope] = await Promise.all([requireAdmin(), getAdminScope()]);
  const roleLabel = isStaff(admin.role) ? ROLE_LABEL[admin.role] : "";
  return (
    <div className="adm print:block print:bg-white">
      <aside className="adm-side print:hidden">
        <Link href="/admin" className="adm-brand">
          <strong>Muddhugumma</strong>
          <small>Admin</small>
          <span className="adm-brand-role">{admin.name.split(" ")[0]} · {roleLabel}</span>
        </Link>
        <AdminNav role={admin.role} />
        <div className="adm-who">
          <span className="adm-avatar" aria-hidden="true">{admin.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <b>{admin.name}</b>
            <small className="adm-role">{roleLabel}</small>
            <small title={admin.email}>{admin.email}</small>
          </div>
          <form action={adminLogout} className="ml-auto">
            <button type="submit" className="adm-icon-btn" aria-label="Sign out" title="Sign out"><Icon name="logout" size={16} /></button>
          </form>
        </div>
      </aside>
      <main className="adm-main">
        <AdminTopBar scope={scope} />
        {children}
      </main>
    </div>
  );
}
