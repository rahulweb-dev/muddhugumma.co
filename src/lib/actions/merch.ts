"use server";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { staffCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { Bundle, GiftCard, Lookbook, Product, Sale, type BundleDoc, type GiftCardDoc, type LookbookDoc, type SaleDoc } from "@/lib/models";
import { logActivity } from "@/lib/audit";
import { issueGiftCard } from "@/lib/giftcards";
import { formatMoney } from "@/lib/region";
import { saleOverlaps, type SaleLike } from "@/components/admin/content/data";
import { SLUG_RX, type PickedProduct, type Result } from "@/components/admin/content/shared";

/* Merchandising actions: product picker search, lookbooks, timed sales, bundles, gift cards. Permission: merch.manage. */

const DENIED: Result = { ok: false, error: "You don't have permission to do this." };
const validId = (id: unknown): id is string => typeof id === "string" && mongoose.isValidObjectId(id);
const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function fail(e: z.ZodError): Result {
  const fields: Record<string, string> = {};
  for (const i of e.issues) {
    const k = i.path.join(".") || "form";
    if (!fields[k]) fields[k] = i.message;
  }
  return { ok: false, error: e.issues[0]?.message ?? "Check the form and try again.", fields };
}

function refreshStore(adminPath: string) {
  revalidatePath(adminPath, "layout");
  revalidatePath("/", "layout");
}

const slugField = z.string().trim().toLowerCase().min(3, "The slug is too short.").max(100).regex(SLUG_RX, "Slug: use lowercase letters, numbers and hyphens.");
const imageField = z.string().trim().max(300).regex(/^[^\s]*$/, "Image paths cannot contain spaces.");
const slugList = z.array(z.string().trim().min(1).max(120)).max(60, "Pick at most 60 products.");

/* ---------- product picker ---------- */
export async function searchProducts(q: string): Promise<PickedProduct[]> {
  const session = (await staffCan("merch.manage")) ?? (await staffCan("content.manage"));
  if (!session) return [];
  const term = String(q ?? "").trim().slice(0, 60);
  await db();
  const filter = term ? { $or: [{ name: new RegExp(escapeRx(term), "i") }, { slug: new RegExp(escapeRx(term), "i") }] } : {};
  const rows = await Product.find(filter, { slug: 1, name: 1, images: 1, active: 1 })
    .sort({ active: -1, createdAt: -1 })
    .limit(12)
    .lean<{ slug: string; name: string; images?: string[]; active?: boolean }[]>();
  return rows.map((r) => ({ slug: r.slug, name: r.name, image: r.images?.[0] ?? "", active: r.active !== false }));
}

async function unknownSlugs(slugs: string[]): Promise<string[]> {
  if (!slugs.length) return [];
  const found = await Product.find({ slug: { $in: slugs } }, { slug: 1 }).lean<{ slug: string }[]>();
  const set = new Set(found.map((f) => f.slug));
  return slugs.filter((s) => !set.has(s));
}

/* ---------- lookbooks ---------- */
const LookbookSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(3, "Add a title (3+ characters).").max(120),
  slug: slugField,
  festival: z.string().trim().max(60),
  intro: z.string().trim().max(1500, "Keep the intro under 1,500 characters."),
  hero: imageField,
  productSlugs: slugList,
  active: z.boolean(),
  sort: z.number().int("Sort must be a whole number.").min(-999).max(9999),
});
export type LookbookInput = z.input<typeof LookbookSchema>;

export async function saveLookbook(input: LookbookInput): Promise<Result> {
  const session = await staffCan("merch.manage");
  if (!session) return DENIED;
  const parsed = LookbookSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);
  const v = parsed.data;
  if (v.id && !validId(v.id)) return { ok: false, error: "Unknown lookbook." };
  const productSlugs = [...new Set(v.productSlugs)];
  if (v.active && !productSlugs.length) return { ok: false, error: "Add at least one product before making the lookbook live.", fields: { productSlugs: "Required" } };
  await db();
  if (await Lookbook.exists({ slug: v.slug, ...(v.id ? { _id: { $ne: v.id } } : {}) })) return { ok: false, error: "Another lookbook already uses this slug.", fields: { slug: "Already in use" } };
  const missing = await unknownSlugs(productSlugs);
  if (missing.length) return { ok: false, error: `Remove products that are no longer in the catalogue: ${missing.join(", ")}.` };

  const before = v.id ? await Lookbook.findById(v.id, { slug: 1 }).lean<Pick<LookbookDoc, "slug">>() : null;
  if (v.id && !before) return { ok: false, error: "This lookbook no longer exists." };
  const doc = { title: v.title, slug: v.slug, festival: v.festival, intro: v.intro, hero: v.hero.replace(/^\/+/, ""), productSlugs, active: v.active, sort: v.sort };
  let id = v.id;
  if (id) await Lookbook.updateOne({ _id: id }, { $set: doc });
  else id = String((await Lookbook.create(doc))._id);

  // Keep product.lookbooks (slugs of the lookbooks a product appears in) in step.
  const oldSlug = before?.slug ?? v.slug;
  await Product.updateMany({ lookbooks: { $in: [oldSlug, v.slug] }, slug: { $nin: productSlugs } }, { $pull: { lookbooks: { $in: [oldSlug, v.slug] } } });
  if (oldSlug !== v.slug) await Product.updateMany({ lookbooks: oldSlug }, { $pull: { lookbooks: oldSlug } });
  if (productSlugs.length) await Product.updateMany({ slug: { $in: productSlugs } }, { $addToSet: { lookbooks: v.slug } });

  await logActivity(session, before ? "lookbook.update" : "lookbook.create", { target: v.title, targetId: id, meta: { slug: v.slug, products: productSlugs.length, active: v.active } });
  refreshStore("/admin/lookbooks");
  return { ok: true, id, message: "Lookbook saved." };
}

export async function deleteLookbook(id: string): Promise<Result> {
  const session = await staffCan("merch.manage");
  if (!session) return DENIED;
  if (!validId(id)) return { ok: false, error: "Unknown lookbook." };
  await db();
  const lb = await Lookbook.findByIdAndDelete(id, { projection: { title: 1, slug: 1 } }).lean<Pick<LookbookDoc, "title" | "slug">>();
  if (!lb) return { ok: false, error: "This lookbook no longer exists." };
  await Product.updateMany({ lookbooks: lb.slug }, { $pull: { lookbooks: lb.slug } });
  await logActivity(session, "lookbook.delete", { target: lb.title, targetId: id, meta: { slug: lb.slug } });
  refreshStore("/admin/lookbooks");
  return { ok: true, message: "Lookbook deleted." };
}

/* ---------- timed sales ---------- */
const COLS = ["bridal", "festive", "new"] as const;

const SaleSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(3, "Name the sale (3+ characters).").max(80),
  banner: z.string().trim().max(140, "Keep the banner under 140 characters."),
  percentOff: z.number().int("Use a whole percentage.").min(1, "Percent off must be between 1 and 80.").max(80, "Percent off must be between 1 and 80."),
  categories: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/)).max(50),
  collections: z.array(z.enum(COLS)),
  slugs: slugList,
  regions: z.array(z.enum(["in", "uk"])).min(1, "Choose at least one region."),
  startsAt: z.string().min(1, "Choose when the sale starts."),
  endsAt: z.string().min(1, "Choose when the sale ends."),
  active: z.boolean(),
});
export type SaleInput = z.input<typeof SaleSchema>;

type LeanSale = Pick<SaleDoc, "name" | "categories" | "collections" | "slugs" | "regions" | "startsAt" | "endsAt" | "active"> & { _id: mongoose.Types.ObjectId };
const toSaleLike = (s: LeanSale): SaleLike => ({
  id: String(s._id), name: s.name, categories: s.categories ?? [], collections: s.collections ?? [], slugs: s.slugs ?? [], regions: s.regions ?? [], startsAt: s.startsAt, endsAt: s.endsAt, active: !!s.active,
});

export async function saveSale(input: SaleInput): Promise<Result> {
  const session = await staffCan("merch.manage");
  if (!session) return DENIED;
  const parsed = SaleSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);
  const v = parsed.data;
  if (v.id && !validId(v.id)) return { ok: false, error: "Unknown sale." };
  const startsAt = new Date(v.startsAt);
  const endsAt = new Date(v.endsAt);
  if (Number.isNaN(startsAt.getTime())) return { ok: false, error: "Choose a valid start date and time.", fields: { startsAt: "Invalid" } };
  if (Number.isNaN(endsAt.getTime())) return { ok: false, error: "Choose a valid end date and time.", fields: { endsAt: "Invalid" } };
  if (endsAt <= startsAt) return { ok: false, error: "The sale must end after it starts.", fields: { endsAt: "Must be after the start" } };
  const slugs = [...new Set(v.slugs)];
  if (!v.categories.length && !v.collections.length && !slugs.length) return { ok: false, error: "Choose what the sale applies to: categories, collections or specific products.", fields: { targets: "Required" } };

  await db();
  const missing = await unknownSlugs(slugs);
  if (missing.length) return { ok: false, error: `Remove products that are no longer in the catalogue: ${missing.join(", ")}.` };
  const doc = { name: v.name, banner: v.banner, percentOff: v.percentOff, categories: [...new Set(v.categories)], collections: [...new Set(v.collections)], slugs, regions: [...new Set(v.regions)], startsAt, endsAt, active: v.active };
  let id = v.id;
  if (id) {
    const r = await Sale.updateOne({ _id: id }, { $set: doc });
    if (!r.matchedCount) return { ok: false, error: "This sale no longer exists." };
  } else id = String((await Sale.create(doc))._id);

  const all = await Sale.find({ endsAt: { $gt: new Date() }, active: true }).lean<LeanSale[]>();
  const warnings = (await saleOverlaps(all.map(toSaleLike))).get(id) ?? [];
  await logActivity(session, v.id ? "sale.update" : "sale.create", {
    target: v.name, targetId: id,
    meta: { percentOff: v.percentOff, regions: doc.regions.join(","), startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), active: v.active, overlaps: warnings.length || undefined },
  });
  refreshStore("/admin/sales");
  return { ok: true, id, message: warnings.length ? "Sale saved, but it overlaps another sale (see below)." : "Sale saved.", warnings };
}

export async function toggleSale(id: string, active: boolean): Promise<Result> {
  const session = await staffCan("merch.manage");
  if (!session) return DENIED;
  if (!validId(id)) return { ok: false, error: "Unknown sale." };
  await db();
  const s = await Sale.findByIdAndUpdate(id, { $set: { active: !!active } }, { new: true, projection: { name: 1 } }).lean<Pick<SaleDoc, "name">>();
  if (!s) return { ok: false, error: "This sale no longer exists." };
  await logActivity(session, "sale.toggle", { target: s.name, targetId: id, meta: { active: !!active } });
  refreshStore("/admin/sales");
  return { ok: true, message: active ? "Sale switched on." : "Sale switched off." };
}

export async function deleteSale(id: string): Promise<Result> {
  const session = await staffCan("merch.manage");
  if (!session) return DENIED;
  if (!validId(id)) return { ok: false, error: "Unknown sale." };
  await db();
  const s = await Sale.findByIdAndDelete(id, { projection: { name: 1 } }).lean<Pick<SaleDoc, "name">>();
  if (!s) return { ok: false, error: "This sale no longer exists." };
  await logActivity(session, "sale.delete", { target: s.name, targetId: id });
  refreshStore("/admin/sales");
  return { ok: true, message: "Sale deleted." };
}

/* ---------- bundles ---------- */
const BundleSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(3, "Name the bundle (3+ characters).").max(120),
  slug: slugField,
  description: z.string().trim().max(1000, "Keep the description under 1,000 characters."),
  image: imageField,
  productSlugs: slugList,
  active: z.boolean(),
});
export type BundleInput = z.input<typeof BundleSchema>;

export async function saveBundle(input: BundleInput): Promise<Result> {
  const session = await staffCan("merch.manage");
  if (!session) return DENIED;
  const parsed = BundleSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);
  const v = parsed.data;
  if (v.id && !validId(v.id)) return { ok: false, error: "Unknown bundle." };
  const productSlugs = [...new Set(v.productSlugs)];
  if (productSlugs.length < 2) return { ok: false, error: "A bundle needs at least two products.", fields: { productSlugs: "Add 2 or more" } };
  await db();
  if (await Bundle.exists({ slug: v.slug, ...(v.id ? { _id: { $ne: v.id } } : {}) })) return { ok: false, error: "Another bundle already uses this slug.", fields: { slug: "Already in use" } };
  const missing = await unknownSlugs(productSlugs);
  if (missing.length) return { ok: false, error: `Remove products that are no longer in the catalogue: ${missing.join(", ")}.` };
  const doc = { name: v.name, slug: v.slug, description: v.description, image: v.image.replace(/^\/+/, ""), productSlugs, active: v.active };
  let id = v.id;
  if (id) {
    const r = await Bundle.updateOne({ _id: id }, { $set: doc });
    if (!r.matchedCount) return { ok: false, error: "This bundle no longer exists." };
  } else id = String((await Bundle.create(doc))._id);
  await logActivity(session, v.id ? "bundle.update" : "bundle.create", { target: v.name, targetId: id, meta: { slug: v.slug, products: productSlugs.length, active: v.active } });
  refreshStore("/admin/bundles");
  return { ok: true, id, message: "Bundle saved." };
}

export async function deleteBundle(id: string): Promise<Result> {
  const session = await staffCan("merch.manage");
  if (!session) return DENIED;
  if (!validId(id)) return { ok: false, error: "Unknown bundle." };
  await db();
  const b = await Bundle.findByIdAndDelete(id, { projection: { name: 1, slug: 1 } }).lean<Pick<BundleDoc, "name" | "slug">>();
  if (!b) return { ok: false, error: "This bundle no longer exists." };
  await logActivity(session, "bundle.delete", { target: b.name, targetId: id, meta: { slug: b.slug } });
  refreshStore("/admin/bundles");
  return { ok: true, message: "Bundle deleted." };
}

/* ---------- gift cards ---------- */
const GiftCardIssueSchema = z
  .object({
    region: z.enum(["in", "uk"]),
    amount: z.number({ message: "Enter the amount." }),
    recipientName: z.string().trim().max(80),
    recipientEmail: z.union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid email address.")]),
    message: z.string().trim().max(300, "Keep the message under 300 characters."),
    reason: z.string().trim().min(3, "Say why this card is being issued (for the activity log).").max(200),
    notify: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const [min, max] = v.region === "in" ? [100, 100000] : [5, 1000];
    if (!(v.amount >= min && v.amount <= max)) ctx.addIssue({ code: "custom", path: ["amount"], message: `Amount must be between ${formatMoney(min, v.region)} and ${formatMoney(max, v.region)}.` });
    if (v.region === "in" && !Number.isInteger(v.amount)) ctx.addIssue({ code: "custom", path: ["amount"], message: "Use whole rupees." });
  });
export type GiftCardIssueInput = z.input<typeof GiftCardIssueSchema>;

export async function issueGiftCardManually(input: GiftCardIssueInput): Promise<Result> {
  const session = await staffCan("merch.manage");
  if (!session) return DENIED;
  const parsed = GiftCardIssueSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);
  const v = parsed.data;
  let card: GiftCardDoc;
  try {
    card = await issueGiftCard({
      region: v.region,
      amount: Math.round(v.amount * 100) / 100,
      recipientName: v.recipientName || undefined,
      recipientEmail: v.recipientEmail || undefined,
      message: v.message || undefined,
      notify: !!v.recipientEmail && v.notify,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not issue the gift card." };
  }
  await logActivity(session, "giftcard.issue", {
    target: card.code, targetId: String(card._id),
    meta: { region: v.region, amount: v.amount, recipient: v.recipientEmail || undefined, reason: v.reason, emailed: !!v.recipientEmail && v.notify },
  });
  revalidatePath("/admin/gift-cards", "layout");
  return { ok: true, id: String(card._id), message: `Gift card ${card.code} issued for ${formatMoney(v.amount, v.region)}${v.recipientEmail && v.notify ? ` and emailed to ${v.recipientEmail}` : ""}.` };
}

export async function setGiftCardActive(id: string, active: boolean, reason = ""): Promise<Result> {
  const session = await staffCan("merch.manage");
  if (!session) return DENIED;
  if (!validId(id)) return { ok: false, error: "Unknown gift card." };
  await db();
  const g = await GiftCard.findByIdAndUpdate(id, { $set: { active: !!active } }, { new: true, projection: { code: 1 } }).lean<Pick<GiftCardDoc, "code">>();
  if (!g) return { ok: false, error: "This gift card no longer exists." };
  await logActivity(session, active ? "giftcard.reactivate" : "giftcard.deactivate", { target: g.code, targetId: id, meta: { reason: String(reason ?? "").trim().slice(0, 200) || undefined } });
  revalidatePath("/admin/gift-cards", "layout");
  return { ok: true, message: active ? `${g.code} can be used again.` : `${g.code} is deactivated and can't be used at checkout.` };
}
