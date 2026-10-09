"use server";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { staffCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { Enquiry, type EnquiryDoc } from "@/lib/models";
import { sendEmail } from "@/lib/notify";
import { esc, renderEmail, siteUrl } from "@/lib/email-layout";
import { getSettings } from "@/lib/settings";
import { logActivity } from "@/lib/audit";

export type EnquiryResult = { ok: true; message: string } | { ok: false; error: string };

/** Emails a reply to the customer, keeps it on the enquiry and marks it replied. */
export async function replyToEnquiry(id: string, body: string): Promise<EnquiryResult> {
  const staff = await staffCan("enquiries.manage");
  if (!staff) return { ok: false, error: "You don't have access to customer messages." };
  if (!mongoose.isValidObjectId(id)) return { ok: false, error: "Unknown message." };
  const text = String(body ?? "").trim();
  if (text.length < 5) return { ok: false, error: "Write a reply first." };
  if (text.length > 4000) return { ok: false, error: "Keep the reply under 4,000 characters." };
  await db();
  const q = await Enquiry.findById(id).lean<EnquiryDoc>();
  if (!q) return { ok: false, error: "Message not found." };

  const settings = await getSettings();
  const first = (q.name ?? "").split(/\s+/)[0] || "there";
  const mail = renderEmail({
    preheader: `Reply to your message ${q.number}`,
    kicker: `Reference ${q.number}`,
    heading: `Re: ${q.topic}`,
    body: `<p>Hi ${esc(first)},</p><p>${esc(text).replace(/\n/g, "<br>")}</p><p>Warm regards,<br>${esc(staff.name.split(/\s+/)[0])} · House of Muddhugumma</p><p style="color:#6E6962;border-left:2px solid #E3DDD3;padding-left:12px;font-size:13px">You wrote: ${esc(q.message).replace(/\n/g, "<br>")}</p>`,
    cta: q.orderNumber ? { label: "Track your order", url: siteUrl(`/track?order=${encodeURIComponent(q.orderNumber)}`) } : undefined,
  });
  const sent = await sendEmail({ to: q.email, subject: `Re: ${q.topic} · ${q.number}`, html: mail.html, text: mail.text, template: "contact.reply", ref: q.number, replyTo: settings.supportEmail });
  if (!sent.ok) return { ok: false, error: `The email couldn't be sent (${sent.error ?? "provider error"}). Nothing was saved; try again.` };

  await Enquiry.updateOne({ _id: id }, { $push: { replies: { by: staff.name, body: text, at: new Date() } }, $set: { status: "replied" } });
  await logActivity(staff, "enquiry.reply", { target: q.number, targetId: id });
  revalidatePath("/admin/enquiries");
  revalidatePath("/admin", "layout");
  return { ok: true, message: sent.status === "logged" ? "Reply saved. Email is in test mode, so it's in Admin → Messages instead of being sent." : `Reply sent to ${q.email}.` };
}

export async function setEnquiryStatus(id: string, status: "open" | "replied" | "closed"): Promise<EnquiryResult> {
  const staff = await staffCan("enquiries.manage");
  if (!staff) return { ok: false, error: "You don't have access to customer messages." };
  if (!mongoose.isValidObjectId(id) || !["open", "replied", "closed"].includes(status)) return { ok: false, error: "Unknown message or status." };
  await db();
  const q = await Enquiry.findByIdAndUpdate(id, { $set: { status } }, { projection: { number: 1 } }).lean<{ number: string }>();
  if (!q) return { ok: false, error: "Message not found." };
  await logActivity(staff, "enquiry.status", { target: q.number, targetId: id, meta: { to: status } });
  revalidatePath("/admin/enquiries");
  revalidatePath("/admin", "layout");
  return { ok: true, message: status === "closed" ? "Marked done." : status === "open" ? "Reopened." : "Marked replied." };
}
