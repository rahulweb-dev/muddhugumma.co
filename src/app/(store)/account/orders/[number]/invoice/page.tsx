import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Order } from "@/lib/models";
import { getInvoice } from "@/lib/invoice";
import { InvoiceView } from "@/components/invoice/InvoiceView";
import { PrintButton } from "@/components/invoice/PrintButton";
import { Icon } from "@/components/Icon";
import "@/styles/checkout.css";

export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };

export default async function CustomerInvoicePage({ params }: { params: Promise<{ number: string }> }) {
  const { number: raw } = await params;
  const number = decodeURIComponent(raw).toUpperCase();
  const session = await requireUser(`/account/orders/${number}/invoice`);
  if (!/^MG\d{6}[A-Z0-9]{4}$/.test(number)) notFound();
  await db();
  const owner = await Order.findOne({ number }, { userId: 1 }).lean<{ userId?: string }>();
  if (!owner || owner.userId !== session.uid) notFound();

  const inv = await getInvoice(number);

  return (
    <div className="pad mx-auto flex max-w-[960px] flex-col gap-5 py-6 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <nav className="crumbs !p-0" aria-label="Breadcrumb">
          <Link href="/account">Account</Link>
          <span><Link href="/account/orders">Orders</Link></span>
          <span><Link href={`/account/orders/${number}`}>{number}</Link></span>
          <span>Invoice</span>
        </nav>
        {inv && <PrintButton />}
      </div>
      {inv ? (
        <InvoiceView inv={inv} />
      ) : (
        <div className="empty">
          <Icon name="box" size={36} />
          <h1 className="h2">Invoice <i>not ready yet</i></h1>
          <p>Your invoice is created once the order is confirmed or paid. Check back soon, or contact us if you need it urgently.</p>
          <Link className="btn ghost" href={`/account/orders/${number}`}>Back to order</Link>
        </div>
      )}
    </div>
  );
}
