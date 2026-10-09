"use client";
import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { requestConsult, type ConsultState } from "@/lib/actions/bookings";
import { track } from "@/lib/analytics";
import { CONSULT_KINDS, CONSULT_SLOTS, dayLabel, istLabel, ukLabel } from "./slots";

type Region = "in" | "uk";

const option =
  "relative flex cursor-pointer border border-line bg-paper transition-colors hover:border-ink has-checked:border-ink has-checked:bg-ink has-checked:text-paper has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-bronze";

export function ConsultForm({ dates, defaults }: { dates: string[]; defaults: { region: Region; name: string; email: string } }) {
  const [state, action, pending] = useActionState<ConsultState, FormData>(requestConsult, { status: "idle" });
  const values = state.status === "error" ? state.values : null;
  const fields = state.status === "error" ? state.fields : {};
  const [region, setRegion] = useState<Region>(values?.region ?? defaults.region);
  const [kind, setKind] = useState(values?.kind ?? "bridal");
  const [date, setDate] = useState(values?.date ?? "");
  const [slot, setSlot] = useState(values?.slot ?? "");
  const id = useId();
  const doneRef = useRef<HTMLHeadingElement>(null);
  const errRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.status === "ok") {
      doneRef.current?.focus();
      if (state.kind) track("generate_lead", { lead_type: "video_consult", consult_kind: state.kind });
    }
    if (state.status === "error") errRef.current?.focus();
  }, [state]);

  if (state.status === "ok") {
    return (
      <section className="flex flex-col items-start gap-4 border border-line p-6 md:p-8" aria-live="polite">
        <span className="font-script text-[44px] leading-none text-cocoa" aria-hidden="true">Thank you</span>
        <h2 ref={doneRef} tabIndex={-1} className="h2 outline-none">
          Request <i>received</i>
        </h2>
        <p className="m-0 max-w-[56ch] text-[15px] text-muted">
          {state.when ? (
            <>
              We&apos;ve noted your {state.kind.toLowerCase()} consult for <b className="text-ink">{state.when}</b>.{" "}
            </>
          ) : null}
          We&apos;ll confirm within a working day by email{state.email ? <> to <b className="text-ink">{state.email}</b></> : null} and on WhatsApp, with a link for the video call.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link className="btn" href="/c/bridal">Browse bridal</Link>
          <Link className="btn ghost" href="/c/new">See new arrivals</Link>
        </div>
      </section>
    );
  }

  const err = (k: keyof typeof fields) =>
    fields[k] ? (
      <p id={`${id}-${k}-err`} className="m-0 text-[12.5px] text-sale">
        {fields[k]}
      </p>
    ) : null;
  const described = (k: keyof typeof fields, extra?: string) => [fields[k] ? `${id}-${k}-err` : "", extra ?? ""].filter(Boolean).join(" ") || undefined;

  return (
    <form action={action} className="flex flex-col gap-8">
      {state.status === "error" && (
        <p ref={errRef} tabIndex={-1} className="notice err m-0 outline-none" role="alert">
          {state.message}
        </p>
      )}

      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0" aria-describedby={described("kind")}>
        <legend className="h3 mb-3">1. What would you like help with?</legend>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {CONSULT_KINDS.map((k) => (
            <label key={k.id} className={`${option} flex-col gap-1 p-4`}>
              <input className="sr-only" type="radio" name="kind" value={k.id} checked={kind === k.id} onChange={() => setKind(k.id)} required />
              <b className="text-[12px] font-bold uppercase tracking-[.16em]">{k.label}</b>
              <span className="text-[13px] opacity-80">{k.note}</span>
            </label>
          ))}
        </div>
        {err("kind")}
      </fieldset>

      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0" aria-describedby={described("date", `${id}-date-hint`)}>
        <legend className="h3 mb-1">2. Choose a day</legend>
        <p id={`${id}-date-hint`} className="m-0 text-[13px] text-muted">
          Monday to Saturday, over the next 30 days.
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6 xl:grid-cols-8">
          {dates.map((d) => {
            const [wd, day, mon] = dayLabel(d).split(" ");
            return (
              <label key={d} className={`${option} flex-col items-center px-1 py-2 text-center`}>
                <input className="sr-only" type="radio" name="date" value={d} checked={date === d} onChange={() => setDate(d)} required />
                <span className="text-[10.5px] font-bold uppercase tracking-[.14em] opacity-75">{wd}</span>
                <span className="font-display text-[19px] leading-tight">{day}</span>
                <span className="text-[11px] opacity-75">{mon}</span>
              </label>
            );
          })}
        </div>
        {err("date")}
      </fieldset>

      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0" aria-describedby={described("slot", `${id}-slot-hint`)}>
        <legend className="h3 mb-1">3. Choose a time</legend>
        <p id={`${id}-slot-hint`} className="m-0 text-[13px] text-muted">
          {region === "uk" ? "Times are shown in India time, with UK time underneath." : "All times are India time (IST)."}
          {!date && region === "uk" ? " Pick a day to see exact UK times." : ""}
        </p>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {CONSULT_SLOTS.map((s) => {
            const ref = date || dates[0];
            return (
              <label key={s} className={`${option} flex-col gap-0.5 px-3 py-3`}>
                <input className="sr-only" type="radio" name="slot" value={s} checked={slot === s} onChange={() => setSlot(s)} required />
                <b className="text-[14px]">{istLabel(ref, s)}</b>
                {region === "uk" && <span className="text-[12.5px] opacity-80">{ukLabel(ref, s)} in the UK</span>}
              </label>
            );
          })}
        </div>
        {err("slot")}
      </fieldset>

      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className="h3 mb-3">4. Your details</legend>
        <div className="form-grid two">
          <div className="field">
            <label htmlFor={`${id}-name`}>Full name</label>
            <input id={`${id}-name`} name="name" autoComplete="name" required maxLength={80} defaultValue={values?.name ?? defaults.name} aria-invalid={!!fields.name} aria-describedby={described("name")} />
            {err("name")}
          </div>
          <div className="field">
            <label htmlFor={`${id}-region`}>Where you live</label>
            <select id={`${id}-region`} name="region" value={region} onChange={(e) => setRegion(e.target.value === "uk" ? "uk" : "in")}>
              <option value="in">India</option>
              <option value="uk">United Kingdom</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-email`}>Email</label>
            <input id={`${id}-email`} name="email" type="email" autoComplete="email" required defaultValue={values?.email ?? defaults.email} aria-invalid={!!fields.email} aria-describedby={described("email")} />
            {err("email")}
          </div>
          <div className="field">
            <label htmlFor={`${id}-phone`}>Mobile (WhatsApp)</label>
            <input
              id={`${id}-phone`}
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              placeholder={region === "uk" ? "07700 900123" : "98765 43210"}
              defaultValue={values?.phone ?? ""}
              aria-invalid={!!fields.phone}
              aria-describedby={described("phone")}
            />
            {err("phone")}
          </div>
          <div className="field full">
            <label htmlFor={`${id}-notes`}>Anything we should know? (optional)</label>
            <textarea
              id={`${id}-notes`}
              name="notes"
              maxLength={1000}
              placeholder="Wedding or event date, colours you love, budget, pieces you've saved…"
              defaultValue={values?.notes ?? ""}
              aria-invalid={!!fields.notes}
              aria-describedby={described("notes")}
            />
            {err("notes")}
          </div>
        </div>
        {/* Honeypot for bots: hidden from people and screen readers. */}
        <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
          <label>
            Website <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
      </fieldset>

      <div className="flex flex-col gap-3">
        <button className="btn self-start" type="submit" disabled={pending}>
          {pending ? "Sending…" : "Request my consult"}
        </button>
        <p className="m-0 max-w-[60ch] text-[12.5px] text-muted">
          We only use these details to arrange your consult. See our <Link className="underline underline-offset-2" href="/help/privacy">privacy policy</Link>.
        </p>
      </div>
    </form>
  );
}
