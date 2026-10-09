"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { Booking } from "@/lib/models";
import { sendEmail, toE164 } from "@/lib/notify";
import { esc, renderEmail, siteUrl } from "@/lib/email-layout";
import { CONSULT_SLOTS, KIND_IDS, consultDates, kindLabel, whenLabel } from "@/app/(store)/consult/slots";

export type ConsultValues = { name: string; email: string; phone: string; region: "in" | "uk"; kind: string; date: string; slot: string; notes: string };
export type ConsultState =
  | { status: "idle" }
  | { status: "error"; message: string; fields: Partial<Record<keyof ConsultValues, string>>; values: ConsultValues }
  | { status: "ok"; name: string; email: string; when: string; kind: string };

const schema = z.object({
  name: z.string().trim().min(2, "Please tell us your name.").max(80, "Please shorten your name."),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  phone: z
    .string()
    .trim()
    .refine((p) => /^\+?[\d\s()-]{10,20}$/.test(p) && p.replace(/\D/g, "").length >= 10 && p.replace(/\D/g, "").length <= 15, "Enter a mobile number we can WhatsApp, e.g. 98765 43210 or 07700 900123."),
  region: z.enum(["in", "uk"]),
  kind: z.enum(KIND_IDS, "Choose what the consult is for."),
  date: z.string().refine((d) => consultDates().includes(d), "Choose a day from the list (Monday to Saturday, within 30 days)."),
  slot: z.enum(CONSULT_SLOTS, "Choose a time."),
  notes: z.string().trim().max(1000, "Please keep notes under 1,000 characters."),
});

const str = (form: FormData, k: string) => String(form.get(k) ?? "");

/** toE164, plus the shopper's country for the two shapes it can't tell apart on its own. */
function phoneFor(phone: string, region: "in" | "uk") {
  const d = phone.replace(/\D/g, "");
  if (!phone.trim().startsWith("+")) {
    if (region === "in" && d.length === 11 && /^0[6-9]/.test(d)) return `+91${d.slice(1)}`; // 098765 43210
    if (region === "uk" && d.length === 10 && d.startsWith("7")) return `+44${d}`; // 7700 900123
  }
  return toE164(phone, region);
}

/** Books a free video consult: saves a Booking (status "requested"), emails the shopper and the team. */
export async function requestConsult(_prev: ConsultState, form: FormData): Promise<ConsultState> {
  const values: ConsultValues = {
    name: str(form, "name").slice(0, 120),
    email: str(form, "email").slice(0, 200),
    phone: str(form, "phone").slice(0, 40),
    region: str(form, "region") === "uk" ? "uk" : "in",
    kind: str(form, "kind"),
    date: str(form, "date"),
    slot: str(form, "slot"),
    notes: str(form, "notes").slice(0, 2000),
  };

  // Honeypot: real shoppers never see this field. Pretend all went well.
  if (str(form, "website")) return { status: "ok", name: values.name, email: values.email, when: "", kind: "" };

  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const fields: Partial<Record<keyof ConsultValues, string>> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0] as keyof ConsultValues;
      fields[k] ??= issue.message;
    }
    return { status: "error", message: "Please check the highlighted details.", fields, values };
  }
  const v = parsed.data;
  const when = whenLabel(v.date, v.slot, v.region);
  const kind = kindLabel(v.kind);

  try {
    await db();
    const session = await getSession();

    // A double-tap or a reload re-sends the form: don't create a second request or email twice.
    const dupe = await Booking.exists({ email: v.email, date: v.date, slot: v.slot, status: { $in: ["requested", "confirmed"] } });
    if (dupe) return { status: "ok", name: v.name, email: v.email, when, kind };

    const recent = await Booking.countDocuments({ email: v.email, createdAt: { $gt: new Date(Date.now() - 24 * 3600_000) } });
    if (recent >= 5) {
      return { status: "error", message: "You've sent several requests today. We'll be in touch about them soon, or message us on WhatsApp.", fields: {}, values };
    }

    const booking = await Booking.create({
      name: v.name,
      email: v.email,
      phone: phoneFor(v.phone, v.region),
      region: v.region,
      kind: v.kind,
      date: v.date,
      slot: v.slot,
      notes: v.notes,
      status: "requested",
      userId: session?.uid,
    });
    const ref = `booking:${booking._id}`;

    const customer = renderEmail({
      preheader: `We've got your ${kind.toLowerCase()} consult request for ${when}.`,
      kicker: "Video consult",
      heading: "Request received",
      body:
        `<p>Dear ${esc(v.name)},</p>` +
        `<p>Thank you for booking a free ${esc(kind.toLowerCase())} consult with our stylists. You asked for:</p>` +
        `<p><b>${esc(when)}</b></p>` +
        `<p>We'll confirm within a working day (Monday to Saturday) by email and WhatsApp, with a video-call link. If that time is taken, we'll suggest the nearest one.</p>` +
        (v.notes ? `<p>Your notes: <i>${esc(v.notes)}</i></p>` : "") +
        `<p>Have photos of looks you love? Just reply to this email with them.</p>`,
      cta: { label: "Browse bridal", url: siteUrl("/c/bridal") },
      footnote: "Consults are free and last about 30 minutes. There's no obligation to buy.",
    });
    await sendEmail({ to: v.email, subject: "Your video consult request · House of Muddhugumma", html: customer.html, text: customer.text, template: "booking.requested", ref });

    const team = process.env.TEAM_EMAIL;
    if (team) {
      const t = renderEmail({
        preheader: `${v.name} asked for a ${kind.toLowerCase()} consult.`,
        kicker: "New consult request",
        heading: `${kind} · ${v.region === "uk" ? "UK" : "India"}`,
        body:
          `<p><b>${esc(when)}</b></p>` +
          `<p>${esc(v.name)}<br>${esc(v.email)}<br>${esc(phoneFor(v.phone, v.region))}</p>` +
          (v.notes ? `<p>Notes: ${esc(v.notes)}</p>` : "") +
          `<p>Please confirm within a working day.</p>`,
        cta: { label: "Open bookings", url: siteUrl("/admin/bookings") },
      });
      await sendEmail({ to: team, subject: `New consult: ${kind}, ${when}`, html: t.html, text: t.text, template: "booking.team", ref, replyTo: v.email });
    }

    return { status: "ok", name: v.name, email: v.email, when, kind };
  } catch (e) {
    console.error("[consult] booking failed", e);
    return { status: "error", message: "We couldn't save your request just now. Please try again, or message us on WhatsApp.", fields: {}, values };
  }
}
