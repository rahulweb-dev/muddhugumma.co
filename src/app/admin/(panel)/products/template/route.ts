import { requireAdmin } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { IMPORT_COLUMNS } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

const EXAMPLES: Record<string, string>[] = [
  {
    slug: "sample-mustard-chanderi-saree", name: "Mustard Chanderi Silk Cotton Saree", category: "sarees", fabric: "Chanderi", colour: "orange", hex: "#D9A42B",
    collections: "festive|new", occasions: "festive|office", price_in: "4499", mrp_in: "5299", price_uk: "54", mrp_uk: "",
    free_size: "true", stock_free: "8", stock_uk_free: "2", tag: "Handloom", origin: "Chanderi, Madhya Pradesh", craft: "Handwoven zari buttis",
    description: "Light Chanderi with a gold zari border, easy to drape for a full day.", details: "Saree length 5.5 m plus 0.8 m blouse piece|Zari border",
    care: "Dry clean only.", images: "products/sample-mustard-chanderi-1.webp|products/sample-mustard-chanderi-2.webp", video: "",
    made_to_order: "false", cost_price: "2100", supplier: "", active: "false",
  },
  {
    slug: "sample-ivory-chikankari-kurta-set", name: "Ivory Chikankari Kurta Set", category: "kurta-sets", fabric: "Cotton", colour: "ivory", hex: "",
    collections: "new", occasions: "everyday|office", price_in: "3299", mrp_in: "", price_uk: "42", mrp_uk: "",
    free_size: "false", stock_XS: "2", stock_S: "4", stock_M: "6", stock_L: "6", stock_XL: "3", stock_XXL: "1",
    stock_uk_XS: "0", stock_uk_S: "1", stock_uk_M: "2", stock_uk_L: "2", stock_uk_XL: "1", stock_uk_XXL: "0",
    tag: "", origin: "Lucknow, Uttar Pradesh", craft: "Hand chikankari", description: "Kurta, straight pants and a mulmul dupatta.",
    details: "Three-piece set|Kurta length 44 in", care: "Gentle hand wash.", images: "products/sample-ivory-chikankari-1.webp",
    video: "", made_to_order: "false", cost_price: "", supplier: "", active: "false",
  },
];

/** An empty bulk-upload file with two example rows (both hidden from the store until you change active to true). */
export async function GET() {
  await requireAdmin("products.manage");
  const csv = toCsv([[...IMPORT_COLUMNS], ...EXAMPLES.map((e) => IMPORT_COLUMNS.map((c) => e[c] ?? ""))]);
  return new Response("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="muddhugumma-products-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
