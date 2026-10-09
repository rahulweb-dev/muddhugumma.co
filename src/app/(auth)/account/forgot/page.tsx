import type { Metadata } from "next";
import { AuthShell } from "@/app/(store)/account/_components/AuthShell";
import { ForgotForm } from "@/app/(store)/account/_components/AuthForms";
import "@/styles/account.css";

export const metadata: Metadata = {
  title: "Forgot password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell kicker="It happens" title={<>Forgot your <i>password?</i></>} intro="Enter the email you shop with and we'll send you a link to choose a new password.">
      <ForgotForm />
    </AuthShell>
  );
}
