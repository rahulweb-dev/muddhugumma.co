import "server-only";
import { cache } from "react";
import { db } from "./db";
import { Settings, type SettingsDoc } from "./models";

export type StoreSettings = Omit<SettingsDoc, "_id" | "createdAt" | "updatedAt">;

export const DEFAULT_SETTINGS: StoreSettings = {
  key: "store",
  legalName: "House of Muddhugumma",
  gstin: "",
  stateCode: "36",
  address: "Jubilee Hills, Hyderabad, Telangana 500033, India",
  ukVatNumber: "",
  supportEmail: "care@muddhugumma.com",
  whatsappIn: "",
  whatsappUk: "",
  prepaidDiscountPct: 5,
  partialCodAdvance: 200,
  codOtpRequired: true,
  giftWrapFee: { in: 99, uk: 3 },
  lowStockThreshold: 3,
  loyalty: { pointsPerUnit: { in: 1, uk: 1 }, pointValue: { in: 1, uk: 0.01 }, maxRedeemPct: 20 },
  referralReward: { in: 500, uk: 5 },
  birthdayCouponPct: 15,
  abandonedCartHours: 24,
};

/** Store-wide settings (one document). Cached for the duration of a request. */
export const getSettings = cache(async (): Promise<StoreSettings> => {
  await db();
  const doc = await Settings.findOne({ key: "store" }).lean<SettingsDoc>();
  if (!doc) return DEFAULT_SETTINGS;
  const { _id: _i, createdAt: _c, updatedAt: _u, ...rest } = doc;
  return { ...DEFAULT_SETTINGS, ...rest, loyalty: { ...DEFAULT_SETTINGS.loyalty, ...rest.loyalty } };
});

export async function saveSettings(patch: Partial<StoreSettings>) {
  await db();
  await Settings.updateOne({ key: "store" }, { $set: { ...patch, key: "store" } }, { upsert: true });
}
