import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { IMPORT_COLUMNS } from "@/lib/admin-data";
import { ImportForm } from "@/components/admin/ImportForm";

export const metadata: Metadata = { title: "Bulk upload" };

const HELP: [string, string][] = [
  ["slug", "Web address, e.g. green-banarasi-saree. Matches an existing product to update it; a new slug creates a product."],
  ["category", "a category slug from Admin → Categories (e.g. sarees)"],
  ["colour", "red, pink, orange, green, blue, purple or ivory. hex is the swatch, e.g. #1D5A3A (blank uses the colour's default)."],
  ["collections / occasions", "Separate with |, e.g. bridal|festive. Collections: bridal, festive, new. Occasions: wedding, festive, office, everyday."],
  ["price_in / mrp_in", "Rupees. price_uk / mrp_uk are pounds. MRP is optional and must be above the price."],
  ["free_size", "true for sarees and dupattas (use stock_free), false for sized pieces (stock_XS … stock_XXL)."],
  ["stock_* / stock_uk_*", "India and the UK hold separate stock. stock_XS … stock_XXL and stock_free are India; stock_uk_XS … stock_uk_XXL and stock_uk_free are the UK (UK 6 = XS … UK 16 = XXL)."],
  ["details / images", "Separate with |. Images are ImageKit paths such as products/green-banarasi-1.webp; the first is the cover."],
  ["made_to_order, active", "true or false. New products default to active = true."],
  ["cost_price", "Landed cost per piece in rupees; used for margins in Reports."],
  ["supplier", "The supplier's name exactly as it appears under Suppliers."],
];

export default async function ImportPage() {
  await requireAdmin("products.manage");
  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick"><Link href="/admin/products">Products</Link> / Bulk upload</p>
          <h1 className="adm-title">Bulk upload</h1>
          <p className="muted adm-small">Add or update many products from a spreadsheet saved as CSV (UTF-8).</p>
        </div>
        <div className="adm-row">
          <a className="btn ghost adm-btn" href="/admin/products/template" download>Download template</a>
          <a className="btn ghost adm-btn" href="/admin/products/export" download>Export all products</a>
        </div>
      </header>

      <div className="adm-cols wide-left">
        <ImportForm />
        <section className="adm-card">
          <h2 className="h3">How it works</h2>
          <ul className="adm-help">
            <li>Export all products, edit the file in Excel or Google Sheets, and upload it again. Or start from the template.</li>
            <li>On an existing product, an <b>empty cell keeps the current value</b>, and a single <code>-</code> clears an optional text or list column.</li>
            <li>Leave out whole columns you don&apos;t want to touch: a file with just <code>slug</code> and <code>stock_M</code> only changes M stock.</li>
            <li>New products need name, category, fabric, colour, price_in and price_uk.</li>
            <li>Rows with errors are skipped; the rest are saved when you press Apply.</li>
          </ul>
          <h3 className="h3">Columns</h3>
          <p className="adm-small"><code>{IMPORT_COLUMNS.join(", ")}</code></p>
          <dl className="adm-help-dl">
            {HELP.map(([k, v]) => (
              <div key={k}>
                <dt><code>{k}</code></dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
