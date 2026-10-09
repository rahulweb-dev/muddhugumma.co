"use server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { User, type CartItemDoc } from "@/lib/models";

type InLine = { slug?: unknown; size?: unknown; qty?: unknown; options?: { blouse?: unknown; fallPico?: unknown } | null };

const clean = (lines: unknown): CartItemDoc[] => {
  if (!Array.isArray(lines)) return [];
  const out: CartItemDoc[] = [];
  for (const raw of lines.slice(0, 50) as InLine[]) {
    if (!raw || typeof raw !== "object") continue;
    const slug = typeof raw.slug === "string" ? raw.slug.trim() : "";
    const size = typeof raw.size === "string" ? raw.size.trim() : "";
    const qty = Math.floor(Number(raw.qty));
    if (!/^[a-z0-9-]{1,120}$/.test(slug) || !size || size.length > 40 || !(qty >= 1 && qty <= 10)) continue;
    const blouse = raw.options?.blouse === "stitched" || raw.options?.blouse === "unstitched" ? raw.options.blouse : undefined;
    const fallPico = raw.options?.fallPico === true;
    out.push({ slug, size, qty, ...(blouse || fallPico ? { options: { ...(blouse ? { blouse } : {}), ...(fallPico ? { fallPico } : {}) } } : {}) });
  }
  return out;
};

const sig = (lines: CartItemDoc[]) =>
  lines
    .map((l) => [l.slug, l.size, l.qty, l.options?.blouse ?? "", l.options?.fallPico ? 1 : 0].join("|"))
    .sort()
    .join(";");

/**
 * Mirrors a signed-in shopper's bag on their account for abandoned-bag reminders.
 * Only slug/size/qty/options are stored; names and prices are always read fresh from the catalogue.
 * Unchanged bags are ignored, so page loads don't reset the reminder clock.
 */
export async function syncCart(lines: { slug: string; size: string; qty: number; options?: { blouse?: string; fallPico?: boolean } }[]): Promise<void> {
  try {
    const s = await getSession();
    if (!s) return;
    const next = clean(lines);
    await db();
    const user = await User.findById(s.uid, { cart: 1 }).lean<{ cart?: CartItemDoc[] }>();
    if (!user) return;
    if (sig(clean(user.cart ?? [])) === sig(next)) return;
    if (!next.length) {
      await User.updateOne({ _id: s.uid }, { $set: { cart: [] }, $unset: { cartUpdatedAt: 1, cartRemindedAt: 1 } });
    } else {
      await User.updateOne({ _id: s.uid }, { $set: { cart: next, cartUpdatedAt: new Date() }, $unset: { cartRemindedAt: 1 } });
    }
  } catch (e) {
    console.error("[cart] sync failed", e);
  }
}
