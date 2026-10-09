"use client";
import { useActionState, useEffect, useRef } from "react";
import { changePassword, updateProfile, type ActionState } from "@/lib/actions/auth";
import { Field, FormNotice } from "./Field";

const INITIAL: ActionState = { ok: false };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type ProfileProps = { name: string; email: string; phone: string; birthday: string; marketingOptIn: boolean; whatsappOptIn: boolean };

export function ProfileForm({ name, email, phone, birthday, marketingOptIn, whatsappOptIn }: ProfileProps) {
  const [state, action, pending] = useActionState(updateProfile, INITIAL);
  const [bm, bd] = /^\d{2}-\d{2}$/.test(birthday) ? birthday.split("-").map((x) => String(Number(x))) : ["", ""];
  const v = state?.values;
  const month = v ? v.bmonth ?? "" : bm;
  const day = v ? v.bday ?? "" : bd;
  const marketing = v ? v.marketing === "on" : marketingOptIn;
  const whatsapp = v ? v.whatsapp === "on" : whatsappOptIn;
  // Re-mount the uncontrolled fields when the saved values change, so they show what was stored.
  const k = v ? JSON.stringify(v) : "init";
  return (
    <form action={action} className="ac-panel ac-form" noValidate>
      <h2 className="h3">Personal details</h2>
      <FormNotice state={state} />
      <div className="form-grid two">
        <Field label="Full name" name="name" autoComplete="name" required maxLength={80} defaultValue={name} state={state} />
        <Field label="Mobile" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} defaultValue={phone} state={state} hint="Optional. Used for delivery updates." />
        <div className="field full">
          <label htmlFor="f-email">Email</label>
          <input id="f-email" type="email" value={email} readOnly disabled aria-describedby="f-email-hint" />
          <span className="ac-hint" id="f-email-hint">Your sign-in email. Contact us to change it.</span>
        </div>
        <fieldset className="full m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0" aria-describedby="f-bday-hint">
          <legend className="mb-1.5 text-[11px] font-bold uppercase tracking-[.14em] text-muted">Birthday (optional)</legend>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-2.5">
            <div className="field">
              <label htmlFor="f-bday" className="sr-only">Day</label>
              <select id="f-bday" name="bday" defaultValue={day} key={`d-${k}`} aria-invalid={state?.errors?.bday ? true : undefined}>
                <option value="">Day</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => <option key={n} value={String(n)}>{n}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-bmonth" className="sr-only">Month</label>
              <select id="f-bmonth" name="bmonth" defaultValue={month} key={`m-${k}`} aria-invalid={state?.errors?.bmonth ? true : undefined}>
                <option value="">Month</option>
                {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
              </select>
            </div>
          </div>
          {state?.errors?.bday || state?.errors?.bmonth ? (
            <span className="text-xs text-sale">{state.errors.bday ?? state.errors.bmonth}</span>
          ) : (
            <span className="ac-hint" id="f-bday-hint">Just the day and month. We&apos;ll send you a birthday treat if you&apos;re signed up for offers.</span>
          )}
        </fieldset>
        <fieldset className="full m-0 flex min-w-0 flex-col gap-2.5 border-0 p-0">
          <legend className="mb-1.5 text-[11px] font-bold uppercase tracking-[.14em] text-muted">Messages from us</legend>
          <label className="check">
            <input type="checkbox" name="marketing" defaultChecked={marketing} key={`mk-${k}`} />
            Send me new arrivals and offers
          </label>
          <label className="check">
            <input type="checkbox" name="whatsapp" defaultChecked={whatsapp} key={`wa-${k}`} />
            Send order updates on WhatsApp
          </label>
        </fieldset>
      </div>
      <div>
        <button className="btn" disabled={pending} aria-busy={pending}>
          {pending ? "Saving…" : "Save details"}
        </button>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, INITIAL);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="ac-panel ac-form" noValidate>
      <h2 className="h3">Change password</h2>
      <FormNotice state={state} />
      <div className="form-grid">
        <Field label="Current password" name="current" type="password" autoComplete="current-password" required maxLength={128} state={state} />
        <Field label="New password" name="next" type="password" autoComplete="new-password" required maxLength={128} state={state} hint="At least 8 characters, with a letter and a number." />
        <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required maxLength={128} state={state} />
      </div>
      <div>
        <button className="btn" disabled={pending} aria-busy={pending}>
          {pending ? "Updating…" : "Update password"}
        </button>
      </div>
    </form>
  );
}
