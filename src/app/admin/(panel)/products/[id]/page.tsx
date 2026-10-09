import type { Metadata } from "next";
import Link from "next/link";
import mongoose from "mongoose";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Product, type ProductDoc } from "@/lib/models";
import { toDTO } from "@/lib/queries";
import { imagekitConfigured } from "@/lib/imagekit";
import { productFormOptions, type ProductExtras } from "@/lib/admin-data";
import { ProductForm } from "@/components/admin/ProductForm";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("products.manage");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!mongoose.isValidObjectId(id)) notFound();
  await db();
  const [doc, options] = await Promise.all([Product.findById(id).lean<ProductDoc>(), productFormOptions()]);
  if (!doc) notFound();
  const product = toDTO(doc);
  const extras: ProductExtras = {
    video: doc.video ?? "",
    madeToOrder: !!doc.madeToOrder,
    costPrice: doc.costPrice ?? 0,
    supplierId: doc.supplierId ?? "",
    lookbooks: [...(doc.lookbooks ?? [])],
  };

  return (
    <div className="adm-page narrow">
      <header className="adm-head">
        <div>
          <p className="kick"><Link href="/admin/products">Products</Link> / Edit</p>
          <h1 className="adm-title">{product.name}</h1>
          {!product.active && <span className="status cancelled">Hidden from store</span>}
        </div>
      </header>
      {sp.saved ? <p className="notice ok" role="status">Product created.</p> : null}
      <ProductForm key={product.id + product.slug} product={product} extras={extras} options={options} uploadsEnabled={imagekitConfigured()} />
    </div>
  );
}
