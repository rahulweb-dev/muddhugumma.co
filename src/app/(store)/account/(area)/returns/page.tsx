import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getReturnsForUser } from "@/lib/returns";
import { Icon } from "@/components/Icon";
import { ReturnCard } from "../../_components/ReturnBits";

export const metadata: Metadata = { title: "Returns", robots: { index: false, follow: false } };

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const session = await requireUser("/account/returns");
  const [{ created }, returns] = await Promise.all([searchParams, getReturnsForUser(session.uid)]);
  const justCreated = typeof created === "string" ? returns.find((r) => r.number === created) : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-7">
      <header className="flex min-w-0 flex-col gap-2">
        <span className="kick">My account</span>
        <h1 className="h2">
          Returns <i>&amp; exchanges</i>
        </h1>
        <p className="muted">
          To start a new one, open a delivered order from <Link className="link" href="/account/orders">My orders</Link> and choose “Return or exchange”.
        </p>
      </header>

      {justCreated && (
        <p className="notice ok m-0" role="status">
          Request {justCreated.number} sent. We&apos;ve emailed you a copy and will reply within one working day.
        </p>
      )}

      {returns.length ? (
        <div className="flex flex-col gap-3">
          {returns.map((rt) => <ReturnCard key={rt.number} rt={rt} />)}
        </div>
      ) : (
        <div className="empty">
          <Icon name="back" size={32} />
          <h2 className="h3">No returns</h2>
          <p>Nothing here, and we hope it stays that way. If a piece doesn&apos;t fit or isn&apos;t what you expected, you can return or exchange it from the order page.</p>
          <Link className="btn ghost" href="/help/returns">Read the returns policy</Link>
        </div>
      )}
    </div>
  );
}
