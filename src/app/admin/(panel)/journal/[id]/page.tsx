import type { Metadata } from "next";
import Link from "next/link";
import mongoose, { type Types } from "mongoose";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Post, type PostDoc } from "@/lib/models";
import { imagekitConfigured } from "@/lib/imagekit";
import { fmtDate } from "@/lib/admin-data";
import { PostEditor, type PostView } from "@/components/admin/content/PostEditor";

export const metadata: Metadata = { title: "Journal post" };

export default async function AdminPost({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("content.manage");
  const { id } = await params;
  let post: PostView | null = null;
  if (id !== "new") {
    if (!mongoose.isValidObjectId(id)) notFound();
    await db();
    const p = await Post.findById(id).lean<PostDoc & { _id: Types.ObjectId }>();
    if (!p) notFound();
    post = {
      id: String(p._id),
      title: p.title ?? "",
      slug: p.slug,
      excerpt: p.excerpt ?? "",
      cover: p.cover ?? "",
      tags: p.tags ?? [],
      body: p.body ?? "",
      status: p.status === "published" ? "published" : "draft",
      publishedAt: p.publishedAt ? fmtDate(p.publishedAt) : "",
    };
  }

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick"><Link href="/admin/journal">Journal</Link> / {post ? "Edit" : "New"}</p>
          <h1 className="adm-title">{post ? post.title || "Untitled" : "New post"}</h1>
        </div>
        {post?.status === "published" ? <Link className="adm-more" href={`/journal/${post.slug}`} target="_blank">View on site</Link> : null}
      </header>
      <PostEditor key={post?.id ?? "new"} post={post} uploadsEnabled={imagekitConfigured()} />
    </div>
  );
}
