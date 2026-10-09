"use server";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { staffCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/audit";
import { Product, Supplier } from "@/lib/models";

export type SupplierResult = { ok: true; message: string; id?: string } | { ok: false; error: string; fields?: Record<string, string> };

const NO = { ok: false as const, error: "Your role doesn't allow you to manage suppliers." };

const SupplierSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Enter the supplier or weaver's name").max(100),
  cluster: z.string().trim().max(80),
  craft: z.string().trim().max(120),
  contact: z.string().trim().max(80),
  phone: z.string().trim().max(30).refine((v) => v === "" || /^[+\d][\d\s()-]{6,}$/.test(v), "Use digits, spaces and an optional +"),
  email: z.string().trim().toLowerCase().max(160).refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email or leave it empty"),
  notes: z.string().trim().max(1000),
});
export type SupplierInput = z.input<typeof SupplierSchema>;

export async function saveSupplier(input: SupplierInput): Promise<SupplierResult> {
  const me = await staffCan("products.manage");
  if (!me) return NO;
  const parsed = SupplierSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[String(i.path[0])] ??= i.message;
    return { ok: false, error: Object.values(fields)[0] ?? "Check the form.", fields };
  }
  const { id, ...doc } = parsed.data;
  if (id && !mongoose.isValidObjectId(id)) return { ok: false, error: "Unknown supplier." };
  await db();
  const clash = await Supplier.exists({ name: new RegExp(`^${doc.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"), ...(id ? { _id: { $ne: id } } : {}) });
  if (clash) return { ok: false, error: "A supplier with this name already exists. Bulk upload matches suppliers by name, so names must be unique.", fields: { name: "Already exists" } };
  let savedId = id;
  if (id) {
    const res = await Supplier.updateOne({ _id: id }, { $set: doc });
    if (!res.matchedCount) return { ok: false, error: "This supplier no longer exists." };
  } else {
    savedId = String((await Supplier.create(doc))._id);
  }
  await logActivity(me, id ? "supplier.update" : "supplier.create", { target: doc.name, targetId: savedId, meta: { cluster: doc.cluster || undefined } });
  revalidatePath("/admin/suppliers");
  return { ok: true, id: savedId, message: `${doc.name} saved.` };
}

export async function deleteSupplier(id: string): Promise<SupplierResult> {
  const me = await staffCan("products.manage");
  if (!me) return NO;
  if (!mongoose.isValidObjectId(id)) return { ok: false, error: "Unknown supplier." };
  await db();
  const s = await Supplier.findById(id, { name: 1 }).lean<{ name: string }>();
  if (!s) return { ok: false, error: "This supplier was already deleted." };
  const linked = await Product.countDocuments({ supplierId: id });
  if (linked) return { ok: false, error: `${linked} product${linked === 1 ? " is" : "s are"} linked to ${s.name}. Move ${linked === 1 ? "it" : "them"} to another supplier first.` };
  await Supplier.deleteOne({ _id: id });
  await logActivity(me, "supplier.delete", { target: s.name, targetId: id });
  revalidatePath("/admin/suppliers");
  return { ok: true, message: `${s.name} deleted.` };
}
