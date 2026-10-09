import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getProfile } from "../../_components/data";
import { PasswordForm, ProfileForm } from "../../_components/ProfileForms";

export const metadata: Metadata = { title: "Profile", robots: { index: false, follow: false } };

export default async function ProfilePage() {
  const session = await requireUser("/account/profile");
  const profile = await getProfile(session.uid);

  return (
    <div className="flex min-w-0 flex-col gap-7">
      <header className="flex min-w-0 flex-col gap-2">
        <span className="kick">My account</span>
        <h1 className="h2">
          Profile <i>&amp; security</i>
        </h1>
      </header>
      <ProfileForm
        name={profile?.name ?? session.name}
        email={profile?.email ?? session.email}
        phone={profile?.phone ?? ""}
        birthday={profile?.birthday ?? ""}
        marketingOptIn={profile?.marketingOptIn ?? false}
        whatsappOptIn={profile?.whatsappOptIn ?? false}
      />
      <PasswordForm />
    </div>
  );
}
