import type { Metadata } from "next";
import Link from "next/link";
import mongoose from "mongoose";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Order } from "@/lib/models";
import { getInvoice } from "@/lib/invoice";
import { InvoiceView } from "@/components/invoice/InvoiceView";
import { PrintButton } from "@/components/invoice/PrintButton";
import { canSeeRegion } from "@/lib/admin-scope";

export const metadata: Metadata = { title: "Invoice" };

export default async function AdminInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("orders.view");
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) notFound();
  await db();
  const o = await Order.findById(id, { number: 1, status: 1, region: 1 }).lean<{ number: string; status: string; region?: string }>();
  if (!o || !(await canSeeRegion(o.region))) notFound();
  const inv = await getInvoice(o.number);

  return (
    <div className="flex flex-col gap-5 p-4 md:p-8 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link className="link" href={`/admin/orders/${id}`}>← Back to order {o.number}</Link>
        {inv && <PrintButton />}
      </div>
      {inv ? (
        <InvoiceView inv={inv} />
      ) : (
        <p className="notice">
          No invoice yet: order {o.number} is {o.status}. An invoice number is given once the order is confirmed or paid (cancelled orders don&apos;t get one).
        </p>
      )}
    </div>
  );
}
