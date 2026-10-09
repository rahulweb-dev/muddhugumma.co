import "server-only";
import { randomInt } from "node:crypto";
import { db } from "../db";
import { Coupon, Order, User, type OrderDoc, type UserDoc } from "../models";
import { getSettings } from "../settings";
import { sendEmail } from "../notify";
import { birthdayOffer } from "../messages/account";
import type { Region } from "../region";

/** Today's date in India (the store's home timezone) as { md: "MM-DD", year }. */
function todayIST(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((p) => [p.type, p.value])
  );
  return { md: `${parts.month}-${parts.day}`, year: Number(parts.year) };
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const code = () => `BDAY-${Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;

/** Scheduled job "birthdays": a one-time birthday coupon for opted-in customers whose birthday is today (IST). */
export async function run(): Promise<string> {
  await db();
  const { md, year } = todayIST();
  // 29 February birthdays are celebrated on 28 February in other years.
  const days = md === "02-28" && !isLeap(year) ? ["02-28", "02-29"] : [md];
  const settings = await getSettings();
  const pct = Math.max(1, Math.min(90, Math.round(settings.birthdayCouponPct || 15)));

  const users = await User.find(
    { birthday: { $in: days }, marketingOptIn: true, lastBirthdayOfferYear: { $ne: year } },
    { name: 1, email: 1 }
  ).lean<Pick<UserDoc, "_id" | "name" | "email">[]>();

  let sent = 0;
  let failed = 0;
  for (const u of users) {
    try {
      // Claim first so a re-run (or two overlapping runs) can't send twice.
      const claimed = await User.updateOne({ _id: u._id, lastBirthdayOfferYear: { $ne: year } }, { $set: { lastBirthdayOfferYear: year } });
      if (!claimed.modifiedCount) continue;

      const expiresAt = new Date(Date.now() + 30 * 864e5);
      let couponCode = "";
      for (let i = 0; i < 5 && !couponCode; i++) {
        const c = code();
        try {
          await Coupon.create({
            code: c,
            description: `Birthday offer for ${u.email}`,
            type: "percent",
            value: pct,
            regions: ["in", "uk"],
            minOrder: { in: 0, uk: 0 },
            firstOrderOnly: false,
            active: true,
            expiresAt,
          });
          couponCode = c;
        } catch (e) {
          if ((e as { code?: number }).code !== 11000) throw e;
        }
      }
      if (!couponCode) throw new Error("could not create a unique coupon code");

      const last = await Order.findOne({ userId: String(u._id) }, { region: 1 }).sort({ createdAt: -1 }).lean<Pick<OrderDoc, "region">>();
      const region: Region = last?.region === "uk" ? "uk" : "in";
      const msg = birthdayOffer(u.name, couponCode, pct, expiresAt, region);
      await sendEmail({ to: u.email, subject: msg.subject, html: msg.html, text: msg.text, template: "birthday_offer", ref: couponCode });
      sent++;
    } catch (e) {
      failed++;
      console.error("[jobs:birthdays] failed for", u.email, e);
    }
  }
  return `${md}: ${users.length} birthday${users.length === 1 ? "" : "s"}, ${sent} offer${sent === 1 ? "" : "s"} sent${failed ? `, ${failed} failed` : ""}`;
}
