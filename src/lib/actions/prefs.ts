"use server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { Subscriber, User } from "@/lib/models";
import { REGION_COOKIE, isRegion } from "@/lib/region";
import { LOOKS, LOOK_COOKIE } from "@/components/catalog/looks";
import { TOO_MANY, allow } from "@/lib/rate-limit";

export async function setRegionAction(region: string) {
  if (!isRegion(region)) return;
  (await cookies()).set(REGION_COOKIE, region, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}

/** Development-only preview of the listing grid designs. */
export async function setLookAction(look: string) {
  if (process.env.NODE_ENV === "production" || !LOOKS.some((l) => l.id === look)) return;
  (await cookies()).set(LOOK_COOKIE, look, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
}

/** Saves the wishlist for signed-in customers; guests keep it in the browser. Returns the merged list. */
export async function syncWishlist(slugs: string[]): Promise<string[] | null> {
  const s = await getSession();
  if (!s) return null;
  await db();
  const clean = [...new Set(slugs.filter((x) => typeof x === "string" && x.length < 120))].slice(0, 200);
  await User.updateOne({ _id: s.uid }, { $set: { wishlist: clean } });
  return clean;
}

export async function subscribeAction(_: unknown, form: FormData): Promise<{ ok: boolean; message: string }> {
  const email = String(form.get("email") || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Enter a valid email address." };
  if (!(await allow("subscribe", 10, 3600))) return { ok: false, message: TOO_MANY };
  await db();
  const region = (await cookies()).get(REGION_COOKIE)?.value || "in";
  await Subscriber.updateOne({ email }, { $set: { email, region } }, { upsert: true });
  return { ok: true, message: `You're in. Use code MUDDHU10 for 10% off your first order.` };
}
