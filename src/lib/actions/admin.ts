"use server";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { staffCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/audit";
import { onOrderStatusChanged } from "@/lib/order-events";
import { Coupon, Lookbook, Order, Product, Supplier } from "@/lib/models";
import { canonicalSize, type Region } from "@/lib/region";
import { stockPath } from "@/lib/stock";
import { ProductInputSchema, productDoc, productRuleError } from "@/lib/admin-data";
import { allCategories } from "@/lib/categories";

/* ---------- shared ---------- */
export type ActionResult = { ok: true; message?: string; id?: string; slug?: string } | { ok: false; error: string; fields?: Record<string, string> };

const ORDER_STATUSES = ["placed", "confirmed", "packed", "shipped", "delivered", "cancelled", "returned"] as const;
const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"] as const;
const RESTOCKED = new Set<string>(["cancelled", "returned"]);
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const denied = (what: string): ActionResult => ({ ok: false, error: `Your role doesn't allow you to ${what}. Ask the store owner if you need this.` });

function fail(e: z.ZodError): ActionResult {
  const fields: Record<string, string> = {};
  for (const issue of e.issues) {
    const key = issue.path.join(".") || "form";
    if (!fields[key]) fields[key] = issue.message;
  }
  const first = e.issues[0];
  return { ok: false, error: first ? `${first.path.join(".") || "Form"}: ${first.message}` : "Check the form and try again.", fields };
}

const validId = (id: string) => typeof id === "string" && mongoose.isValidObjectId(id);

function revalidateStore(slugs: string[] = []) {
  revalidatePath("/");
  revalidatePath("/c/[slug]", "layout");
  revalidatePath("/search");
  for (const s of slugs) if (s) revalidatePath(`/p/${s}`);
  revalidatePath("/admin", "layout");
}

/* ---------- products ---------- */
export type ProductInput = z.input<typeof ProductInputSchema>;

export async function saveProduct(input: ProductInput): Promise<ActionResult> {
  const admin = await staffCan("products.manage");
  if (!admin) return denied("edit products");
  const parsed = ProductInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);
  const v = parsed.data;
  const rule = productRuleError(v);
  if (rule) return { ok: false, error: rule.error, fields: { [rule.field]: "Must be above the selling price" } };
  if (v.id && !validId(v.id)) return { ok: false, error: "Unknown product." };

  await db();
  if (!(await allCategories()).some((c) => c.slug === v.category)) return { ok: false, error: "Choose a category from the list.", fields: { category: "Unknown category" } };
  const clash = await Product.exists({ slug: v.slug, ...(v.id ? { _id: { $ne: v.id } } : {}) });
  if (clash) return { ok: false, error: "Another product already uses this slug.", fields: { slug: "Already in use" } };
  if (v.supplierId) {
    if (!validId(v.supplierId) || !(await Supplier.exists({ _id: v.supplierId }))) return { ok: false, error: "That supplier no longer exists.", fields: { supplierId: "Choose another supplier" } };
  }
  if (v.lookbooks.length) {
    const found = await Lookbook.find({ slug: { $in: v.lookbooks } }, { slug: 1 }).lean<{ slug: string }[]>();
    const known = new Set(found.map((l) => l.slug));
    v.lookbooks = v.lookbooks.filter((s) => known.has(s));
  }

  const doc = productDoc(v);
  let id = v.id;
  let oldSlug = "";
  let oldLookbooks: string[] = [];
  if (id) {
    const before = await Product.findById(id, { slug: 1, lookbooks: 1 }).lean<{ slug: string; lookbooks?: string[] }>();
    if (!before) return { ok: false, error: "This product no longer exists." };
    oldSlug = before.slug;
    oldLookbooks = before.lookbooks ?? [];
    await Product.updateOne({ _id: id }, { $set: doc });
  } else {
    const created = await Product.create(doc);
    id = String(created._id);
  }

  // Keep each lookbook's product list in step with the product's own list.
  const added = doc.lookbooks.filter((s) => !oldLookbooks.includes(s));
  const removed = oldLookbooks.filter((s) => !doc.lookbooks.includes(s));
  if (oldSlug && oldSlug !== v.slug) {
    await Lookbook.updateMany({ productSlugs: oldSlug }, { $set: { "productSlugs.$": v.slug } });
  }
  if (added.length) await Lookbook.updateMany({ slug: { $in: added } }, { $addToSet: { productSlugs: v.slug } });
  if (removed.length) await Lookbook.updateMany({ slug: { $in: removed } }, { $pull: { productSlugs: v.slug } });

  await logActivity(admin, v.id ? "product.update" : "product.create", {
    target: v.name,
    targetId: id,
    meta: { slug: v.slug, renamedFrom: oldSlug && oldSlug !== v.slug ? oldSlug : undefined, active: v.active },
  });
  revalidateStore([v.slug, oldSlug !== v.slug ? oldSlug : ""]);
  if (added.length || removed.length) revalidatePath("/", "layout"); // lookbook pages list their products
  return { ok: true, id, slug: v.slug, message: "Product saved." };
}

export async function toggleProductActive(id: string, active: boolean): Promise<ActionResult> {
  const admin = await staffCan("products.manage");
  if (!admin) return denied("edit products");
  if (!validId(id)) return { ok: false, error: "Unknown product." };
  await db();
  const p = await Product.findByIdAndUpdate(id, { $set: { active: !!active } }, { new: true, projection: { slug: 1, name: 1 } }).lean<{ slug: string; name: string }>();
  if (!p) return { ok: false, error: "This product no longer exists." };
  await logActivity(admin, active ? "product.show" : "product.hide", { target: p.name, targetId: id, meta: { slug: p.slug } });
  revalidateStore([p.slug]);
  return { ok: true, message: active ? "Product is live." : "Product hidden from the store." };
}

/* ---------- orders ---------- */
type LeanOrderItems = { number: string; status: string; region?: Region; items: { productId?: string; slug?: string; size?: string; qty?: number }[] };

/** Puts an order's pieces back into (or takes them out of) the stock of the country it was sold in. */
async function adjustStock(items: LeanOrderItems["items"], region: Region, sign: 1 | -1) {
  await Promise.all(
    items.map((it) => {
      const n = Math.max(0, Number(it.qty) || 0) * sign;
      if (!n || !it.size) return null;
      const key = stockPath(region, canonicalSize(it.size));
      const filter = it.productId && validId(it.productId) ? { _id: it.productId } : { slug: it.slug };
      return Product.updateOne(filter, { $inc: { [key]: n } });
    })
  );
}

export async function updateOrderStatus(orderId: string, status: string, note = ""): Promise<ActionResult> {
  const admin = await staffCan("orders.manage");
  if (!admin) return denied("change order status");
  if (!validId(orderId)) return { ok: false, error: "Unknown order." };
  if (!(ORDER_STATUSES as readonly string[]).includes(status)) return { ok: false, error: "Choose a valid status." };
  await db();
  const order = await Order.findById(orderId, { number: 1, status: 1, region: 1, items: 1 }).lean<LeanOrderItems>();
  if (!order) return { ok: false, error: "Order not found." };
  const cleanNote = String(note || "").trim().slice(0, 500);
  if (order.status === status && !cleanNote) return { ok: false, error: `Order is already ${status}. Add a note to log an update.` };

  const wasOut = RESTOCKED.has(order.status);
  const nowOut = RESTOCKED.has(status);
  // Cancelled or returned orders put their pieces back on the shelf; reopening one takes them out again.
  const region: Region = order.region === "uk" ? "uk" : "in";
  if (!wasOut && nowOut) await adjustStock(order.items, region, 1);
  if (wasOut && !nowOut) await adjustStock(order.items, region, -1);

  await Order.updateOne(
    { _id: orderId },
    { $set: { status }, $push: { history: { status, at: new Date(), note: cleanNote || `Updated by ${admin.name}` } } }
  );
  await logActivity(admin, order.status === status ? "order.note" : "order.status", {
    target: order.number,
    targetId: orderId,
    meta: { from: order.status, to: status, note: cleanNote || undefined, restocked: !wasOut && nowOut ? true : undefined },
  });
  if (order.status !== status) await onOrderStatusChanged(order.number, status);

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin", "layout");
  revalidatePath("/account", "layout");
  revalidatePath("/order/[number]", "page");
  if (wasOut !== nowOut) revalidateStore(order.items.map((i) => i.slug ?? ""));
  return { ok: true, message: `Order marked ${status}.${!wasOut && nowOut ? " Stock returned to inventory." : ""}` };
}

export async function updatePaymentStatus(orderId: string, status: string): Promise<ActionResult> {
  const admin = await staffCan("orders.manage");
  if (!admin) return denied("change payments");
  if (!validId(orderId)) return { ok: false, error: "Unknown order." };
  if (!(PAYMENT_STATUSES as readonly string[]).includes(status)) return { ok: false, error: "Choose a valid payment status." };
  await db();
  const before = await Order.findById(orderId, { number: 1, payment: 1 }).lean<{ number: string; payment?: { status?: string } }>();
  if (!before) return { ok: false, error: "Order not found." };
  await Order.updateOne(
    { _id: orderId },
    {
      $set: { "payment.status": status },
      $push: { history: { status: `payment ${status}`, at: new Date(), note: `Payment marked ${status} by ${admin.name}` } },
    }
  );
  await logActivity(admin, "order.payment", { target: before.number, targetId: orderId, meta: { from: before.payment?.status, to: status } });
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin", "layout");
  return { ok: true, message: `Payment marked ${status}.` };
}

/* ---------- coupons ---------- */
const CouponInputSchema = z.object({
  id: z.string().optional(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(3, "Code is too short")
    .max(20)
    .regex(/^[A-Z0-9]+$/, "Letters and numbers only"),
  description: z.string().trim().max(160),
  type: z.enum(["percent", "flat"]),
  value: z.number().positive("Enter a value above 0"),
  regions: z.array(z.enum(["in", "uk"])).min(1, "Pick at least one region"),
  minOrder: z.object({ in: z.number().min(0), uk: z.number().min(0) }),
  firstOrderOnly: z.boolean(),
  expiresAt: z.string().trim(), // yyyy-mm-dd or ""
  active: z.boolean(),
});
export type CouponInput = z.input<typeof CouponInputSchema>;

export async function saveCoupon(input: CouponInput): Promise<ActionResult> {
  const admin = await staffCan("merch.manage");
  if (!admin) return denied("manage coupons");
  const parsed = CouponInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);
  const v = parsed.data;
  if (v.type === "percent" && v.value > 90) return { ok: false, error: "Percentage discounts are capped at 90%.", fields: { value: "Max 90" } };
  let expiresAt: Date | null = null;
  if (v.expiresAt) {
    const d = new Date(`${v.expiresAt}T23:59:59`);
    if (Number.isNaN(d.getTime())) return { ok: false, error: "Enter a valid expiry date.", fields: { expiresAt: "Invalid date" } };
    expiresAt = d;
  }
  if (v.id && !validId(v.id)) return { ok: false, error: "Unknown coupon." };
  await db();
  const clash = await Coupon.exists({ code: v.code, ...(v.id ? { _id: { $ne: v.id } } : {}) });
  if (clash) return { ok: false, error: `${v.code} already exists.`, fields: { code: "Already exists" } };
  const doc = {
    code: v.code,
    description: v.description,
    type: v.type,
    value: v.value,
    regions: [...new Set(v.regions)],
    minOrder: v.minOrder,
    firstOrderOnly: v.firstOrderOnly,
    active: v.active,
    expiresAt,
  };
  let id = v.id;
  if (id) await Coupon.updateOne({ _id: id }, { $set: doc });
  else id = String((await Coupon.create(doc))._id);
  await logActivity(admin, v.id ? "coupon.update" : "coupon.create", { target: v.code, targetId: id, meta: { type: v.type, value: v.value, active: v.active } });
  revalidatePath("/admin/coupons");
  return { ok: true, id, message: `${v.code} saved.` };
}

export async function toggleCoupon(id: string, active: boolean): Promise<ActionResult> {
  const admin = await staffCan("merch.manage");
  if (!admin) return denied("manage coupons");
  if (!validId(id)) return { ok: false, error: "Unknown coupon." };
  await db();
  const c = await Coupon.findByIdAndUpdate(id, { $set: { active: !!active } }, { projection: { code: 1 } }).lean<{ code: string }>();
  if (!c) return { ok: false, error: "Coupon not found." };
  await logActivity(admin, active ? "coupon.enable" : "coupon.pause", { target: c.code, targetId: id });
  revalidatePath("/admin/coupons");
  return { ok: true, message: active ? "Coupon enabled." : "Coupon paused." };
}
