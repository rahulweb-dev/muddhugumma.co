import type { Metadata } from "next";
import Link from "next/link";
import mongoose, { type Types } from "mongoose";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Lookbook, type LookbookDoc } from "@/lib/models";
import { imagekitConfigured } from "@/lib/imagekit";
import { pickedProducts } from "@/components/admin/content/data";
import { LookbookForm, type LookbookView } from "@/components/admin/content/MerchForms";

export const metadata: Metadata = { title: "Lookbook" };

export default async function AdminLookbook({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("merch.manage");
  const { id } = await params;
  let view: LookbookView | null = null;
  if (id !== "new") {
    if (!mongoose.isValidObjectId(id)) notFound();
    await db();
    const l = await Lookbook.findById(id).lean<LookbookDoc & { _id: Types.ObjectId }>();
    if (!l) notFound();
    view = {
      id: String(l._id),
      title: l.title ?? "",
      slug: l.slug,
      festival: l.festival ?? "",
      intro: l.intro ?? "",
      hero: l.hero ?? "",
      products: await pickedProducts(l.productSlugs ?? []),
      active: !!l.active,
      sort: l.sort ?? 0,
    };
  }
  return (
    <div className="adm-page narrow">
      <header className="adm-head">
        <div>
          <p className="kick"><Link href="/admin/lookbooks">Lookbooks</Link> / {view ? "Edit" : "New"}</p>
          <h1 className="adm-title">{view ? view.title || view.slug : "New lookbook"}</h1>
        </div>
      </header>
      <LookbookForm key={view?.id ?? "new"} lookbook={view} uploadsEnabled={imagekitConfigured()} />
    </div>
  );
}
