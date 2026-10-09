"use client";
import { useActionState, useEffect, useRef } from "react";
import { sendContactMessage, type ContactState } from "@/lib/actions/contact";
import { CONTACT_TOPICS } from "@/lib/contact";
import { track } from "@/lib/analytics";

export function ContactForm({ defaults, orders }: { defaults: { name: string; email: string; phone: string; topic?: string; order?: string }; orders: string[] }) {
  const [state, action, pending] = useActionState<ContactState, FormData>(sendContactMessage, { ok: false });
  const doneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.ok && state.number) {
      doneRef.current?.focus();
      track("generate_lead", { method: "contact_form" });
    }
  }, [state.ok, state.number]);

  if (state.ok) {
    return (
      <div ref={doneRef} tabIndex={-1} className="notice ok flex flex-col gap-2 outline-none" role="status">
        <b className="font-display text-sm uppercase tracking-[.12em]">Message sent</b>
        <span>{state.message}</span>
      </div>
    );
  }

  const v = state.values ?? {};
  const e = state.errors ?? {};
  const field = (name: string) => ({ name, id: `c-${name}`, "aria-invalid": e[name] ? true : undefined, "aria-describedby": e[name] ? `c-${name}-err` : undefined });
  const err = (name: string) => (e[name] ? <span className="err" id={`c-${name}-err`}>{e[name]}</span> : null);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.message && <p className="notice err m-0" role="alert">{state.message}</p>}
      {/* Honeypot: hidden from people, filled by bots. */}
      <div className="sr-only" aria-hidden="true">
        <label htmlFor="c-website">Website</label>
        <input id="c-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="c-name">Your name</label>
          <input {...field("name")} autoComplete="name" required defaultValue={v.name ?? defaults.name} />
          {err("name")}
        </div>
        <div className="field">
          <label htmlFor="c-email">Email</label>
          <input {...field("email")} type="email" autoComplete="email" required defaultValue={v.email ?? defaults.email} />
          {err("email")}
        </div>
        <div className="field">
          <label htmlFor="c-phone">Phone or WhatsApp <span className="font-normal normal-case tracking-normal">(optional)</span></label>
          <input {...field("phone")} type="tel" autoComplete="tel" inputMode="tel" defaultValue={v.phone ?? defaults.phone} />
          {err("phone")}
        </div>
        <div className="field">
          <label htmlFor="c-orderNumber">Order number <span className="font-normal normal-case tracking-normal">(if it&apos;s about an order)</span></label>
          {orders.length ? (
            <select {...field("orderNumber")} defaultValue={v.orderNumber ?? defaults.order ?? ""}>
              <option value="">Not about an order</option>
              {orders.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input {...field("orderNumber")} placeholder="e.g. MG261009AB12" autoCapitalize="characters" spellCheck={false} defaultValue={v.orderNumber ?? defaults.order ?? ""} />
          )}
          {err("orderNumber")}
        </div>
      </div>

      <div className="field">
        <label htmlFor="c-topic">What&apos;s it about?</label>
        <select {...field("topic")} required defaultValue={v.topic ?? defaults.topic ?? ""}>
          <option value="" disabled>Choose a topic</option>
          {CONTACT_TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {err("topic")}
      </div>

      <div className="field">
        <label htmlFor="c-message">Your message</label>
        <textarea {...field("message")} required rows={6} maxLength={2000} defaultValue={v.message ?? ""} placeholder="Tell us what you need. For sizing, your usual size and height help us advise you." />
        {err("message")}
      </div>

      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <small className="text-muted">We reply within one working day, Monday to Saturday.</small>
        <button className="btn w-full sm:w-auto" type="submit" disabled={pending}>{pending ? "Sending…" : "Send message"}</button>
      </div>
    </form>
  );
}
