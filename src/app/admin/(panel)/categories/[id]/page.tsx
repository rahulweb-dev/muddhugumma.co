import type { Metadata } from "next";
import Link from "next/link";
import mongoose, { type Types } from "mongoose";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Category, Product, type CategoryDoc } from "@/lib/models";
import { imagekitConfigured } from "@/lib/imagekit";
import { CategoryForm, type CategoryView } from "@/components/admin/site/CategoryForm";

export const metadata: Metadata = { title: "Category" };

export default async function AdminCategory({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("products.manage");
  const { id } = await params;
  let view: CategoryView | null = null;
  let products = 0;
  let nextSort = 0;
  await db();
  if (id !== "new") {
    if (!mongoose.isValidObjectId(id)) notFound();
    const c = await Category.findById(id).lean<CategoryDoc & { _id: Types.ObjectId }>();
    if (!c) notFound();
    view = { id: String(c._id), name: c.name, slug: c.slug, kicker: c.kicker ?? "", blurb: c.blurb ?? "", image: c.image ?? "", sort: c.sort ?? 0, active: c.active !== false, inNav: c.inNav !== false };
    products = await Product.countDocuments({ category: c.slug });
  } else {
    const last = await Category.findOne({}, { sort: 1 }).sort({ sort: -1 }).lean<{ sort?: number }>();
    nextSort = (last?.sort ?? -1) + 1; // new categories go to the end of the menu
  }

  return (
    <div className="adm-page narrow">
      <header className="adm-head">
        <div>
          <p className="kick"><Link href="/admin/categories">Categories</Link> / {view ? "Edit" : "New"}</p>
          <h1 className="adm-title">{view ? view.name : "New category"}</h1>
        </div>
        {view?.active ? <Link className="adm-more" href={`/c/${view.slug}`} target="_blank">View on site</Link> : null}
      </header>
      <CategoryForm key={view?.id ?? "new"} category={view} productCount={products} nextSort={nextSort} uploadsEnabled={imagekitConfigured()} />
    </div>
  );
}
