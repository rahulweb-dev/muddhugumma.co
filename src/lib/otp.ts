import "server-only";
import { createHash, randomInt } from "node:crypto";
import { db } from "./db";
import { Otp, type OtpDoc } from "./models";
import { sendSms, sendWhatsApp, toE164 } from "./notify";

/*
 * One-time codes sent by SMS + WhatsApp (used to confirm the phone number on cash-on-delivery orders).
 * Rules: 6 digits, stored only as a sha256 hash, valid for 10 minutes, 5 wrong tries per code,
 * a new code can be requested after 30 seconds (and at most 6 per hour per number).
 * Test mode: without Twilio keys outside production the code is returned to the client so it can be shown on screen.
 */

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_RESEND_MS = 30 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_HOUR = 6;

const hash = (phone: string, code: string) => createHash("sha256").update(`${phone}:${code}:${process.env.AUTH_SECRET ?? "mg-otp"}`).digest("hex");

/** True when a code can actually reach the shopper (a provider is configured), or in development (code shown on screen). */
export const otpDeliverable = () =>
  !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) ||
  !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID) ||
  process.env.NODE_ENV !== "production";

const testMode = () => !process.env.TWILIO_ACCOUNT_SID && process.env.NODE_ENV !== "production";

export type SendOtpResult = { ok: true; phone: string; retryAfter: number; testCode?: string } | { ok: false; error: string; retryAfter?: number };

export async function sendOtp(phone: string, purpose: string, ref = "", region: "in" | "uk" = "in"): Promise<SendOtpResult> {
  const e164 = toE164(phone, region);
  if (!/^\+\d{10,15}$/.test(e164)) return { ok: false, error: "Enter a valid mobile number." };
  await db();
  const now = Date.now();
  const last = await Otp.findOne({ phone: e164, purpose }).sort({ createdAt: -1 }).lean<OtpDoc>();
  if (last?.createdAt && now - new Date(last.createdAt).getTime() < OTP_RESEND_MS) {
    const retryAfter = Math.ceil((OTP_RESEND_MS - (now - new Date(last.createdAt).getTime())) / 1000);
    return { ok: false, error: `Please wait ${retryAfter} seconds before asking for a new code.`, retryAfter };
  }
  const recent = await Otp.countDocuments({ phone: e164, purpose, createdAt: { $gt: new Date(now - 3600_000) } });
  if (recent >= OTP_MAX_PER_HOUR) return { ok: false, error: "Too many codes requested for this number. Please try again in an hour." };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await Otp.create({ phone: e164, purpose, codeHash: hash(e164, code), expiresAt: new Date(now + OTP_TTL_MS), attempts: 0, ref });

  const text = `${code} is your House of Muddhugumma code to confirm your cash on delivery order. It expires in 10 minutes. Don't share it with anyone.`;
  await Promise.all([
    sendSms({ to: e164, region, text, template: "otp", ref }),
    sendWhatsApp({ to: e164, region, template: "otp_code", params: [code], preview: text, ref }),
  ]);
  return { ok: true, phone: e164, retryAfter: OTP_RESEND_MS / 1000, testCode: testMode() ? code : undefined };
}

export type VerifyOtpResult = { ok: true } | { ok: false; error: string };

export async function verifyOtp(phone: string, purpose: string, code: string, region: "in" | "uk" = "in"): Promise<VerifyOtpResult> {
  const e164 = toE164(phone, region);
  const c = String(code ?? "").replace(/\D/g, "");
  if (c.length !== 6) return { ok: false, error: "Enter the 6-digit code." };
  await db();
  const otp = await Otp.findOne({ phone: e164, purpose, verifiedAt: { $exists: false } }).sort({ createdAt: -1 }).lean<OtpDoc>();
  if (!otp || new Date(otp.expiresAt).getTime() < Date.now()) return { ok: false, error: "This code has expired. Ask for a new one." };
  if ((otp.attempts ?? 0) >= OTP_MAX_ATTEMPTS) return { ok: false, error: "Too many wrong tries. Ask for a new code." };
  if (otp.codeHash !== hash(e164, c)) {
    await Otp.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });
    const left = OTP_MAX_ATTEMPTS - (otp.attempts ?? 0) - 1;
    return { ok: false, error: left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong tries. Ask for a new code." };
  }
  const res = await Otp.updateOne({ _id: otp._id, verifiedAt: { $exists: false }, attempts: { $lt: OTP_MAX_ATTEMPTS } }, { $set: { verifiedAt: new Date() } });
  return res.modifiedCount ? { ok: true } : { ok: false, error: "This code was already used. Ask for a new one." };
}

/** Whether this phone was verified for `purpose` within the last `withinMs` (default 15 minutes). */
export async function hasVerifiedOtp(phone: string, purpose: string, region: "in" | "uk" = "in", withinMs = 15 * 60 * 1000): Promise<boolean> {
  await db();
  const e164 = toE164(phone, region);
  return !!(await Otp.exists({ phone: e164, purpose, verifiedAt: { $gt: new Date(Date.now() - withinMs) } }));
}
