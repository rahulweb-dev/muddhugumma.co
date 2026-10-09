"use server";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { staffCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { Category, Page, Product } from "@/lib/models";
import { logActivity } from "@/lib/audit";
import { saveSettings } from "@/lib/settings";
import { SLUG_RX, type Result } from "@/components/admin/content/shared";

/* Storefront structure and copy: categories (products.manage), pages and homepage (content.manage). */

const DENIED: Result = { ok: false, error: "You don't have permission to do this." };

function fail(e: z.ZodError): Result {
  const fields: Record<string, string> = {};
  for (const i of e.issues) {
    const k = i.path.join(".") || "form";
    if (!fields[k]) fields[k] = i.message;
  }
  return { ok: false, error: e.issues[0]?.message ?? "Check the form and try again.", fields };
}

const imagePath = z.string().trim().max(300).regex(/^[^\s]*$/, "Image paths cannot contain spaces.");
/** Reserved listing addresses that a category can't take. */
const RESERVED = ["all", "new", "sale", "bridal", "festive"];

/* ---------- categories ---------- */
const CategorySchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Name the category.").max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "The slug is too short.")
    .max(60)
    .regex(SLUG_RX, "Slug: use lowercase letters, numbers and hyphens.")
    .refine((s) => !RESERVED.includes(s), "That address is used by a built-in edit. Choose another slug."),
  kicker: z.string().trim().max(60),
  blurb: z.string().trim().max(300, "Keep the description under 300 characters."),
  image: imagePath,
  sort: z.number().int("Use a whole number.").min(0).max(999),
  active: z.boolean(),
  inNav: z.boolean(),
});
export type CategoryInput = z.input<typeof CategorySchema>;

export async function saveCategory(input: CategoryInput): Promise<Result> {
  const session = await staffCan("products.manage");
  if (!session) return DENIED;
  const parsed = CategorySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);
  const { id, ...v } = parsed.data;
  if (id && !mongoose.isValidObjectId(id)) return { ok: false, error: "Unknown category." };
  await db();
  const clash = await Category.exists({ slug: v.slug, ...(id ? { _id: { $ne: id } } : {}) });
  if (clash) return { ok: false, error: "Another category already uses this slug.", fields: { slug: "Already in use" } };

  let savedId = id;
  let moved = 0;
  if (id) {
    const before = await Category.findById(id, { slug: 1 }).lean<{ slug: string }>();
    if (!before) return { ok: false, error: "This category no longer exists." };
    await Category.updateOne({ _id: id }, { $set: v });
    // Renaming the slug moves its products along with it.
    if (before.slug !== v.slug) moved = (await Product.updateMany({ category: before.slug }, { $set: { category: v.slug } })).modifiedCount;
  } else {
    savedId = String((await Category.create(v))._id);
  }
  await logActivity(session, id ? "category.update" : "category.create", { target: v.name, targetId: savedId, meta: { slug: v.slug } });
  revalidatePath("/", "layout");
  return { ok: true, id: savedId, message: moved ? `Category saved. ${moved} products moved to the new address.` : "Category saved." };
}

export async function deleteCategory(id: string): Promise<Result> {
  const session = await staffCan("products.manage");
  if (!session) return DENIED;
  if (!mongoose.isValidObjectId(id)) return { ok: false, error: "Unknown category." };
  await db();
  const c = await Category.findById(id, { slug: 1, name: 1 }).lean<{ slug: string; name: string }>();
  if (!c) return { ok: false, error: "This category no longer exists." };
  const used = await Product.countDocuments({ category: c.slug });
  if (used) return { ok: false, error: `${used} product${used === 1 ? " is" : "s are"} still in ${c.name}. Move them to another category, or hide the category instead.` };
  await Category.deleteOne({ _id: id });
  await logActivity(session, "category.delete", { target: c.name, targetId: id, meta: { slug: c.slug } });
  revalidatePath("/", "layout");
  return { ok: true, message: "Category deleted." };
}

/* ---------- pages ---------- */
const PageSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(SLUG_RX, "Unknown page.").max(40),
  title: z.string().trim().min(2, "Add a title.").max(120),
  intro: z.string().trim().max(400, "Keep the intro under 400 characters."),
  body: z.string().max(80_000, "The page is too long."),
  published: z.boolean(),
});
export type PageInput = z.input<typeof PageSchema>;

export async function savePage(input: PageInput): Promise<Result> {
  const session = await staffCan("content.manage");
  if (!session) return DENIED;
  const parsed = PageSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);
  const v = parsed.data;
  await db();
  await Page.updateOne({ slug: v.slug }, { $set: v }, { upsert: true });
  await logActivity(session, "page.save", { target: v.title, meta: { slug: v.slug, published: String(v.published) } });
  revalidatePath("/", "layout");
  return { ok: true, message: v.published ? "Page saved and live." : "Page saved. It's hidden, so the built-in text shows instead." };
}

/** Removes the saved page so the built-in text shows again. */
export async function resetPage(slug: string): Promise<Result> {
  const session = await staffCan("content.manage");
  if (!session) return DENIED;
  if (!SLUG_RX.test(slug)) return { ok: false, error: "Unknown page." };
  await db();
  await Page.deleteOne({ slug });
  await logActivity(session, "page.reset", { target: slug });
  revalidatePath("/", "layout");
  return { ok: true, message: "Back to the built-in text." };
}

/* ---------- homepage ---------- */
const href = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || v.startsWith("/") || /^https:\/\//.test(v), "Links start with / (a page on this site) or https://");
const SlideSchema = z.object({
  kicker: z.string().trim().max(60),
  title: z.string().trim().min(2, "Each slide needs a heading.").max(60),
  accent: z.string().trim().max(40),
  text: z.string().trim().max(240),
  ctaLabel: z.string().trim().max(30),
  ctaHref: href,
  linkLabel: z.string().trim().max(30),
  linkHref: href,
  image: imagePath.min(1, "Each slide needs an image."),
  alt: z.string().trim().max(160),
});
const HomeSchema = z.object({
  slides: z.array(SlideSchema).max(6, "Use at most 6 slides."),
  story: z.object({
    kicker: z.string().trim().max(60),
    title: z.string().trim().max(80),
    accent: z.string().trim().max(60),
    text: z.string().trim().max(1200),
    image: imagePath,
  }),
});
export type HomeInput = z.input<typeof HomeSchema>;

export async function saveHome(input: HomeInput): Promise<Result> {
  const session = await staffCan("content.manage");
  if (!session) return DENIED;
  const parsed = HomeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);
  await saveSettings({ home: parsed.data });
  await logActivity(session, "home.save", { target: "Homepage", meta: { slides: String(parsed.data.slides.length) } });
  revalidatePath("/", "layout");
  return { ok: true, message: "Homepage saved." };
}
