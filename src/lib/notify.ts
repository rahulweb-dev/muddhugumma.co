import "server-only";
import { db } from "./db";
import { Outbox } from "./models";

/*
 * Customer messaging. Every message is written to the Outbox collection (visible in Admin → Messages).
 * Providers switch on when their env vars are set; otherwise the message is only logged ("test mode").
 *   Email:    RESEND_API_KEY, EMAIL_FROM ("House of Muddhugumma <orders@muddhugumma.com>")
 *   WhatsApp: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID (Meta WhatsApp Cloud API; business-initiated messages need approved templates)
 *   SMS:      TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
 * Senders never throw: a failed message must not fail the order or action that triggered it.
 */

export type SendResult = { ok: boolean; status: "sent" | "failed" | "logged"; error?: string };

async function record(entry: { channel: "email" | "whatsapp" | "sms"; to: string; subject?: string; template?: string; body?: string; ref?: string }, res: SendResult, provider: string) {
  try {
    await db();
    await Outbox.create({ ...entry, status: res.status, provider, error: res.error ?? "" });
  } catch (e) {
    console.error("[notify] could not write outbox", e);
  }
}

/**
 * E.164 phone number. An explicit country code (+…, 91…, 44…) wins; otherwise the region decides,
 * because a leading 0 is a trunk prefix in both countries (098765 43210 is Indian, 07700 900123 is British).
 */
export function toE164(phone: string, region: "in" | "uk" = "in"): string {
  const raw = phone.trim();
  const d = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return `+${d}`;
  if (raw.startsWith("00")) return `+${d.slice(2)}`;
  if (d.length === 12 && d.startsWith("91")) return `+${d}`;
  if (d.length === 12 && d.startsWith("44")) return `+${d}`;
  const local = d.replace(/^0+/, "");
  // A 10-digit 6/8/9… number without a trunk 0 can't be British (UK mobiles are 7…), so it's an Indian mobile.
  if (region === "uk" && d === local && /^[689]\d{9}$/.test(local)) return `+91${local}`;
  return region === "uk" ? `+44${local}` : `+91${local.slice(-10)}`;
}

/* ---------- email ---------- */
export async function sendEmail(msg: { to: string; subject: string; html: string; text?: string; template: string; ref?: string; replyTo?: string }): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "House of Muddhugumma <onboarding@resend.dev>";
  let res: SendResult = { ok: true, status: "logged" };
  if (key) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, reply_to: msg.replyTo }),
      });
      res = r.ok ? { ok: true, status: "sent" } : { ok: false, status: "failed", error: `${r.status} ${(await r.text()).slice(0, 300)}` };
    } catch (e) {
      res = { ok: false, status: "failed", error: String(e).slice(0, 300) };
    }
  } else if (process.env.NODE_ENV !== "production") {
    console.info(`[notify:email:test] to=${msg.to} subject="${msg.subject}" template=${msg.template}`);
  }
  await record({ channel: "email", to: msg.to, subject: msg.subject, template: msg.template, body: msg.html, ref: msg.ref }, res, key ? "resend" : "test");
  return res;
}

/* ---------- WhatsApp ---------- */
export async function sendWhatsApp(msg: {
  to: string;
  region?: "in" | "uk";
  /** Approved template name and its body parameters, used when the provider is configured. */
  template: string;
  params?: string[];
  language?: string;
  /** Readable text for the outbox (and test mode). */
  preview: string;
  ref?: string;
}): Promise<SendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const to = toE164(msg.to, msg.region);
  let res: SendResult = { ok: true, status: "logged" };
  if (token && phoneId) {
    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to.replace("+", ""),
          type: "template",
          template: {
            name: msg.template,
            language: { code: msg.language ?? "en" },
            components: msg.params?.length ? [{ type: "body", parameters: msg.params.map((t) => ({ type: "text", text: t })) }] : [],
          },
        }),
      });
      res = r.ok ? { ok: true, status: "sent" } : { ok: false, status: "failed", error: `${r.status} ${(await r.text()).slice(0, 300)}` };
    } catch (e) {
      res = { ok: false, status: "failed", error: String(e).slice(0, 300) };
    }
  } else if (process.env.NODE_ENV !== "production") {
    console.info(`[notify:whatsapp:test] to=${to} ${msg.preview}`);
  }
  await record({ channel: "whatsapp", to, template: msg.template, body: msg.preview, ref: msg.ref }, res, token ? "meta" : "test");
  return res;
}

/* ---------- SMS ---------- */
export async function sendSms(msg: { to: string; region?: "in" | "uk"; text: string; template: string; ref?: string }): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const to = toE164(msg.to, msg.region);
  let res: SendResult = { ok: true, status: "logged" };
  if (sid && auth && from) {
    try {
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: { Authorization: "Basic " + Buffer.from(`${sid}:${auth}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: to, From: from, Body: msg.text }),
      });
      res = r.ok ? { ok: true, status: "sent" } : { ok: false, status: "failed", error: `${r.status} ${(await r.text()).slice(0, 300)}` };
    } catch (e) {
      res = { ok: false, status: "failed", error: String(e).slice(0, 300) };
    }
  } else if (process.env.NODE_ENV !== "production") {
    console.info(`[notify:sms:test] to=${to} ${msg.text}`);
  }
  await record({ channel: "sms", to, template: msg.template, body: msg.text, ref: msg.ref }, res, sid ? "twilio" : "test");
  return res;
}

export const messagingMode = () => ({
  email: process.env.RESEND_API_KEY ? "live" : "test",
  whatsapp: process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID ? "live" : "test",
  sms: process.env.TWILIO_ACCOUNT_SID ? "live" : "test",
});
