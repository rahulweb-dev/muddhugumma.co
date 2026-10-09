import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/audit";
import { Product, Supplier, type ProductDoc } from "@/lib/models";
import { toCsv } from "@/lib/csv";
import { IMPORT_COLUMNS, dayKey, productCsvRow } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

/** Every product as a CSV in the bulk-upload format, so it can be edited and uploaded again. */
export async function GET() {
  const admin = await requireAdmin("products.manage");
  await db();
  const [products, suppliers] = await Promise.all([
    Product.find().sort({ category: 1, name: 1 }).lean<ProductDoc[]>(),
    Supplier.find({}, { name: 1 }).lean<{ _id: unknown; name?: string }[]>(),
  ]);
  const names = new Map(suppliers.map((s) => [String(s._id), s.name ?? ""]));
  const csv = toCsv([[...IMPORT_COLUMNS], ...products.map((p) => productCsvRow(p, names.get(p.supplierId ?? "") ?? ""))]);
  await logActivity(admin, "product.export", { target: `${products.length} products` });
  return new Response("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="muddhugumma-products-${dayKey(new Date())}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
