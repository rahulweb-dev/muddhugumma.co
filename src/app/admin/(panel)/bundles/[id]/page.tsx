import type { Metadata } from "next";
import Link from "next/link";
import mongoose, { type Types } from "mongoose";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Bundle, type BundleDoc } from "@/lib/models";
import { imagekitConfigured } from "@/lib/imagekit";
import { pickedProducts } from "@/components/admin/content/data";
import { BundleForm, type BundleView } from "@/components/admin/content/MerchForms";

export const metadata: Metadata = { title: "Bundle" };

export default async function AdminBundle({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("merch.manage");
  const { id } = await params;
  let view: BundleView | null = null;
  if (id !== "new") {
    if (!mongoose.isValidObjectId(id)) notFound();
    await db();
    const b = await Bundle.findById(id).lean<BundleDoc & { _id: Types.ObjectId }>();
    if (!b) notFound();
    view = {
      id: String(b._id),
      name: b.name ?? "",
      slug: b.slug,
      description: b.description ?? "",
      image: b.image ?? "",
      products: await pickedProducts(b.productSlugs ?? []),
      active: !!b.active,
    };
  }
  return (
    <div className="adm-page narrow">
      <header className="adm-head">
        <div>
          <p className="kick"><Link href="/admin/bundles">Bundles</Link> / {view ? "Edit" : "New"}</p>
          <h1 className="adm-title">{view ? view.name || view.slug : "New bundle"}</h1>
        </div>
      </header>
      <p className="notice adm-small">Bundle discounts aren&apos;t applied at checkout yet. The bundle shows the products together; each is charged at its normal (or sale) price.</p>
      <BundleForm key={view?.id ?? "new"} bundle={view} uploadsEnabled={imagekitConfigured()} />
    </div>
  );
}
