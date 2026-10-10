"use server";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { staffCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/audit";
import { sendEmail } from "@/lib/notify";
import { esc, renderEmail, siteUrl } from "@/lib/email-layout";
import { User } from "@/lib/models";
import { ROLE_LABEL, STAFF_ROLES, isStaff, type StaffRole } from "@/lib/permissions";

export type StaffResult = { ok: true; message: string } | { ok: false; error: string; fields?: Record<string, string> };

const NO = { ok: false as const, error: "Only the store owner can manage staff." };

const AddSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(160),
  name: z.string().trim().max(80),
  role: z.enum(STAFF_ROLES, { message: "Choose a role" }),
  password: z.string().max(200),
});

async function adminCount() {
  return User.countDocuments({ role: "admin" });
}

async function notifyAccess(to: string, name: string, role: StaffRole, isNew: boolean) {
  const { html, text } = renderEmail({
    preheader: `You now have ${ROLE_LABEL[role]} access to the House of Muddhugumma admin.`,
    kicker: "Admin access",
    heading: `Welcome to the team, ${name.split(" ")[0] || "there"}`,
    body:
      `<p>You've been given <b>${esc(ROLE_LABEL[role])}</b> access to the store admin.</p>` +
      (isNew
        ? `<p>Sign in with this email address and the temporary password the owner gave you, then change it from your account.</p>`
        : `<p>Sign in with your usual account password.</p>`),
    cta: { label: "Open the admin", url: siteUrl("/admin/login") },
    footnote: "If you weren't expecting this, reply to let us know.",
  });
  await sendEmail({ to, subject: "Your House of Muddhugumma admin access", html, text, template: "staff-access" });
}

/** Adds a team member: promotes an existing customer account, or creates a new account with a temporary password. */
export async function addStaff(input: z.input<typeof AddSchema>): Promise<StaffResult> {
  const me = await staffCan("staff.manage");
  if (!me) return NO;
  const parsed = AddSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[String(i.path[0])] ??= i.message;
    return { ok: false, error: Object.values(fields)[0] ?? "Check the form.", fields };
  }
  const v = parsed.data;
  await db();
  const existing = await User.findOne({ email: v.email }, { name: 1, role: 1 }).lean<{ _id: mongoose.Types.ObjectId; name: string; role: string }>();
  if (existing) {
    if (isStaff(existing.role)) return { ok: false, error: `${existing.name} is already on the team as ${ROLE_LABEL[existing.role]}. Change their role in the list below.`, fields: { email: "Already staff" } };
    await User.updateOne({ _id: existing._id }, { $set: { role: v.role } });
    await logActivity(me, "staff.promote", { target: v.email, targetId: String(existing._id), meta: { role: v.role } });
    await notifyAccess(v.email, existing.name, v.role, false);
    revalidatePath("/admin/staff");
    return { ok: true, message: `${existing.name} (existing customer account) is now ${ROLE_LABEL[v.role]}. They sign in with their own password.` };
  }
  if (v.name.length < 2) return { ok: false, error: "Enter their name to create a new account.", fields: { name: "Enter a name" } };
  if (v.password.length < 10) return { ok: false, error: "Use a temporary password of at least 10 characters.", fields: { password: "At least 10 characters" } };
  const created = await User.create({ name: v.name, email: v.email, role: v.role, passwordHash: await bcrypt.hash(v.password, 10) });
  await logActivity(me, "staff.create", { target: v.email, targetId: String(created._id), meta: { role: v.role } });
  await notifyAccess(v.email, v.name, v.role, true);
  revalidatePath("/admin/staff");
  return { ok: true, message: `Account created for ${v.name} as ${ROLE_LABEL[v.role]}. Share the temporary password with them in person or by phone, not by email.` };
}

export async function changeStaffRole(userId: string, role: string): Promise<StaffResult> {
  const me = await staffCan("staff.manage");
  if (!me) return NO;
  if (!mongoose.isValidObjectId(userId)) return { ok: false, error: "Unknown team member." };
  if (!isStaff(role)) return { ok: false, error: "Choose a role." };
  if (userId === me.uid) return { ok: false, error: "You can't change your own role. Ask another admin." };
  await db();
  const u = await User.findById(userId, { name: 1, email: 1, role: 1 }).lean<{ name: string; email: string; role: string }>();
  if (!u || !isStaff(u.role)) return { ok: false, error: "That person isn't on the team any more." };
  if (u.role === role) return { ok: true, message: `${u.name} is already ${ROLE_LABEL[role]}.` };
  if (u.role === "admin" && (await adminCount()) <= 1) return { ok: false, error: "This is the last admin. Make someone else an admin first." };
  // Guard against a race with another change: only update if the role is still what we read.
  const res = await User.updateOne({ _id: userId, role: u.role }, { $set: { role } });
  if (!res.modifiedCount) return { ok: false, error: "Someone else just changed this person. Reload and try again." };
  await logActivity(me, "staff.role", { target: u.email, targetId: userId, meta: { from: u.role, to: role } });
  revalidatePath("/admin/staff");
  return { ok: true, message: `${u.name} is now ${ROLE_LABEL[role]}.` };
}

/** Takes someone off the team. Their account stays as an ordinary customer account. */
export async function removeStaff(userId: string): Promise<StaffResult> {
  const me = await staffCan("staff.manage");
  if (!me) return NO;
  if (!mongoose.isValidObjectId(userId)) return { ok: false, error: "Unknown team member." };
  if (userId === me.uid) return { ok: false, error: "You can't remove yourself. Ask another admin." };
  await db();
  const u = await User.findById(userId, { name: 1, email: 1, role: 1 }).lean<{ name: string; email: string; role: string }>();
  if (!u || !isStaff(u.role)) return { ok: false, error: "That person isn't on the team any more." };
  if (u.role === "admin" && (await adminCount()) <= 1) return { ok: false, error: "This is the last admin and can't be removed." };
  const res = await User.updateOne({ _id: userId, role: u.role }, { $set: { role: "customer" } });
  if (!res.modifiedCount) return { ok: false, error: "Someone else just changed this person. Reload and try again." };
  await logActivity(me, "staff.remove", { target: u.email, targetId: userId, meta: { from: u.role } });
  revalidatePath("/admin/staff");
  return { ok: true, message: `${u.name} has been removed from the team. Their customer account and orders are kept.` };
}

/** Limits a team member's admin to one country ("in" / "uk"), or lets them see both (""). Admins always see both. */
export async function setStaffStoreLock(userId: string, lock: string): Promise<StaffResult> {
  const me = await staffCan("staff.manage");
  if (!me) return NO;
  if (!mongoose.isValidObjectId(userId)) return { ok: false, error: "Unknown team member." };
  if (lock !== "" && lock !== "in" && lock !== "uk") return { ok: false, error: "Choose India, UK or both." };
  await db();
  const u = await User.findById(userId, { name: 1, email: 1, role: 1 }).lean<{ name: string; email: string; role: string }>();
  if (!u || !isStaff(u.role)) return { ok: false, error: "That person isn't on the team any more." };
  if (u.role === "admin" && lock) return { ok: false, error: "Admins always see both stores. Change their role first." };
  await User.updateOne({ _id: userId }, { $set: { storeLock: lock } });
  await logActivity(me, "staff.store", { target: u.email, targetId: userId, meta: { store: lock || "both" } });
  revalidatePath("/admin/staff");
  return { ok: true, message: lock ? `${u.name} now only sees the ${lock === "uk" ? "UK" : "India"} store.` : `${u.name} can see both stores.` };
}
