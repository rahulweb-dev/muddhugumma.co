import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Order, type OrderDoc } from "@/lib/models";
import { REGION_CONFIG } from "@/lib/region";
import { getReturnableLines, returnWindow, RETURN_REASONS } from "@/lib/returns";
import { longDate } from "../../../../_components/data";
import { ReturnForm } from "../../../../_components/ReturnForm";

type Props = { params: Promise<{ number: string }> };

export const metadata: Metadata = { title: "Return or exchange", robots: { index: false, follow: false } };

export default async function ReturnRequestPage({ params }: Props) {
  const { number: raw } = await params;
  let number = raw;
  try {
    number = decodeURIComponent(raw);
  } catch {}
  const session = await requireUser(`/account/orders/${encodeURIComponent(number)}/return`);
  await db();
  const order = await Order.findOne({ number, userId: session.uid }).lean<OrderDoc>();
  if (!order) notFound();

  const r = order.region;
  const win = returnWindow(order);
  const lines = win.open ? await getReturnableLines(order) : [];
  const anyOpen = lines.some((l) => !l.blocked && l.available > 0);

  return (
    <div className="flex min-w-0 flex-col gap-7">
      <nav className="crumbs ac-crumbs" aria-label="Breadcrumb">
        <Link href="/account">Account</Link>
        <span><Link href="/account/orders">Orders</Link></span>
        <span><Link href={`/account/orders/${encodeURIComponent(order.number)}`}>{order.number}</Link></span>
        <span aria-current="page">Return</span>
      </nav>

      <header className="flex min-w-0 flex-col gap-2">
        <span className="kick">Order {order.number}</span>
        <h1 className="h2">
          Return or <i>exchange</i>
        </h1>
        {win.deadline && win.open && (
          <p className="muted">
            You can request a return or a different size until {longDate(win.deadline, r)} ({REGION_CONFIG[r].returnsDays} days from delivery).
          </p>
        )}
      </header>

      {!win.open ? (
        <div className="ac-panel ac-quiet">
          <p>{win.reason}</p>
          <Link className="btn" href={`/account/orders/${encodeURIComponent(order.number)}`}>Back to order</Link>
        </div>
      ) : !anyOpen ? (
        <div className="ac-panel ac-quiet">
          <p>Nothing on this order can be returned right now. Each item is either already in a return request or not returnable under our policy.</p>
          <div className="flex flex-wrap gap-2.5">
            <Link className="btn" href="/account/returns">See your returns</Link>
            <Link className="btn ghost" href="/help/returns">Returns policy</Link>
          </div>
        </div>
      ) : (
        <>
          <ReturnForm
            orderNumber={order.number}
            region={r}
            isCod={order.payment?.method === "cod"}
            reasons={RETURN_REASONS}
            lines={lines.map((l) => ({ ...l }))}
          />
          <p className="ac-fine">
            Stitched blouses, sarees with fall and pico added, and made-to-order pieces can&apos;t be returned. Read the full{" "}
            <Link className="link" href="/help/returns">returns policy</Link>.
          </p>
        </>
      )}
    </div>
  );
}
