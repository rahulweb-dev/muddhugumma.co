"use server";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { LoginAttempt, PasswordReset, User, type LoginAttemptDoc, type PasswordResetDoc } from "@/lib/models";
import { createSession, destroySession, getSession } from "@/lib/auth";
import { REGION_CONFIG, isRegion, type Region } from "@/lib/region";
import { isStaff } from "@/lib/permissions";
import { attachReferral } from "@/lib/referral";
import { sendEmail } from "@/lib/notify";
import { siteUrl } from "@/lib/email-layout";
import { passwordReset as passwordResetEmail } from "@/lib/messages/account";
import { TOO_MANY, allow } from "@/lib/rate-limit";

export type ActionState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  /** Submitted values (never passwords), so forms can keep what the shopper typed after an error. */
  values?: Record<string, string>;
};

let dummy: Promise<string> | null = null;
const dummyHash = () => (dummy ??= bcrypt.hash("not-a-real-password-0", 10));

const GENERIC_LOGIN_ERROR ="Email or password is incorrect";
const MAX_ADDRESSES = 12;

/* ---------- helpers ---------- */

/** Only same-site relative paths are allowed as a post-login destination. */
function safeNext(raw: FormDataEntryValue | null): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\") || /[\r\n]/.test(v)) return null;
  if (["/account/login", "/account/register", "/account/forgot", "/account/reset", "/admin/login"].some((p) => v.startsWith(p))) return null;
  return v;
}

const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

function issuesToErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = String(i.path[0] ?? "form");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

/* ---------- sign-in rate limiting ---------- */

const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

/** Rate-limit keys for a sign-in attempt: the email, and the client IP (first x-forwarded-for entry) when known. */
async function attemptKeys(emailAddr: string): Promise<string[]> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "").trim().slice(0, 64);
  return [`email:${emailAddr}`, ...(ip ? [`ip:${ip}`] : [])];
}

/** Minutes left on a lock for any of the keys, or 0. Expired locks are cleared so counting starts again. */
async function lockedMinutes(keys: string[]): Promise<number> {
  const now = Date.now();
  const docs = await LoginAttempt.find({ key: { $in: keys } }).lean<LoginAttemptDoc[]>();
  let ms = 0;
  for (const d of docs) {
    const until = d.lockedUntil ? new Date(d.lockedUntil).getTime() : 0;
    if (until > now) ms = Math.max(ms, until - now);
    else if (until) await LoginAttempt.deleteOne({ key: d.key, lockedUntil: d.lockedUntil });
  }
  return ms ? Math.max(1, Math.ceil(ms / 60_000)) : 0;
}

async function recordFailure(keys: string[]) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_MS);
  for (const key of keys) {
    try {
      let doc = await LoginAttempt.findOneAndUpdate({ key, firstAt: { $gte: windowStart } }, { $inc: { count: 1 } }, { returnDocument: "after" }).lean<LoginAttemptDoc>();
      if (!doc) {
        doc = await LoginAttempt.findOneAndUpdate({ key }, { $set: { count: 1, firstAt: now }, $unset: { lockedUntil: 1 } }, { upsert: true, returnDocument: "after" }).lean<LoginAttemptDoc>();
      }
      if (doc && doc.count >= MAX_FAILS && !doc.lockedUntil) {
        await LoginAttempt.updateOne({ key }, { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) } });
      }
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) console.error("[auth] could not record failed sign-in", e);
    }
  }
}

const clearFailures = (keys: string[]) => LoginAttempt.deleteMany({ key: { $in: keys } }).catch(() => undefined);
const lockMessage = (mins: number) => `Too many attempts. Try again in ${mins} ${mins === 1 ? "minute" : "minutes"}, or reset your password.`;

type LoginUser = { _id: mongoose.Types.ObjectId; name: string; email: string; role: string; passwordHash: string };

/** Shared by login and adminLogin: lock check, password compare, failure counting. */
async function checkCredentials(emailAddr: string, pass: string): Promise<{ user: LoginUser; keys: string[] } | { error: string }> {
  await db();
  const keys = await attemptKeys(emailAddr);
  const locked = await lockedMinutes(keys);
  if (locked) return { error: lockMessage(locked) };
  const user = await User.findOne({ email: emailAddr }).lean<LoginUser>();
  // Compare even when the user is missing so timing does not reveal which emails exist.
  const hash = user?.passwordHash ?? (await dummyHash());
  const match = await bcrypt.compare(pass, hash);
  if (!user || !match) {
    await recordFailure(keys);
    const nowLocked = await lockedMinutes(keys);
    return { error: nowLocked ? lockMessage(nowLocked) : GENERIC_LOGIN_ERROR };
  }
  return { user, keys };
}

const email = z.string().trim().toLowerCase().min(1, { message: "Enter your email address." }).max(160).email({ message: "Enter a valid email address." });
const password = z
  .string()
  .min(8, { message: "Use at least 8 characters." })
  .max(128, { message: "Use 128 characters or fewer." })
  .regex(/[A-Za-z]/, { message: "Include at least one letter." })
  .regex(/[0-9]/, { message: "Include at least one number." });
const name = z.string().trim().min(2, { message: "Enter your full name." }).max(80, { message: "Keep your name under 80 characters." });
const optionalPhone = z
  .string()
  .trim()
  .max(20)
  .refine((v) => v === "" || /^\+?[0-9\s-]{8,16}$/.test(v), { message: "Enter a valid mobile number." });

/* ---------- register / login / logout ---------- */

const RegisterSchema = z.object({
  name,
  email,
  phone: optionalPhone,
  password,
  ref: z
    .string()
    .trim()
    .toUpperCase()
    .max(24, { message: "That referral code is too long." })
    .refine((v) => v === "" || /^[A-Z0-9-]{3,24}$/.test(v), { message: "That referral code doesn't look right. Check it or leave it blank." }),
});

export async function register(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  if (!(await allow("register", 10, 3600))) return { ok: false, message: TOO_MANY };
  const values = {
    name: str(form, "name"),
    email: str(form, "email"),
    phone: str(form, "phone"),
    ref: str(form, "ref"),
    marketing: form.get("marketing") ? "on" : "",
    whatsapp: form.get("whatsapp") ? "on" : "",
  };
  const parsed = RegisterSchema.safeParse({ ...values, password: str(form, "password") });
  if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error), values };
  const d = parsed.data;

  await db();
  if (await User.exists({ email: d.email })) {
    return { ok: false, errors: { email: "An account with this email already exists. Sign in instead." }, values };
  }
  let user;
  try {
    user = await User.create({
      name: d.name,
      email: d.email,
      phone: d.phone,
      passwordHash: await bcrypt.hash(d.password, 10),
      role: "customer",
      marketingOptIn: values.marketing === "on",
      whatsappOptIn: values.whatsapp === "on",
    });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return { ok: false, errors: { email: "An account with this email already exists. Sign in instead." }, values };
    throw e;
  }
  if (d.ref) {
    try {
      await attachReferral(String(user._id), d.ref);
    } catch (e) {
      console.error("[auth] attachReferral failed", e);
    }
  }
  await createSession({ uid: String(user._id), name: user.name, email: user.email, role: "customer" });
  revalidatePath("/", "layout");
  redirect(safeNext(form.get("next")) ?? "/account");
}

const LoginSchema = z.object({ email, password: z.string().min(1, { message: "Enter your password." }).max(128) });

export async function login(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const values = { email: str(form, "email") };
  const parsed = LoginSchema.safeParse({ email: values.email, password: str(form, "password") });
  if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error), values };

  const res = await checkCredentials(parsed.data.email, parsed.data.password);
  if ("error" in res) return { ok: false, message: res.error, values };
  const { user, keys } = res;
  await clearFailures(keys);

  const role = isStaff(user.role) ? user.role : "customer";
  await createSession({ uid: String(user._id), name: user.name, email: user.email, role });
  revalidatePath("/", "layout");
  redirect(safeNext(form.get("next")) ?? (role !== "customer" ? "/admin" : "/account"));
}

/** Admin sign-in: same checks as login, but customer accounts are turned away without a session. */
export async function adminLogin(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const values = { email: str(form, "email") };
  const parsed = LoginSchema.safeParse({ email: values.email, password: str(form, "password") });
  if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error), values };

  const res = await checkCredentials(parsed.data.email, parsed.data.password);
  if ("error" in res) return { ok: false, message: res.error, values };
  const { user, keys } = res;
  await clearFailures(keys);
  if (!isStaff(user.role)) return { ok: false, message: "This account doesn't have admin access. Use the shop sign-in instead.", values };

  await createSession({ uid: String(user._id), name: user.name, email: user.email, role: user.role });
  revalidatePath("/", "layout");
  const next = safeNext(form.get("next"));
  redirect(next?.startsWith("/admin") ? next : "/admin");
}

export async function adminLogout() {
  await destroySession();
  revalidatePath("/", "layout");
  redirect("/admin/login");
}

export async function logout() {
  await destroySession();
  revalidatePath("/", "layout");
  redirect("/");
}

/* ---------- profile ---------- */

const ProfileSchema = z
  .object({
    name,
    phone: optionalPhone,
    bday: z.string().regex(/^(|[0-9]{1,2})$/),
    bmonth: z.string().regex(/^(|[0-9]{1,2})$/),
  })
  .superRefine((d, ctx) => {
    if (!d.bday && !d.bmonth) return;
    if (!d.bday || !d.bmonth) {
      ctx.addIssue({ code: "custom", path: [d.bday ? "bmonth" : "bday"], message: "Choose both the day and the month, or leave both blank." });
      return;
    }
    const day = Number(d.bday);
    const month = Number(d.bmonth);
    const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
    if (!max) ctx.addIssue({ code: "custom", path: ["bmonth"], message: "Choose a month." });
    else if (day < 1 || day > max) ctx.addIssue({ code: "custom", path: ["bday"], message: "That day isn't in the month you chose." });
  });

export async function updateProfile(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const s = await getSession();
  if (!s) return { ok: false, message: "Your session has ended. Please sign in again." };
  const values = {
    name: str(form, "name"),
    phone: str(form, "phone"),
    bday: str(form, "bday"),
    bmonth: str(form, "bmonth"),
    marketing: form.get("marketing") ? "on" : "",
    whatsapp: form.get("whatsapp") ? "on" : "",
  };
  const parsed = ProfileSchema.safeParse(values);
  if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error), values };
  const d = parsed.data;
  const birthday = d.bday && d.bmonth ? `${d.bmonth.padStart(2, "0")}-${d.bday.padStart(2, "0")}` : "";

  await db();
  const res = await User.updateOne(
    { _id: s.uid },
    { $set: { name: d.name, phone: d.phone, birthday, marketingOptIn: values.marketing === "on", whatsappOptIn: values.whatsapp === "on" } }
  );
  if (!res.matchedCount) return { ok: false, message: "We could not find your account. Please sign in again." };
  // Re-issue the session so the header greeting shows the new name.
  await createSession({ ...s, name: parsed.data.name });
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile updated.", values };
}

const PasswordSchema = z
  .object({ current: z.string().min(1, { message: "Enter your current password." }).max(128), next: password, confirm: z.string() })
  .refine((d) => d.next === d.confirm, { message: "Passwords do not match.", path: ["confirm"] })
  .refine((d) => d.next !== d.current, { message: "Choose a password you have not used here before.", path: ["next"] });

export async function changePassword(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const s = await getSession();
  if (!s) return { ok: false, message: "Your session has ended. Please sign in again." };
  const parsed = PasswordSchema.safeParse({ current: str(form, "current"), next: str(form, "next"), confirm: str(form, "confirm") });
  if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error) };

  await db();
  const user = await User.findById(s.uid, { passwordHash: 1 }).lean<{ passwordHash: string }>();
  if (!user) return { ok: false, message: "We could not find your account. Please sign in again." };
  if (!(await bcrypt.compare(parsed.data.current, user.passwordHash))) return { ok: false, errors: { current: "That is not your current password." } };

  await User.updateOne({ _id: s.uid }, { $set: { passwordHash: await bcrypt.hash(parsed.data.next, 10) } });
  return { ok: true, message: "Password changed. Use your new password next time you sign in." };
}

/* ---------- forgotten password ---------- */

const RESET_TTL_MS = 60 * 60 * 1000;
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const FORGOT_OK = "If there's an account with that email, we've sent a link to reset the password. It works for one hour. Check your spam folder if it hasn't arrived in a few minutes.";

/** Always answers the same way, so the form can't be used to find out which emails have accounts. */
export async function requestPasswordReset(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  if (!(await allow("reset", 5, 3600))) return { ok: false, message: TOO_MANY };
  const values = { email: str(form, "email") };
  const parsed = z.object({ email }).safeParse(values);
  if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error), values };

  await db();
  const user = await User.findOne({ email: parsed.data.email }, { name: 1, email: 1 }).lean<{ _id: mongoose.Types.ObjectId; name: string; email: string }>();
  if (user) {
    const uid = String(user._id);
    // Quietly limit to 3 links an hour per account.
    const recent = await PasswordReset.countDocuments({ userId: uid, createdAt: { $gte: new Date(Date.now() - RESET_TTL_MS) } });
    if (recent < 3) {
      const token = randomBytes(32).toString("base64url");
      await PasswordReset.create({ userId: uid, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) });
      const msg = passwordResetEmail(user.name, siteUrl(`/account/reset/${token}`));
      await sendEmail({ to: user.email, subject: msg.subject, html: msg.html, text: msg.text, template: "password_reset" });
    }
  } else {
    await dummyHash(); // similar timing either way
  }
  return { ok: true, message: FORGOT_OK, values: { email: "" } };
}

type ResetLookup = { reset: PasswordResetDoc; user: LoginUser } | null;

async function findReset(token: string): Promise<ResetLookup> {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  await db();
  const reset = await PasswordReset.findOne({ tokenHash: sha256(token) }).lean<PasswordResetDoc>();
  if (!reset || reset.usedAt || new Date(reset.expiresAt).getTime() < Date.now()) return null;
  const user = await User.findById(reset.userId).lean<LoginUser>();
  return user ? { reset, user } : null;
}

/** For the reset page: is this link still usable? */
export async function checkResetToken(token: string): Promise<boolean> {
  return !!(await findReset(token));
}

const ResetSchema = z.object({ password, confirm: z.string() }).refine((d) => d.password === d.confirm, { message: "Passwords do not match.", path: ["confirm"] });

export async function resetPassword(token: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const parsed = ResetSchema.safeParse({ password: str(form, "password"), confirm: str(form, "confirm") });
  if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error) };
  const found = await findReset(token);
  if (!found) return { ok: false, message: "This reset link has expired or has already been used. Ask for a new one below." };

  // Mark the token used first (atomically) so the link works exactly once.
  const claimed = await PasswordReset.updateOne({ _id: found.reset._id, usedAt: { $exists: false } }, { $set: { usedAt: new Date() } });
  if (!claimed.modifiedCount) return { ok: false, message: "This reset link has already been used. Ask for a new one below." };

  await User.updateOne({ _id: found.user._id }, { $set: { passwordHash: await bcrypt.hash(parsed.data.password, 10) } });
  // Any other outstanding links for this account stop working, and sign-in locks for the email are lifted.
  await PasswordReset.updateMany({ userId: String(found.user._id), usedAt: { $exists: false } }, { $set: { usedAt: new Date() } });
  await clearFailures([`email:${found.user.email}`]);

  const role = isStaff(found.user.role) ? found.user.role : "customer";
  await createSession({ uid: String(found.user._id), name: found.user.name, email: found.user.email, role });
  revalidatePath("/", "layout");
  redirect(role !== "customer" ? "/admin" : "/account?reset=1");
}

/* ---------- addresses ---------- */

const IN_STATES = REGION_CONFIG.in.states ?? [];

const AddressSchema = z
  .object({
    id: z.string().trim().max(40),
    region: z.string().refine(isRegion, { message: "Choose India or the United Kingdom." }),
    name,
    phone: z.string().trim().min(1, { message: "Enter a mobile number for the courier." }).max(20),
    line1: z.string().trim().min(3, { message: "Enter the first line of the address." }).max(120),
    line2: z.string().trim().max(120),
    city: z.string().trim().min(2, { message: "Enter the town or city." }).max(60),
    state: z.string().trim().max(60),
    postcode: z.string().trim().max(10),
    isDefault: z.boolean(),
  })
  .superRefine((d, ctx) => {
    if (!isRegion(d.region)) return;
    const cfg = REGION_CONFIG[d.region];
    if (!cfg.postPattern.test(d.postcode)) {
      ctx.addIssue({ code: "custom", path: ["postcode"], message: d.postcode ? `Enter a valid ${cfg.postLabel.toLowerCase()} (${cfg.postHint}).` : `Enter the ${cfg.postLabel.toLowerCase()}.` });
    }
    const digits = d.phone.replace(/[\s()-]/g, "");
    if (d.region === "in") {
      if (!IN_STATES.includes(d.state)) ctx.addIssue({ code: "custom", path: ["state"], message: "Choose a state." });
      if (!/^(\+91|0)?[6-9]\d{9}$/.test(digits)) ctx.addIssue({ code: "custom", path: ["phone"], message: "Enter a 10-digit Indian mobile number." });
    } else {
      if (!/^(\+44|0)\d{9,10}$/.test(digits)) ctx.addIssue({ code: "custom", path: ["phone"], message: "Enter a UK phone number, e.g. 07700 900123." });
    }
  });

function normalisePostcode(region: Region, v: string) {
  if (region === "in") return v.trim();
  const c = v.replace(/\s+/g, "").toUpperCase();
  return `${c.slice(0, -3)} ${c.slice(-3)}`;
}

type AddressLean = { _id: mongoose.Types.ObjectId; isDefault?: boolean };

export async function saveAddress(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const s = await getSession();
  if (!s) return { ok: false, message: "Your session has ended. Please sign in again." };
  const values = {
    id: str(form, "id"),
    region: str(form, "region"),
    name: str(form, "name"),
    phone: str(form, "phone"),
    line1: str(form, "line1"),
    line2: str(form, "line2"),
    city: str(form, "city"),
    state: str(form, "state"),
    postcode: str(form, "postcode"),
    isDefault: form.get("isDefault") ? "on" : "",
  };
  const parsed = AddressSchema.safeParse({ ...values, isDefault: values.isDefault === "on" });
  if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error), values };
  const d = parsed.data;
  const region = d.region as Region;
  const addr = {
    name: d.name,
    phone: d.phone,
    line1: d.line1,
    line2: d.line2,
    city: d.city,
    state: d.state,
    postcode: normalisePostcode(region, d.postcode),
    region,
  };

  await db();
  const user = await User.findById(s.uid, { addresses: 1 }).lean<{ addresses?: AddressLean[] }>();
  if (!user) return { ok: false, message: "We could not find your account. Please sign in again." };
  const list = user.addresses ?? [];

  let id: mongoose.Types.ObjectId;
  if (d.id) {
    if (!mongoose.isValidObjectId(d.id) || !list.some((a) => String(a._id) === d.id)) return { ok: false, message: "That address no longer exists.", values };
    id = new mongoose.Types.ObjectId(d.id);
    const set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(addr)) set[`addresses.$.${k}`] = v;
    await User.updateOne({ _id: s.uid, "addresses._id": id }, { $set: set });
  } else {
    if (list.length >= MAX_ADDRESSES) return { ok: false, message: `You can save up to ${MAX_ADDRESSES} addresses. Remove one to add another.`, values };
    id = new mongoose.Types.ObjectId();
    await User.updateOne({ _id: s.uid }, { $push: { addresses: { _id: id, ...addr, isDefault: false } } });
  }

  // The first address, or one ticked as default, becomes the default.
  const hasOtherDefault = list.some((a) => a.isDefault && String(a._id) !== String(id));
  if (d.isDefault || !hasOtherDefault) await markDefault(s.uid, id);

  revalidatePath("/account", "layout");
  revalidatePath("/checkout");
  return { ok: true, message: d.id ? "Address updated." : "Address saved." };
}

async function markDefault(uid: string, id: mongoose.Types.ObjectId) {
  await User.updateOne(
    { _id: uid },
    { $set: { "addresses.$[pick].isDefault": true, "addresses.$[rest].isDefault": false } },
    { arrayFilters: [{ "pick._id": id }, { "rest._id": { $ne: id } }] }
  );
}

export async function deleteAddress(id: string): Promise<ActionState> {
  const s = await getSession();
  if (!s) return { ok: false, message: "Your session has ended. Please sign in again." };
  if (!mongoose.isValidObjectId(id)) return { ok: false, message: "That address no longer exists." };
  await db();
  await User.updateOne({ _id: s.uid }, { $pull: { addresses: { _id: new mongoose.Types.ObjectId(id) } } });
  // Keep exactly one default while any address remains.
  const user = await User.findById(s.uid, { addresses: 1 }).lean<{ addresses?: AddressLean[] }>();
  const rest = user?.addresses ?? [];
  if (rest.length && !rest.some((a) => a.isDefault)) await markDefault(s.uid, rest[0]._id);
  revalidatePath("/account", "layout");
  revalidatePath("/checkout");
  return { ok: true, message: "Address removed." };
}

export async function setDefaultAddress(id: string): Promise<ActionState> {
  const s = await getSession();
  if (!s) return { ok: false, message: "Your session has ended. Please sign in again." };
  if (!mongoose.isValidObjectId(id)) return { ok: false, message: "That address no longer exists." };
  await db();
  const oid = new mongoose.Types.ObjectId(id);
  if (!(await User.exists({ _id: s.uid, "addresses._id": oid }))) return { ok: false, message: "That address no longer exists." };
  await markDefault(s.uid, oid);
  revalidatePath("/account", "layout");
  revalidatePath("/checkout");
  return { ok: true, message: "Default address updated." };
}
