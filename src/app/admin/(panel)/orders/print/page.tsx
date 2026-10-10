import type { Metadata } from "next";
import Link from "next/link";
import mongoose from "mongoose";
import { requireAdmin } from "@/lib/auth";
import { first } from "@/lib/admin-data";
import { PrintButton } from "@/components/admin/PrintButton";
import PackingSlip from "../[id]/slip/page";
import AdminInvoicePage from "../[id]/invoice/page";

export const metadata: Metadata = { title: "Print" };

type SP = Promise<Record<string, string | string[] | undefined>>;

/** Bulk print from the orders list: /admin/orders/print?ids=a,b,c&doc=slips|invoices, one order per sheet. */
export default async function BulkPrint({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const doc = first(sp.doc) === "invoices" ? "invoices" : "slips";
  await requireAdmin(doc === "invoices" ? "orders.view" : "orders.ship");
  const ids = first(sp.ids)
    .split(",")
    .filter((id) => mongoose.isValidObjectId(id))
    .slice(0, 50);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-8 print:p-0">
      <div className="adm-row justify-between print:hidden">
        <p className="kick"><Link href="/admin/orders">Orders</Link> / Print {ids.length} {doc === "invoices" ? "invoice" : "packing slip"}{ids.length === 1 ? "" : "s"}</p>
        {ids.length > 0 && <PrintButton label={`Print all ${ids.length}`} auto={first(sp.print) === "1"} />}
      </div>
      {ids.length === 0 && <p className="notice">No orders selected. Tick orders on the orders list first.</p>}
      {ids.map((id) => (
        <div key={id} className="print-sheet">
          {doc === "invoices" ? (
            <AdminInvoicePage params={Promise.resolve({ id })} />
          ) : (
            <PackingSlip params={Promise.resolve({ id })} searchParams={Promise.resolve({})} />
          )}
        </div>
      ))}
    </div>
  );
}
