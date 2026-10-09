import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AuthShell, cleanNext } from "@/app/(store)/account/_components/AuthShell";
import { RegisterForm } from "@/app/(store)/account/_components/AuthForms";
import "@/styles/account.css";

export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: false, follow: false },
};

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = cleanNext(sp.next);
  if (await getSession()) redirect(next ?? "/account");
  const rawRef = Array.isArray(sp.ref) ? sp.ref[0] : sp.ref;
  const referral = rawRef && /^[A-Za-z0-9-]{3,24}$/.test(rawRef) ? rawRef.toUpperCase() : undefined;

  return (
    <AuthShell kicker="Join the house" title={<>Create an <i>account</i></>} intro="Faster checkout, order tracking and a wishlist that follows you from phone to laptop.">
      <RegisterForm next={next} referral={referral} />
    </AuthShell>
  );
}
