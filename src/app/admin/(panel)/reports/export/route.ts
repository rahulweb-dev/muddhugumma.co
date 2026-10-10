import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/audit";
import { Order } from "@/lib/models";
import { toCsv } from "@/lib/csv";
import type { LeanOrder } from "@/lib/admin-data";
import { resolveRange } from "../data";
import { getStoreLock } from "@/lib/admin-scope";

export const dynamic = "force-dynamic";

const ADMIN_TZ = process.env.ADMIN_TIMEZONE || "Asia/Kolkata";

/** Orders placed between ?from= and ?to= (yyyy-mm-dd, inclusive) as CSV. Defaults to the last 30 days. */
export async function GET(req: Request) {
  const admin = await requireAdmin("reports.view");
  const url = new URL(req.url);
  const range = resolveRange({ from: url.searchParams.get("from") ?? "", to: url.searchParams.get("to") ?? "", range: url.searchParams.get("range") ?? "" });
  await db();
  // Staff locked to one country only ever export that country.
  const lock = await getStoreLock();
  const orders = await Order.find({ ...(lock ? { region: lock } : {}), createdAt: { $gte: range.start, $lt: range.end } }).sort({ createdAt: 1 }).limit(50_000).lean<LeanOrder[]>();
  const header = [
    "order_number", "placed_at", "region", "currency", "status", "payment_method", "payment_status", "customer_name", "email", "phone", "city", "state", "postcode",
    "pieces", "subtotal", "discount", "coupon", "prepaid_discount", "points_discount", "gift_wrap_fee", "shipping", "cod_fee", "gift_card", "total", "cod_due", "invoice_number",
  ];
  const rows = orders.map((o) => [
    o.number,
    o.createdAt ? new Date(o.createdAt).toLocaleString("sv-SE", { timeZone: ADMIN_TZ }) : "",
    o.region, o.currency, o.status, o.payment?.method ?? "", o.payment?.status ?? "",
    o.address?.name ?? "", o.email, o.address?.phone ?? "", o.address?.city ?? "", o.address?.state ?? "", o.address?.postcode ?? "",
    o.items.reduce((n, i) => n + (i.qty ?? 1), 0),
    o.subtotal ?? 0, o.discount ?? 0, o.coupon ?? "", o.prepaidDiscount ?? 0, o.loyalty?.discount ?? 0, o.gift?.fee ?? 0, o.shipping ?? 0, o.codFee ?? 0,
    o.giftCard?.amount ?? 0, o.total ?? 0, o.partialCod?.dueOnDelivery ?? 0, o.invoiceNumber ?? "",
  ]);
  await logActivity(admin, "report.export", { target: `${orders.length} orders`, meta: { from: range.from, to: range.to } });
  return new Response("\uFEFF" + toCsv([header, ...rows], { safe: true }), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="muddhugumma-orders-${range.from}-to-${range.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
