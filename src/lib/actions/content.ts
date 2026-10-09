"use server";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { staffCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { Post, type PostDoc } from "@/lib/models";
import { logActivity } from "@/lib/audit";
import { renderMarkdown } from "@/lib/markdown";
import { SLUG_RX, type Result } from "@/components/admin/content/shared";

/* Journal (blog) actions. Permission: content.manage. */

const DENIED: Result = { ok: false, error: "You don't have permission to do this." };

function fail(e: z.ZodError): Result {
  const fields: Record<string, string> = {};
  for (const i of e.issues) {
    const k = i.path.join(".") || "form";
    if (!fields[k]) fields[k] = i.message;
  }
  return { ok: false, error: e.issues[0]?.message ?? "Check the form and try again.", fields };
}

const PostSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(3, "Add a title (3+ characters).").max(140, "Keep the title under 140 characters."),
  slug: z.string().trim().toLowerCase().min(3, "The slug is too short.").max(100).regex(SLUG_RX, "Slug: use lowercase letters, numbers and hyphens."),
  excerpt: z.string().trim().max(300, "Keep the excerpt under 300 characters."),
  cover: z.string().trim().max(300).regex(/^[^\s]*$/, "Image paths cannot contain spaces."),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(12, "Use at most 12 tags."),
  body: z.string().max(60_000, "The post is too long."),
  intent: z.enum(["save", "publish", "unpublish"]),
});
export type PostInput = z.input<typeof PostSchema>;

export async function savePost(input: PostInput): Promise<Result> {
  const session = await staffCan("content.manage");
  if (!session) return DENIED;
  const parsed = PostSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);
  const v = parsed.data;
  if (v.id && !mongoose.isValidObjectId(v.id)) return { ok: false, error: "Unknown post." };
  if (v.intent === "publish") {
    if (v.body.trim().length < 50) return { ok: false, error: "Write at least a short paragraph (50+ characters) before publishing.", fields: { body: "Too short to publish" } };
    if (!v.excerpt) return { ok: false, error: "Add an excerpt before publishing: it shows on the journal page and in search results.", fields: { excerpt: "Required to publish" } };
  }

  await db();
  const clash = await Post.exists({ slug: v.slug, ...(v.id ? { _id: { $ne: v.id } } : {}) });
  if (clash) return { ok: false, error: "Another post already uses this slug.", fields: { slug: "Already in use" } };

  const before = v.id ? await Post.findById(v.id, { status: 1, publishedAt: 1, slug: 1 }).lean<Pick<PostDoc, "status" | "publishedAt" | "slug">>() : null;
  if (v.id && !before) return { ok: false, error: "This post no longer exists." };

  const status = v.intent === "publish" ? "published" : v.intent === "unpublish" ? "draft" : (before?.status ?? "draft");
  const set: Record<string, unknown> = {
    title: v.title,
    slug: v.slug,
    excerpt: v.excerpt,
    cover: v.cover.replace(/^\/+/, ""),
    tags: [...new Set(v.tags)],
    body: v.body,
    status,
  };
  if (status === "published" && !before?.publishedAt) set.publishedAt = new Date();

  let id = v.id;
  if (id) await Post.updateOne({ _id: id }, { $set: set });
  else {
    const created = await Post.create({ ...set, author: session.name });
    id = String(created._id);
  }

  const action = v.intent === "publish" ? (before?.status === "published" ? "post.update" : "post.publish") : v.intent === "unpublish" ? "post.unpublish" : "post.save";
  await logActivity(session, action, { target: v.title, targetId: id, meta: { slug: v.slug, status } });
  revalidatePath("/admin/journal", "layout");
  revalidatePath("/journal", "layout");
  if (before?.slug && before.slug !== v.slug) revalidatePath(`/journal/${before.slug}`);
  const message =
    v.intent === "publish" ? (before?.status === "published" ? "Changes are live." : "Post published.") : v.intent === "unpublish" ? "Post unpublished: it is a draft again." : status === "published" ? "Saved. The post is live." : "Draft saved.";
  return { ok: true, id, message };
}

export async function deletePost(id: string): Promise<Result> {
  const session = await staffCan("content.manage");
  if (!session) return DENIED;
  if (!mongoose.isValidObjectId(id)) return { ok: false, error: "Unknown post." };
  await db();
  const p = await Post.findByIdAndDelete(id, { projection: { title: 1, slug: 1 } }).lean<Pick<PostDoc, "title" | "slug">>();
  if (!p) return { ok: false, error: "This post no longer exists." };
  await logActivity(session, "post.delete", { target: p.title, targetId: id, meta: { slug: p.slug } });
  revalidatePath("/admin/journal", "layout");
  revalidatePath("/journal", "layout");
  return { ok: true, message: "Post deleted." };
}

/** Live preview for the editor: the same renderer the journal uses. */
export async function previewMarkdown(md: string): Promise<string> {
  const session = await staffCan("content.manage");
  if (!session) return "";
  return renderMarkdown(String(md ?? "").slice(0, 60_000));
}
