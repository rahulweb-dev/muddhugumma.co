"use server";
import { randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { Enquiry } from "@/lib/models";
import { sendEmail } from "@/lib/notify";
import { esc, renderEmail, siteUrl } from "@/lib/email-layout";
import { getSettings } from "@/lib/settings";
import { REGION_COOKIE } from "@/lib/region";
import { CONTACT_TOPICS } from "@/lib/contact";
import { TOO_MANY, allow } from "@/lib/rate-limit";

export type ContactState = { ok: boolean; message?: string; number?: string; errors?: Record<string, string>; values?: Record<string, string> };

const Schema = z.object({
  name: z.string().trim().min(2, { message: "Please enter your name." }).max(80),
  email: z.string().trim().toLowerCase().email({ message: "Enter a valid email so we can reply." }).max(160),
  phone: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === "" || /^\+?[0-9\s-]{8,16}$/.test(v), { message: "Enter a valid phone number, or leave it empty." }),
  topic: z.enum(CONTACT_TOPICS, { message: "Choose what your message is about." }),
  orderNumber: z.string().trim().toUpperCase().max(30).refine((v) => v === "" || /^[A-Z0-9-]{6,30}$/.test(v), { message: "That doesn't look like an order number (e.g. MG261009AB12)." }),
  message: z.string().trim().min(10, { message: "Tell us a little more (at least 10 characters)." }).max(2000, { message: "Please keep it under 2,000 characters." }),
});

export async function sendContactMessage(_prev: ContactState, form: FormData): Promise<ContactState> {
  const raw = Object.fromEntries(["name", "email", "phone", "topic", "orderNumber", "message"].map((k) => [k, String(form.get(k) ?? "")]));
  // Bots fill the hidden "website" field; pretend success so they don't retry.
  if (String(form.get("website") ?? "")) return { ok: true, message: "Thank you, we'll be in touch." };
  if (!(await allow("contact", 5, 3600))) return { ok: false, message: TOO_MANY };

  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { ok: false, errors, values: raw };
  }
  const d = parsed.data;
  await db();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if ((await Enquiry.countDocuments({ email: d.email, createdAt: { $gte: since } })) >= 5) {
    return { ok: false, message: "You've sent several messages today. We'll reply to those first; for anything urgent, message us on WhatsApp.", values: raw };
  }

  const session = await getSession();
  const region = (await cookies()).get(REGION_COOKIE)?.value === "uk" ? "uk" : "in";
  const now = new Date();
  const day = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const number = `EQ-${day}-${randomInt(1000, 10000)}`;

  await Enquiry.create({ number, ...d, region, userId: session?.uid ?? "", status: "open" });

  const settings = await getSettings();
  const first = d.name.split(/\s+/)[0];
  const quoted = esc(d.message).replace(/\n/g, "<br>");
  const toCustomer = renderEmail({
    preheader: `We've got your message (${number}) and will reply within one working day.`,
    kicker: `Reference ${number}`,
    heading: "We've got your message",
    body: `<p>Hi ${esc(first)},</p><p>Thank you for writing to us about <b>${esc(d.topic.toLowerCase())}</b>${d.orderNumber ? ` (order ${esc(d.orderNumber)})` : ""}. A real person from our Hyderabad studio will reply within one working day, usually sooner.</p><p style="color:#6E6962;border-left:2px solid #E3DDD3;padding-left:12px">${quoted}</p>`,
    cta: d.orderNumber ? { label: "Track your order", url: siteUrl(`/track?order=${encodeURIComponent(d.orderNumber)}`) } : { label: "Visit the help centre", url: siteUrl("/help/faq") },
  });
  await sendEmail({ to: d.email, subject: `We've got your message · ${number}`, html: toCustomer.html, text: toCustomer.text, template: "contact.received", ref: number, replyTo: settings.supportEmail });

  const team = process.env.TEAM_EMAIL;
  if (team) {
    const alert = renderEmail({
      preheader: `${d.topic} from ${d.name}`,
      kicker: `New message · ${region === "uk" ? "UK" : "India"}`,
      heading: d.topic,
      body: `<p><b>${esc(d.name)}</b> · ${esc(d.email)}${d.phone ? ` · ${esc(d.phone)}` : ""}${d.orderNumber ? `<br>Order ${esc(d.orderNumber)}` : ""}</p><p>${quoted}</p>`,
      cta: { label: "Open in admin", url: siteUrl("/admin/enquiries") },
    });
    await sendEmail({ to: team, subject: `[${number}] ${d.topic} · ${d.name}`, html: alert.html, text: alert.text, template: "contact.team", ref: number, replyTo: d.email });
  }

  return { ok: true, number, message: `Thanks, ${first}. Your reference is ${number}. We'll reply to ${d.email} within one working day.` };
}
