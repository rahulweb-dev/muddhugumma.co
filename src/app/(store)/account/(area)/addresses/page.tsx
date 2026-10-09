import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getRegion } from "@/lib/queries";
import { getProfile } from "../../_components/data";
import { AddressBook } from "../../_components/AddressBook";

export const metadata: Metadata = { title: "Addresses", robots: { index: false, follow: false } };

export default async function AddressesPage() {
  const session = await requireUser("/account/addresses");
  const [profile, region] = await Promise.all([getProfile(session.uid), getRegion()]);
  const addresses = profile?.addresses ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-7">
      <header className="flex min-w-0 flex-col gap-2">
        <span className="kick">My account</span>
        <h1 className="h2">
          Saved <i>addresses</i>
        </h1>
        <p className="muted">We deliver to every pin code in India and across the United Kingdom. Your default address is pre-filled at checkout.</p>
      </header>
      <AddressBook addresses={addresses} defaultRegion={region} defaultName={profile?.name ?? session.name} defaultPhone={profile?.phone ?? ""} />
    </div>
  );
}
