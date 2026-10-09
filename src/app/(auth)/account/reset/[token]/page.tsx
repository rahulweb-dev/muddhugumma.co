import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/app/(store)/account/_components/AuthShell";
import { ResetForm } from "@/app/(store)/account/_components/AuthForms";
import { checkResetToken } from "@/lib/actions/auth";
import "@/styles/account.css";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await checkResetToken(token);

  if (!valid) {
    return (
      <AuthShell kicker="Link expired" title={<>This link has <i>expired</i></>} intro="Reset links work once and for one hour. Ask for a new one and use the latest email we send.">
        <div className="flex flex-col gap-3">
          <Link className="btn block" href="/account/forgot">Send a new link</Link>
          <p className="ac-switch">
            Remembered it? <Link className="link" href="/account/login">Back to sign in</Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell kicker="Nearly there" title={<>Choose a new <i>password</i></>} intro="Pick something you haven't used here before. We'll sign you in straight after.">
      <ResetForm token={token} />
    </AuthShell>
  );
}
