import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Icon } from "@/components/Icon";
import { getOrders } from "../../_components/data";
import { OrderCard } from "../../_components/OrderBits";

export const metadata: Metadata = { title: "Orders", robots: { index: false, follow: false } };

export default async function OrdersPage() {
  const session = await requireUser("/account/orders");
  const orders = await getOrders(session.uid);

  return (
    <div className="flex min-w-0 flex-col gap-7">
      <header className="flex min-w-0 flex-col gap-2">
        <span className="kick">My account</span>
        <h1 className="h2">
          Your <i>orders</i>
        </h1>
        {orders.length > 0 && (
          <p className="muted">
            {orders.length} {orders.length === 1 ? "order" : "orders"}, newest first.
          </p>
        )}
      </header>

      {orders.length ? (
        <div className="ac-orders">{orders.map((o) => <OrderCard key={o.number} order={o} />)}</div>
      ) : (
        <div className="empty">
          <Icon name="box" size={32} />
          <h2 className="h3">No orders yet</h2>
          <p>Your orders will appear here once you check out. Start with our newest drapes from Kanchipuram, Varanasi and Lucknow.</p>
          <Link className="btn" href="/c/new">Shop new arrivals</Link>
        </div>
      )}
    </div>
  );
}
