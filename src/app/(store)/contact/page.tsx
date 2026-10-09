import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo-meta";
import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { ContactForm } from "@/components/contact/ContactForm";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Order, User } from "@/lib/models";
import { getRegion } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { CONTACT_TOPICS } from "@/lib/contact";

export async function generateMetadata(): Promise<Metadata> {
  return pageMeta({
    title: "Contact us",
    description: "Message House of Muddhugumma about an order, sizing, returns or bridal pieces, by WhatsApp, email or phone. We reply within one working day.",
    path: "/contact",
    kicker: "We're here to help",
  });
}

const HELP: { href: string; label: string; note: string; icon: IconName }[] = [
  { href: "/track", label: "Track an order", note: "Where's my parcel?", icon: "truck" },
  { href: "/help/returns", label: "Returns & exchanges", note: "7 days India · 14 days UK", icon: "back" },
  { href: "/help/size-guide", label: "Size guide", note: "India and UK sizes", icon: "ruler" },
  { href: "/consult", label: "Book a video consult", note: "Bridal and festive styling", icon: "video" },
];

const waLink = (n: string) => `https://wa.me/${n.replace(/\D/g, "")}`;

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ order?: string; topic?: string }> }) {
  const [sp, session, region, settings] = await Promise.all([searchParams, getSession(), getRegion(), getSettings()]);
  let defaults = { name: "", email: "", phone: "" };
  let orders: string[] = [];
  if (session) {
    await db();
    const [u, os] = await Promise.all([
      User.findById(session.uid, { name: 1, email: 1, phone: 1 }).lean<{ name?: string; email?: string; phone?: string }>(),
      Order.find({ userId: session.uid }, { number: 1 }).sort({ createdAt: -1 }).limit(10).lean<{ number: string }[]>(),
    ]);
    defaults = { name: u?.name ?? session.name, email: u?.email ?? session.email, phone: u?.phone ?? "" };
    orders = os.map((o) => o.number);
  }
  const order = sp.order?.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 30);
  const topic = (CONTACT_TOPICS as readonly string[]).includes(sp.topic ?? "") ? sp.topic : order ? "My order or delivery" : undefined;
  const wa = region === "uk" ? settings.whatsappUk || settings.whatsappIn : settings.whatsappIn || settings.whatsappUk;
  const hours = settings.supportHours || (region === "uk" ? "Mon–Sat, 9am–5pm UK time" : "Mon–Sat, 10am–7pm IST");

  return (
    <div className="pad mx-auto max-w-[1200px] pb-16">
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>Contact us</span></nav>
      <header className="page-head">
        <span className="kick">We&apos;re here to help</span>
        <h1 className="h1">Contact <i>us</i></h1>
        <p className="m-0 max-w-[60ch] text-base text-muted">
          Questions about an order, sizing or a bridal piece? Send us a message and a real person from our team will reply within one working day.
        </p>
      </header>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12">
        <section aria-labelledby="form-h" className="min-w-0 border border-line p-5 md:p-7">
          <h2 id="form-h" className="h3 mb-5">Send us a message</h2>
          <ContactForm defaults={{ ...defaults, topic, order }} orders={orders} />
        </section>

        <aside className="flex min-w-0 flex-col gap-4" aria-label="Other ways to reach us">
          <div className="flex flex-col gap-3 bg-stone p-5">
            <h2 className="h3">Talk to us</h2>
            {wa ? (
              <a className="flex items-center gap-3 hover:text-bronze" href={waLink(wa)} target="_blank" rel="noopener noreferrer">
                <Icon name="video" />
                <span className="flex flex-col"><b>WhatsApp</b><span className="text-muted">{wa}</span></span>
              </a>
            ) : null}
            {settings.phone ? (
              <a className="flex items-center gap-3 hover:text-bronze" href={`tel:${settings.phone.replace(/\s/g, "")}`}>
                <Icon name="phone" />
                <span className="flex flex-col"><b>Phone</b><span className="text-muted">{settings.phone}</span></span>
              </a>
            ) : null}
            <a className="flex items-center gap-3 hover:text-bronze" href={`mailto:${settings.supportEmail}`}>
              <Icon name="globe" />
              <span className="flex min-w-0 flex-col"><b>Email</b><span className="break-all text-muted">{settings.supportEmail}</span></span>
            </a>
            <div className="flex items-center gap-3">
              <Icon name="star" />
              <span className="flex flex-col"><b>Hours</b><span className="text-muted">{hours}</span></span>
            </div>
            <div className="flex items-start gap-3">
              <Icon name="pin" />
              <span className="flex flex-col"><b>Address</b><span className="text-muted">{settings.address}</span></span>
            </div>
          </div>

          <nav aria-label="Quick help" className="flex flex-col border border-line">
            {HELP.map((h) => (
              <Link key={h.href} href={h.href} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-stone">
                <Icon name={h.icon} />
                <span className="flex min-w-0 flex-1 flex-col"><b className="text-sm">{h.label}</b><small className="text-muted">{h.note}</small></span>
                <Icon name="chevR" size={16} />
              </Link>
            ))}
          </nav>
          <p className="m-0 text-sm text-muted">
            Most answers are already in our <Link className="link" href="/help/faq">FAQ</Link>.
          </p>
        </aside>
      </div>
    </div>
  );
}
