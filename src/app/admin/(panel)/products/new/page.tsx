import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { imagekitConfigured } from "@/lib/imagekit";
import { productFormOptions } from "@/lib/admin-data";
import { ProductForm } from "@/components/admin/ProductForm";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireAdmin("products.manage");
  const options = await productFormOptions();
  return (
    <div className="adm-page narrow">
      <header className="adm-head">
        <div>
          <p className="kick"><Link href="/admin/products">Products</Link> / New</p>
          <h1 className="adm-title">New product</h1>
        </div>
      </header>
      <ProductForm product={null} extras={null} options={options} uploadsEnabled={imagekitConfigured()} />
    </div>
  );
}
