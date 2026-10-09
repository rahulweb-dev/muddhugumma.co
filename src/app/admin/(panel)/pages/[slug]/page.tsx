import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Page, type PageDoc } from "@/lib/models";
import { PAGE_SLOTS } from "@/lib/pages";
import { PageEditor } from "@/components/admin/site/PageEditor";

export const metadata: Metadata = { title: "Edit page" };

export default async function AdminPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdmin("content.manage");
  const { slug } = await params;
  const slot = PAGE_SLOTS.find((s) => s.slug === slug);
  if (!slot) notFound();
  await db();
  const p = await Page.findOne({ slug }).lean<PageDoc>();

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">
            <Link href="/admin/pages">Pages</Link> / {slot.label}
          </p>
          <h1 className="adm-title">{p?.title || slot.label}</h1>
        </div>
        <Link className="adm-more" href={slot.href} target="_blank">
          View on site
        </Link>
      </header>
      <PageEditor
        key={slug}
        slug={slug}
        saved={!!p}
        initial={{ title: p?.title ?? slot.label, intro: p?.intro ?? "", body: p?.body ?? "", published: p?.published ?? true }}
      />
    </div>
  );
}
