"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { Product, StockAlert, type ProductDoc } from "@/lib/models";
import { getRegion } from "@/lib/queries";
import { canonicalSize } from "@/lib/region";
import { stockFor } from "@/lib/stock";
import { TOO_MANY, allow } from "@/lib/rate-limit";

export type AlertState = { ok: boolean; message: string } | null;

const AlertInput = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]{1,120}$/),
  size: z.string().trim().min(1).max(20),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(160),
});

/** "Notify me": records a back-in-stock alert for a sold-out size. The back-in-stock job emails the shopper. */
export async function requestStockAlert(_: AlertState, form: FormData): Promise<AlertState> {
  if (!(await allow("stock-alert", 20, 3600))) return { ok: false, message: TOO_MANY };
  const parsed = AlertInput.safeParse({ slug: form.get("slug"), size: form.get("size"), email: form.get("email") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues.find((i) => i.path[0] === "email")?.message ?? "Please check your details and try again." };
  const { slug, email } = parsed.data;
  const size = canonicalSize(parsed.data.size);

  await db();
  const [p, region] = await Promise.all([
    Product.findOne({ slug, active: true }, { stock: 1, stockUk: 1, freeSize: 1, name: 1 }).lean<Pick<ProductDoc, "stock" | "stockUk" | "freeSize" | "name">>(),
    getRegion(),
  ]);
  if (!p) return { ok: false, message: "This piece is no longer available." };
  const stock = stockFor(p, region); // the shopper waits on their own country's stock
  if (!(size in stock) && !(p.freeSize && size === "Free size")) return { ok: false, message: "Please choose a size." };
  if ((stock[size] ?? 0) > 0) return { ok: false, message: "Good news: this size is in stock right now. Add it to your bag before it goes." };

  await StockAlert.updateOne(
    { productSlug: slug, size, email },
    { $set: { region }, $unset: { notifiedAt: "" }, $setOnInsert: { productSlug: slug, size, email } },
    { upsert: true }
  );
  const label = size === "Free size" ? "it" : `size ${size}`;
  return { ok: true, message: `Done. We'll email ${email} as soon as ${label} is back. No other emails, promise.` };
}
