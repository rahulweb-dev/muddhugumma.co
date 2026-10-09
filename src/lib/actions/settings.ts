"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { staffCan } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { getSettings, saveSettings, type StoreSettings } from "@/lib/settings";

export type SettingsResult = { ok: true; message: string } | { ok: false; error: string; fields?: Record<string, string> };

const money = (max: number) => z.number({ message: "Enter a number" }).min(0, "Can't be negative").max(max, `At most ${max}`);
const pair = (max: number) => z.object({ in: money(max), uk: money(max) });
const phone = z.string().trim().max(20).refine((v) => v === "" || /^\+?\d[\d\s]{7,}$/.test(v), "Use digits with the country code, e.g. +91 98765 43210");

const lines = z.array(z.string().trim().max(160, "Keep each message under 160 characters")).max(8, "At most 8 messages").transform((a) => a.filter(Boolean));
const perRegionLines = z.object({ in: lines, uk: lines });

const SettingsSchema = z.object({
  legalName: z.string().trim().min(2, "Enter the legal name").max(120),
  gstin: z.string().trim().toUpperCase().refine((v) => v === "" || /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v), "A GSTIN has 15 characters, e.g. 36ABCDE1234F1Z5"),
  stateCode: z.string().trim().regex(/^\d{2}$/, "Two digits, e.g. 36 for Telangana"),
  address: z.string().trim().min(10, "Enter the full address").max(300),
  ukVatNumber: z
    .string()
    .transform((v) => v.replace(/\s/g, "").toUpperCase())
    .refine((v) => v === "" || /^(GB)?\d{9}(\d{3})?$/.test(v), "e.g. GB123456789"),
  supportEmail: z.string().trim().toLowerCase().email("Enter a valid email"),
  whatsappIn: phone,
  whatsappUk: phone,
  phone: phone,
  supportHours: z.string().trim().max(120),
  instagram: z
    .string()
    .trim()
    .max(60)
    .transform((v) => v.replace(/^@/, ""))
    .refine((v) => v === "" || /^[\w.]+$/.test(v), "Just the handle, e.g. houseofmuddhugumma"),
  announcements: perRegionLines,
  ticker: perRegionLines,
  prepaidDiscountPct: z.number().min(0).max(30, "At most 30%"),
  partialCodAdvance: money(5000),
  codOtpRequired: z.boolean(),
  giftWrapFee: pair(2000),
  lowStockThreshold: z.number().int("Whole number").min(0).max(100),
  loyalty: z.object({
    pointsPerUnit: pair(100),
    pointValue: pair(100),
    maxRedeemPct: z.number().min(0).max(100),
  }),
  referralReward: pair(10000),
  birthdayCouponPct: z.number().min(0).max(50, "At most 50%"),
  abandonedCartHours: z.number().int("Whole hours").min(1).max(24 * 14),
});
export type SettingsInput = z.input<typeof SettingsSchema>;

const flat = (o: unknown, prefix = ""): Record<string, string> =>
  o && typeof o === "object"
    ? Object.assign({}, ...Object.entries(o as Record<string, unknown>).map(([k, v]) => flat(v, prefix ? `${prefix}.${k}` : k)))
    : { [prefix]: String(o) };

export async function saveStoreSettings(input: SettingsInput): Promise<SettingsResult> {
  const me = await staffCan("settings.manage");
  if (!me) return { ok: false, error: "Only the store owner can change settings." };
  const parsed = SettingsSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[i.path.join(".")] ??= i.message;
    return { ok: false, error: `Check ${Object.keys(fields)[0]}: ${Object.values(fields)[0]}`, fields };
  }
  const before = flat(await getSettings());
  const next: Partial<StoreSettings> = parsed.data;
  await saveSettings(next);
  const after = flat(parsed.data);
  const changed = Object.keys(after).filter((k) => before[k] !== after[k]);
  await logActivity(me, "settings.save", { target: "Store settings", meta: { changed: changed.join(", ") || "nothing" } });
  revalidatePath("/", "layout");
  return { ok: true, message: changed.length ? `Saved ${changed.length} change${changed.length === 1 ? "" : "s"}.` : "Saved. Nothing had changed." };
}
