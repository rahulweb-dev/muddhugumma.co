"use server";
import { revalidatePath } from "next/cache";
import { staffCan } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { Product } from "@/lib/models";
import { analyseImport, type ImportRow } from "@/lib/admin-data";

export type { ImportRow } from "@/lib/admin-data";
export type ImportPreview =
  | { ok: true; rows: ImportRow[]; counts: Record<ImportRow["action"], number>; unknownColumns: string[]; missingColumns: string[] }
  | { ok: false; error: string };
export type ImportApplyResult = { ok: true; message: string; created: number; updated: number; skipped: number } | { ok: false; error: string };

/*
 * Product bulk upload. The browser sends the CSV text twice: once to preview, once to apply.
 * Both calls validate every row on the server from scratch, so the preview can't be tampered with.
 * Rules: rows match existing products by slug. On an update, a blank cell keeps the current value and
 * a single "-" clears an optional text or list column. Columns left out of the file are never touched.
 */

const countActions = (rows: ImportRow[]) => {
  const c = { create: 0, update: 0, unchanged: 0, error: 0 };
  for (const r of rows) c[r.action]++;
  return c;
};

export async function previewImport(csv: string): Promise<ImportPreview> {
  const admin = await staffCan("products.manage");
  if (!admin) return { ok: false, error: "Your role doesn't allow bulk uploads. Ask the store owner if you need this." };
  const res = await analyseImport(csv);
  if (!res.ok) return res;
  const rows = res.items.map((i) => i.row);
  return { ok: true, rows, counts: countActions(rows), unknownColumns: res.unknownColumns, missingColumns: res.missingColumns };
}

export async function applyImport(csv: string): Promise<ImportApplyResult> {
  const admin = await staffCan("products.manage");
  if (!admin) return { ok: false, error: "Your role doesn't allow bulk uploads. Ask the store owner if you need this." };
  const res = await analyseImport(csv);
  if (!res.ok) return res;
  let created = 0;
  let updated = 0;
  const failed: string[] = [];
  for (const item of res.items) {
    if (!item.doc || item.row.action === "unchanged") continue;
    try {
      if (item.id) {
        await Product.updateOne({ _id: item.id }, { $set: item.doc });
        updated++;
      } else {
        await Product.create(item.doc);
        created++;
      }
    } catch (e) {
      failed.push(`line ${item.row.line} (${item.row.slug}): ${e instanceof Error ? e.message.slice(0, 120) : "could not save"}`);
    }
  }
  const errors = res.items.filter((i) => i.row.action === "error").length + failed.length;
  const unchanged = res.items.filter((i) => i.row.action === "unchanged").length;
  await logActivity(admin, "product.import", { target: `${created} created, ${updated} updated`, meta: { created, updated, unchanged, skipped: errors, rows: res.items.length } });
  revalidatePath("/", "layout");
  const parts = [`${created} created`, `${updated} updated`];
  if (unchanged) parts.push(`${unchanged} unchanged`);
  if (errors) parts.push(`${errors} skipped with errors`);
  return {
    ok: true,
    created,
    updated,
    skipped: errors,
    message: `Import finished: ${parts.join(", ")}.${failed.length ? ` Failed: ${failed.slice(0, 5).join("; ")}` : ""}`,
  };
}
