import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { requireAdmin } from "@/lib/auth";
import { ROLE_LABEL, isStaff } from "@/lib/permissions";
import { AdminNav, AdminSideShell } from "@/components/admin/AdminNav";
import { Icon } from "@/components/Icon";
import { adminLogout } from "@/lib/actions/auth";
import { AdminTopBar } from "@/components/admin/AdminTopBar";
import { REGION_FLAG, REGION_NAME, getAdminScope, getStoreLock } from "@/lib/admin-scope";
import { navCounts } from "@/lib/admin-nav-counts";
import "@/styles/admin.css";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin · House of Muddhugumma" },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [admin, scope, lock] = await Promise.all([requireAdmin(), getAdminScope(), getStoreLock()]);
  const counts = await navCounts(admin.role, scope);
  const roleLabel = isStaff(admin.role) ? ROLE_LABEL[admin.role] : "";
  return (
    <div className="adm print:block print:bg-white">
      <AdminSideShell>
        <Link href="/admin" className="adm-brand">
          <Image src="brand/logo.webp" alt="" width={44} height={44} quality={90} className="adm-brand-logo" />
          <span>
            <strong>Muddhugumma</strong>
            <small>{scope === "all" ? "Admin · India & UK" : `Admin · ${REGION_FLAG[scope]} ${REGION_NAME[scope]}`}</small>
          </span>
        </Link>
        <AdminNav role={admin.role} counts={counts} />
        <div className="adm-side-foot">
          <Link href="/" className="adm-store" target="_blank">
            <Icon name="globe" size={17} /> View the shop
          </Link>
          <div className="adm-who">
            <span className="adm-avatar" aria-hidden="true">{admin.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <b>{admin.name}</b>
              <small className="adm-role">{roleLabel}{lock ? ` · ${REGION_NAME[lock]} only` : ""}</small>
            </div>
            <form action={adminLogout} className="ml-auto">
              <button type="submit" className="adm-icon-btn adm-logout" aria-label="Sign out" title="Sign out"><Icon name="logout" size={16} /></button>
            </form>
          </div>
        </div>
      </AdminSideShell>
      <main className="adm-main">
        <AdminTopBar scope={scope} locked={!!lock} />
        {children}
      </main>
    </div>
  );
}
