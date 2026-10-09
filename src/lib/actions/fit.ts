"use server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { User } from "@/lib/models";

const inches = z.coerce.number().min(20, "That looks too small. Check the unit.").max(70, "That looks too large. Check the unit.").optional();

const FitInput = z.object({
  bust: inches,
  waist: inches,
  hip: inches,
  usualSize: z.enum(["XS", "S", "M", "L", "XL", "XXL"]).optional(),
  brand: z.string().trim().max(40).optional(),
  brandSize: z.string().trim().max(20).optional(),
});

export type FitInputType = z.input<typeof FitInput>;

/** Saves the shopper's body measurements (always in inches) and usual size for next time. */
export async function saveMeasurements(input: FitInputType): Promise<{ ok: boolean; message: string }> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Sign in to save your measurements." };
  const parsed = FitInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Please check your measurements." };
  const { bust, waist, hip, usualSize, brand, brandSize } = parsed.data;
  if (!bust && !waist && !hip && !(brand && brandSize)) return { ok: false, message: "Add at least one measurement or your usual size." };

  const r1 = (n?: number) => (n ? Math.round(n * 10) / 10 : undefined);
  const set: Record<string, unknown> = {};
  const unset: Record<string, ""> = {};
  for (const [k, v] of Object.entries({ bust: r1(bust), waist: r1(waist), hip: r1(hip) })) {
    if (v) set[`measurements.${k}`] = v;
  }
  if (usualSize) set["measurements.usualSize"] = usualSize;
  if (brand && brandSize) set["measurements.brandSizes"] = { [brand.replace(/[.$]/g, "")]: brandSize };
  else if (bust || waist || hip) unset["measurements.brandSizes"] = "";

  await db();
  await User.updateOne({ _id: session.uid }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) });
  return { ok: true, message: "Saved to your profile. We'll suggest your size on every piece." };
}
