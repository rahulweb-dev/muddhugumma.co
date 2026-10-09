import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { AccountNav } from "../_components/AccountNav";
import "@/styles/account.css";

export const metadata: Metadata = {
  title: { default: "My account", template: "%s · My account · House of Muddhugumma" },
  robots: { index: false, follow: false },
};

export default async function AccountAreaLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser("/account");
  return (
    <div className="pad mx-auto grid max-w-[1240px] grid-cols-1 gap-5 pt-3 pb-14 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start lg:gap-14 lg:pt-10 lg:pb-20">
      <AccountNav name={session.name} email={session.email} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
