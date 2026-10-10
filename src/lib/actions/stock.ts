"use server";
import { revalidatePath } from "next/cache";
import mongoose from "mongoose";
import { staffCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { Product, StockLog, type StockReason } from "@/lib/models";
import { logActivity } from "@/lib/audit";
import { isRegion, type Region } from "@/lib/region";
import { stockFor, stockPath } from "@/lib/stock";

export type StockChange = { id: string; region: Region; size: string; from: number; to: number };
export type StockResult = { ok: true; message: string; conflicts?: string[] } | { ok: false; error: string };

const REASONS: StockReason[] = ["restock", "sold_offline", "damaged", "correction", "transfer"];
const SIZE_RE = /^(XS|S|M|L|XL|XXL|Free size)$/;
const qty = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 100_000;

function refresh() {
  revalidatePath("/admin/stock");
  revalidatePath("/admin");
  revalidatePath("/p/[slug]", "page");
  revalidatePath("/c/[slug]", "page");
}

/**
 * Saves edited counts from Admin → Stock. Each change only applies if the count is still what the screen showed
 * (so a sale made meanwhile isn't overwritten); those are reported back as conflicts to re-check.
 */
export async function saveStockChanges(changes: StockChange[], reason: string, note = ""): Promise<StockResult> {
  const staff = await staffCan("products.manage");
  if (!staff) return { ok: false, error: "You don't have permission to change stock." };
  if (!REASONS.includes(reason as StockReason) || reason === "transfer") return { ok: false, error: "Choose why the stock changed." };
  const list = (Array.isArray(changes) ? changes : []).slice(0, 500);
  if (!list.length) return { ok: false, error: "Nothing to save." };
  for (const c of list) {
    if (!mongoose.isValidObjectId(c.id) || !isRegion(c.region) || !SIZE_RE.test(c.size) || !qty(c.from) || !qty(c.to)) return { ok: false, error: "Some counts aren't valid whole numbers." };
  }
  await db();
  const conflicts: string[] = [];
  let saved = 0;
  for (const c of list) {
    if (c.from === c.to) continue;
    const path = stockPath(c.region, c.size);
    // A size that was never stocked has no value yet; treat that as 0.
    const filter = c.from === 0 ? { _id: c.id, $or: [{ [path]: 0 }, { [path]: { $exists: false } }] } : { _id: c.id, [path]: c.from };
    const p = await Product.findOneAndUpdate(filter, { $set: { [path]: c.to } }, { projection: { slug: 1, name: 1 } }).lean<{ slug: string; name: string }>();
    if (!p) {
      const now = await Product.findById(c.id, { name: 1, stock: 1, stockUk: 1 }).lean<{ name: string; stock?: unknown; stockUk?: unknown }>();
      conflicts.push(`${now?.name ?? "A product"} ${c.size} (${c.region === "uk" ? "UK" : "India"}) is now ${now ? stockFor(now, c.region)[c.size] ?? 0 : "?"}`);
      continue;
    }
    saved++;
    await StockLog.create({ productId: c.id, slug: p.slug, name: p.name, region: c.region, size: c.size, from: c.from, to: c.to, reason, note: note.slice(0, 200), byId: staff.uid, byName: staff.name });
  }
  if (saved) {
    await logActivity(staff, "stock.update", { target: `${saved} size${saved === 1 ? "" : "s"}`, meta: { reason } });
    refresh();
  }
  const message = saved ? `Saved ${saved} change${saved === 1 ? "" : "s"}.` : "Nothing was saved.";
  return conflicts.length ? { ok: true, message: `${message} ${conflicts.length} changed since you opened the page, so they were skipped. Check them and try again.`, conflicts } : { ok: true, message };
}

/** Moves pieces between the India and UK stock of one product size, in one step (never below zero). */
export async function transferStock(id: string, size: string, amount: number, from: Region, note = ""): Promise<StockResult> {
  const staff = await staffCan("products.manage");
  if (!staff) return { ok: false, error: "You don't have permission to change stock." };
  if (!mongoose.isValidObjectId(id) || !SIZE_RE.test(size) || !isRegion(from) || !Number.isInteger(amount) || amount < 1 || amount > 10_000) {
    return { ok: false, error: "Enter how many whole pieces to move." };
  }
  const to: Region = from === "in" ? "uk" : "in";
  const src = stockPath(from, size);
  const dst = stockPath(to, size);
  await db();
  const before = await Product.findOneAndUpdate({ _id: id, [src]: { $gte: amount } }, { $inc: { [src]: -amount, [dst]: amount } }, { projection: { slug: 1, name: 1, stock: 1, stockUk: 1 } }).lean<{
    slug: string;
    name: string;
    stock?: unknown;
    stockUk?: unknown;
  }>();
  if (!before) return { ok: false, error: `There aren't ${amount} in ${from === "in" ? "India" : "UK"} stock for that size.` };
  const a = stockFor(before, from)[size] ?? 0;
  const b = stockFor(before, to)[size] ?? 0;
  const base = { productId: id, slug: before.slug, name: before.name, size, reason: "transfer" as const, note: note.slice(0, 200), byId: staff.uid, byName: staff.name };
  await StockLog.insertMany([
    { ...base, region: from, from: a, to: a - amount },
    { ...base, region: to, from: b, to: b + amount },
  ]);
  await logActivity(staff, "stock.transfer", { target: before.name, targetId: id, meta: { size, amount, from, to } });
  refresh();
  return { ok: true, message: `Moved ${amount} × ${size} of ${before.name} from ${from === "in" ? "India to the UK" : "the UK to India"}.` };
}
