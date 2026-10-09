"use server";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { staffCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { Booking, Review, type BookingDoc, type ReturnStatus } from "@/lib/models";
import { logActivity } from "@/lib/audit";
import { sendEmail } from "@/lib/notify";
import { esc, renderEmail, siteUrl } from "@/lib/email-layout";
import { updateReturnStatus, type ReturnExtras } from "@/lib/returns";
import { recalcProductRating } from "@/lib/reviews";
import { COURIERS } from "@/lib/shipping";
import { bookingInstant, fmtBookingTime, meetingPlatform, type Result } from "@/components/admin/content/shared";

/* Customer service actions: returns, review moderation, consult bookings. */

const DENIED: Result = { ok: false, error: "You don't have permission to do this." };
const validId = (id: unknown): id is string => typeof id === "string" && mongoose.isValidObjectId(id);

/* ---------- returns ---------- */
const RETURN_ACTIONS = ["approved", "rejected", "pickup_scheduled", "picked_up", "received", "refunded", "exchanged"] as const;

const ReturnActionSchema = z.object({
  number: z.string().trim().min(3).max(60),
  status: z.enum(RETURN_ACTIONS),
  note: z.string().trim().max(500).optional().default(""),
  courier: z.string().trim().max(40).optional().default(""),
  awb: z.string().trim().max(60).optional().default(""),
  pickupDate: z.string().trim().max(20).optional().default(""),
  refundAmount: z.number().min(0).max(10_000_000).optional(),
  refundMethod: z.enum(["original", "store_credit", "bank"]).optional(),
});
export type ReturnActionInput = z.input<typeof ReturnActionSchema>;

export async function returnAction(input: ReturnActionInput): Promise<Result> {
  const session = await staffCan("returns.manage");
  if (!session) return DENIED;
  const parsed = ReturnActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const v = parsed.data;

  const extras: ReturnExtras = { note: v.note || undefined };
  if (v.status === "rejected" && !v.note) return { ok: false, error: "Add a note telling the customer why the return was not approved.", fields: { note: "Required" } };
  if (v.status === "pickup_scheduled") {
    if (!COURIERS.some((c) => c.id === v.courier)) return { ok: false, error: "Choose the courier.", fields: { courier: "Required" } };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.pickupDate)) return { ok: false, error: "Choose the pickup date.", fields: { pickupDate: "Required" } };
    extras.pickup = { courier: v.courier, awb: v.awb, date: new Date(`${v.pickupDate}T12:00:00+05:30`) };
  }
  if (v.status === "refunded") {
    if (v.refundAmount === undefined || !(v.refundAmount > 0)) return { ok: false, error: "Enter the refund amount.", fields: { refundAmount: "Required" } };
    extras.refundAmount = Math.round(v.refundAmount * 100) / 100;
    extras.refundMethod = v.refundMethod ?? "original";
  }

  const res = await updateReturnStatus(v.number, v.status as ReturnStatus, { uid: session.uid, name: session.name }, extras);
  if (!res.ok) return { ok: false, error: res.error };
  await logActivity(session, "return.status", {
    target: v.number,
    meta: { to: v.status, note: v.note || undefined, refund: extras.refundAmount, method: extras.refundMethod, courier: extras.pickup?.courier, awb: extras.pickup?.awb || undefined },
  });
  revalidatePath("/admin/returns", "layout");
  revalidatePath("/account", "layout");
  return { ok: true, message: res.message || "Return updated." };
}

/* ---------- reviews ---------- */
export async function moderateReviews(ids: string[], status: "approved" | "rejected" | "pending"): Promise<Result> {
  const session = await staffCan("reviews.manage");
  if (!session) return DENIED;
  if (!["approved", "rejected", "pending"].includes(status)) return { ok: false, error: "Unknown status." };
  const clean = [...new Set((Array.isArray(ids) ? ids : []).filter(validId))].slice(0, 200);
  if (!clean.length) return { ok: false, error: "Select at least one review." };
  await db();
  const rows = await Review.find({ _id: { $in: clean } }, { productSlug: 1 }).lean<{ _id: mongoose.Types.ObjectId; productSlug: string }[]>();
  if (!rows.length) return { ok: false, error: "These reviews no longer exist." };
  await Review.updateMany({ _id: { $in: rows.map((r) => r._id) } }, { $set: { status } });
  const slugs = [...new Set(rows.map((r) => r.productSlug).filter(Boolean))];
  for (const slug of slugs) {
    try {
      await recalcProductRating(slug);
    } catch (e) {
      console.error("[reviews] recalcProductRating failed", slug, e);
    }
    revalidatePath(`/p/${slug}`);
  }
  await logActivity(session, "review.moderate", {
    target: rows.length === 1 ? `Review on ${slugs[0]}` : `${rows.length} reviews`,
    targetId: rows.length === 1 ? String(rows[0]._id) : undefined,
    meta: { to: status, count: rows.length, products: slugs.join(", ").slice(0, 300) },
  });
  revalidatePath("/admin/reviews");
  const verb = status === "approved" ? "approved" : status === "rejected" ? "rejected" : "moved back to pending";
  return { ok: true, message: `${rows.length} review${rows.length === 1 ? "" : "s"} ${verb}.` };
}

/* ---------- consult bookings ---------- */
const KIND_LABEL: Record<string, string> = { bridal: "bridal consultation", trousseau: "trousseau consultation", festive: "festive styling call", styling: "styling call" };

type LeanBooking = Pick<BookingDoc, "name" | "email" | "phone" | "region" | "kind" | "date" | "slot" | "status" | "meetingLink" | "notes"> & { _id: mongoose.Types.ObjectId };

const LinkSchema = z
  .string()
  .trim()
  .max(500)
  .url("Paste the full meeting link, starting with https://")
  .refine((u) => u.startsWith("https://"), "The meeting link must start with https://");

export async function confirmBooking(id: string, meetingLink: string): Promise<Result> {
  const session = await staffCan("bookings.manage");
  if (!session) return DENIED;
  if (!validId(id)) return { ok: false, error: "Unknown booking." };
  const link = LinkSchema.safeParse(meetingLink);
  if (!link.success) return { ok: false, error: link.error.issues[0]?.message ?? "Check the link.", fields: { link: "Invalid link" } };
  await db();
  const b = await Booking.findById(id).lean<LeanBooking>();
  if (!b) return { ok: false, error: "This booking no longer exists." };
  if (b.status === "cancelled" || b.status === "done") return { ok: false, error: `This booking is already ${b.status}.` };
  const relink = b.status === "confirmed";
  await Booking.updateOne({ _id: b._id }, { $set: { status: "confirmed", meetingLink: link.data } });

  const region = b.region === "uk" ? "uk" : "in";
  const when = fmtBookingTime(bookingInstant(b.date, b.slot), region);
  const platform = meetingPlatform(link.data);
  const kind = KIND_LABEL[b.kind] ?? "consultation";
  const first = (b.name || "there").split(" ")[0];
  const mail = renderEmail({
    preheader: `Your ${kind} is confirmed for ${when}.`,
    kicker: relink ? "Updated meeting link" : "Booking confirmed",
    heading: relink ? "Your new meeting link" : "See you soon",
    body:
      `<p>Hello ${esc(first)},</p>` +
      `<p>Your ${esc(kind)} with House of Muddhugumma is ${relink ? "still on, with a new link" : "confirmed"}.</p>` +
      `<p><b>When:</b> ${esc(when)}<br><b>How:</b> ${esc(platform)}<br><b>Link:</b> <a href="${esc(link.data)}">${esc(link.data)}</a></p>` +
      `<p>Join from a quiet spot with good light so we can show you fabrics and drapes properly. If you have reference photos or a colour palette in mind, keep them handy.</p>`,
    cta: { label: "Join the call", url: link.data },
    footnote: "Need to change the time? Reply to this email and we'll find another slot.",
  });
  await sendEmail({ to: b.email, subject: `Confirmed: your ${kind} on ${when}`, html: mail.html, text: mail.text, template: relink ? "booking.relinked" : "booking.confirmed", ref: String(b._id) });
  await logActivity(session, "booking.confirm", { target: `${b.name} · ${b.date} ${b.slot}`, targetId: id, meta: { link: link.data, platform } });
  revalidatePath("/admin/bookings");
  return { ok: true, message: `${relink ? "Link updated" : "Booking confirmed"} and ${b.email} emailed.` };
}

export async function setBookingStatus(id: string, status: "done" | "cancelled", reason = ""): Promise<Result> {
  const session = await staffCan("bookings.manage");
  if (!session) return DENIED;
  if (!validId(id)) return { ok: false, error: "Unknown booking." };
  if (status !== "done" && status !== "cancelled") return { ok: false, error: "Unknown status." };
  const note = String(reason ?? "").trim().slice(0, 500);
  await db();
  const b = await Booking.findById(id).lean<LeanBooking>();
  if (!b) return { ok: false, error: "This booking no longer exists." };
  if (b.status === status) return { ok: false, error: `This booking is already ${status}.` };
  if (b.status === "cancelled") return { ok: false, error: "This booking was cancelled." };
  await Booking.updateOne({ _id: b._id }, { $set: { status, ...(note ? { notes: [b.notes, `Staff: ${note}`].filter(Boolean).join("\n") } : {}) } });

  if (status === "cancelled") {
    const region = b.region === "uk" ? "uk" : "in";
    const when = fmtBookingTime(bookingInstant(b.date, b.slot), region);
    const kind = KIND_LABEL[b.kind] ?? "consultation";
    const mail = renderEmail({
      preheader: `Your ${kind} on ${when} has been cancelled.`,
      kicker: "Booking cancelled",
      heading: "Your call is cancelled",
      body:
        `<p>Hello ${esc((b.name || "there").split(" ")[0])},</p>` +
        `<p>We've cancelled your ${esc(kind)} planned for <b>${esc(when)}</b>.</p>` +
        (note ? `<p><b>Note from our team:</b> ${esc(note)}</p>` : "") +
        `<p>We'd love to speak another time. Book a new slot whenever suits you, or reply to this email and we'll arrange one for you.</p>`,
      cta: { label: "Book another time", url: siteUrl("/contact") },
    });
    await sendEmail({ to: b.email, subject: `Cancelled: your ${kind} on ${when}`, html: mail.html, text: mail.text, template: "booking.cancelled", ref: String(b._id) });
  }
  await logActivity(session, `booking.${status}`, { target: `${b.name} · ${b.date} ${b.slot}`, targetId: id, meta: { reason: note || undefined } });
  revalidatePath("/admin/bookings");
  return { ok: true, message: status === "done" ? "Marked as done." : `Booking cancelled and ${b.email} emailed.` };
}
