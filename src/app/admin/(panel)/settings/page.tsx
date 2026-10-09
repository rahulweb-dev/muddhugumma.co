import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { messagingMode } from "@/lib/notify";
import { SettingsForm } from "@/components/admin/SettingsForm";

export const metadata: Metadata = { title: "Settings" };

type State = "live" | "test" | "partial" | "off";
type Integration = { name: string; state: State; note: string };

const set = (...keys: string[]) => keys.every((k) => !!process.env[k]);
const some = (...keys: string[]) => keys.some((k) => !!process.env[k]);

/** Live/test status of each integration from env presence only. Never reads out a secret's value. */
function integrations(): Integration[] {
  const mm = messagingMode();
  const rzpKey = process.env.RAZORPAY_KEY_ID ?? "";
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
  const missing = (...keys: string[]) => keys.filter((k) => !process.env[k]).join(", ");

  const imagekit: Integration = set("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT", "NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY", "IMAGEKIT_PRIVATE_KEY")
    ? { name: "ImageKit images", state: "live", note: "Images served and uploaded through ImageKit." }
    : some("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT", "NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY", "IMAGEKIT_PRIVATE_KEY")
      ? { name: "ImageKit images", state: "partial", note: `Missing ${missing("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT", "NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY", "IMAGEKIT_PRIVATE_KEY")}.` }
      : { name: "ImageKit images", state: "off", note: "Images load from /public/img and admin uploads are off." };

  const razorpay: Integration = set("RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET")
    ? {
        name: "Razorpay (India payments)",
        state: rzpKey.startsWith("rzp_live_") ? "live" : "test",
        note: `${rzpKey.startsWith("rzp_live_") ? "Live keys" : "Test keys (rzp_test_)"}.${process.env.RAZORPAY_WEBHOOK_SECRET ? "" : " Webhook secret missing: payments confirm only on the return page."}`,
      }
    : { name: "Razorpay (India payments)", state: "test", note: "No keys: India online payments are simulated." };

  const stripe: Integration = stripeKey
    ? {
        name: "Stripe (UK payments)",
        state: stripeKey.startsWith("sk_live_") || stripeKey.startsWith("rk_live_") ? "live" : "test",
        note: `${stripeKey.includes("_live_") ? "Live key" : "Test key"}.${process.env.STRIPE_WEBHOOK_SECRET ? "" : " Webhook secret missing."}`,
      }
    : { name: "Stripe (UK payments)", state: "test", note: "No key: UK card payments are simulated." };

  return [
    imagekit,
    razorpay,
    stripe,
    {
      name: "Email (Resend)",
      state: mm.email === "live" ? "live" : "test",
      note: mm.email === "live" ? `Sending from ${process.env.EMAIL_FROM ? "EMAIL_FROM" : "Resend's test sender (set EMAIL_FROM)"}.` : "Emails are only logged in Messages.",
    },
    { name: "WhatsApp (Meta Cloud API)", state: mm.whatsapp === "live" ? "live" : "test", note: mm.whatsapp === "live" ? "Templates must be approved in Meta Business Manager." : "WhatsApp messages are only logged." },
    {
      name: "SMS (Twilio)",
      state: mm.sms === "live" ? (set("TWILIO_AUTH_TOKEN", "TWILIO_FROM") ? "live" : "partial") : "test",
      note: mm.sms === "live" ? (set("TWILIO_AUTH_TOKEN", "TWILIO_FROM") ? "COD and login codes go by SMS." : `Missing ${missing("TWILIO_AUTH_TOKEN", "TWILIO_FROM")}.`) : "Codes are logged (and shown in development).",
    },
    { name: "Google Analytics", state: set("NEXT_PUBLIC_GA_ID") ? "live" : "off", note: set("NEXT_PUBLIC_GA_ID") ? "Loads after the shopper accepts analytics cookies." : "Not set." },
    { name: "Meta Pixel", state: set("NEXT_PUBLIC_META_PIXEL_ID") ? "live" : "off", note: set("NEXT_PUBLIC_META_PIXEL_ID") ? "Loads after the shopper accepts marketing cookies." : "Not set." },
    { name: "Scheduled jobs (CRON_SECRET)", state: set("CRON_SECRET") ? "live" : "off", note: set("CRON_SECRET") ? "Reminder, birthday and stock jobs can run." : "Jobs at /api/cron/* will refuse to run." },
    { name: "Team alerts (TEAM_EMAIL)", state: set("TEAM_EMAIL") ? "live" : "off", note: set("TEAM_EMAIL") ? "Low-stock and team alerts are emailed." : "Low-stock summaries are not emailed." },
    { name: "Site address (NEXT_PUBLIC_SITE_URL)", state: set("NEXT_PUBLIC_SITE_URL") ? "live" : "partial", note: set("NEXT_PUBLIC_SITE_URL") ? "Used in emails and payment redirects." : "Links in emails point to localhost." },
  ];
}

const STATE_LABEL: Record<State, string> = { live: "Live", test: "Test mode", partial: "Incomplete", off: "Off" };

export default async function SettingsPage() {
  await requireAdmin("settings.manage");
  const s = await getSettings();
  const list = integrations();
  const { key: _key, ...initial } = s;
  void _key;

  return (
    <div className="adm-page narrow">
      <header className="adm-head">
        <div>
          <p className="kick">Admin</p>
          <h1 className="adm-title">Settings</h1>
        </div>
      </header>

      <section className="adm-card">
        <div className="adm-card-head">
          <h2 className="h3">Integrations</h2>
          <span className="muted adm-small">Set in the server environment (.env.local or Vercel). Values are never shown here.</span>
        </div>
        <ul className="adm-list">
          {list.map((i) => (
            <li key={i.name} className="flex justify-between items-center gap-3 py-2">
              <div className="flex flex-col min-w-0">
                <b className="font-semibold">{i.name}</b>
                <small className="muted">{i.note}</small>
              </div>
              <span className={`status int-${i.state}`}>{STATE_LABEL[i.state]}</span>
            </li>
          ))}
        </ul>
      </section>

      <SettingsForm
        initial={{
          ...initial,
          phone: s.phone ?? "",
          supportHours: s.supportHours ?? "",
          instagram: s.instagram ?? "",
          announcements: { in: s.announcements?.in ?? [], uk: s.announcements?.uk ?? [] },
          ticker: { in: s.ticker?.in ?? [], uk: s.ticker?.uk ?? [] },
        }}
      />
    </div>
  );
}
