import type { Metadata } from "next";
import { CheckoutClient, type CheckoutUser } from "@/components/checkout/CheckoutClient";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { User } from "@/lib/models";
import { getSettings } from "@/lib/settings";
import { getActiveSales } from "@/lib/sales";
import { otpDeliverable } from "@/lib/otp";
import { toCheckoutSettings } from "@/lib/checkout-pricing";
import { REGIONS, deliveryWindow, shortDate, type Region } from "@/lib/region";
import "@/styles/checkout.css";
import { TrackOnMount } from "@/components/analytics/TrackOnMount";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

type LeanAddress = { _id: unknown; name?: string | null; phone?: string | null; line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; postcode?: string | null; region?: string | null; isDefault?: boolean | null };

export default async function CheckoutPage() {
  const session = await getSession();
  const [settings, sales] = await Promise.all([getSettings(), getActiveSales().catch(() => [])]);
  let user: CheckoutUser | null = null;
  if (session) {
    await db();
    const u = await User.findById(session.uid, { name: 1, email: 1, phone: 1, addresses: 1, loyaltyPoints: 1 }).lean<{
      name: string;
      email: string;
      phone?: string;
      addresses?: LeanAddress[];
      loyaltyPoints?: number;
    }>();
    if (u) {
      user = {
        name: u.name,
        email: u.email,
        phone: u.phone ?? "",
        loyaltyPoints: Math.max(0, Math.floor(u.loyaltyPoints ?? 0)),
        addresses: (u.addresses ?? []).map((a) => ({
          id: String(a._id),
          name: a.name ?? "",
          phone: a.phone ?? "",
          line1: a.line1 ?? "",
          line2: a.line2 ?? "",
          city: a.city ?? "",
          state: a.state ?? "",
          postcode: a.postcode ?? "",
          region: (a.region === "uk" ? "uk" : "in") as Region,
          isDefault: !!a.isDefault,
        })),
      };
    }
  }
  const eta = Object.fromEntries(
    REGIONS.map((r) => {
      const [a, b] = deliveryWindow(r);
      return [r, `${shortDate(a, r)} – ${shortDate(b, r)}`];
    })
  ) as Record<Region, string>;
  const cs = toCheckoutSettings(settings);

  return (
    <>
      <TrackOnMount event="begin_checkout" data={{}} />
      <CheckoutClient user={user} eta={eta} sales={sales} settings={cs} otpRequired={cs.codOtpRequired && otpDeliverable()} />
    </>
  );
}
