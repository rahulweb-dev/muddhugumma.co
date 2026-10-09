import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AuthShell, cleanNext } from "@/app/(store)/account/_components/AuthShell";
import { LoginForm } from "@/app/(store)/account/_components/AuthForms";
import "@/styles/account.css";
import { isStaff } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const next = cleanNext((await searchParams).next);
  const session = await getSession();
  if (session) redirect(next ?? (isStaff(session.role) ? "/admin" : "/account"));

  return (
    <AuthShell kicker="Welcome back" title={<>Sign <i>in</i></>} intro="Track orders, save addresses and keep your wishlist on every device.">
      <LoginForm next={next} />
    </AuthShell>
  );
}
