import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { isStaff } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

// Standalone page: no shop header, footer or app bar.
export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getSession();
  if (session && isStaff(session.role)) redirect("/admin");
  const { next } = await searchParams;

  return (
    <main className="grid min-h-dvh place-items-center bg-stone px-4 py-10">
      <div className="w-full max-w-[400px] border border-line bg-paper p-7 shadow-[0_30px_60px_-40px_rgba(27,26,24,.45)] sm:p-9">
        <div className="mb-7 flex items-center gap-3">
          <Image src="brand/logo.webp" alt="" width={48} height={48} className="rounded-full border border-line" priority />
          <div className="leading-none">
            <small className="block font-display text-[9px] tracking-[.38em] text-muted">HOUSE OF</small>
            <strong className="mt-1 block font-script text-[28px] font-normal text-cocoa">Muddhugumma</strong>
          </div>
        </div>
        <span className="kick">Admin</span>
        <h1 className="h2 mb-6 mt-1">Sign <i>in</i></h1>
        <AdminLoginForm next={next} />
        {process.env.NODE_ENV !== "production" && (
          <p className="mt-6 border-l-2 border-bronze bg-stone px-3 py-2 text-xs text-muted">
            Dev login: {process.env.ADMIN_EMAIL || "admin@muddhugumma.com"} / {process.env.ADMIN_PASSWORD ? "(ADMIN_PASSWORD in .env.local)" : "ChangeMe!2026"}
          </p>
        )}
        <Link href="/" className="mt-6 inline-block text-xs text-muted underline underline-offset-2 hover:text-ink">← Back to the store</Link>
      </div>
    </main>
  );
}
