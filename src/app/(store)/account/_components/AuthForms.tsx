"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { login, register, requestPasswordReset, resetPassword, type ActionState } from "@/lib/actions/auth";
import { Field, FormNotice } from "./Field";

const INITIAL: ActionState = { ok: false };
const withNext = (path: string, next?: string) => (next ? `${path}?next=${encodeURIComponent(next)}` : path);

function PasswordField({ label, name, state, autoComplete, hint }: { label: string; name: string; state?: ActionState; autoComplete: string; hint?: string }) {
  const [show, setShow] = useState(false);
  const err = state?.errors?.[name];
  const id = `f-${name}`;
  return (
    <div className="field">
      <div className="ac-label-row">
        <label htmlFor={id}>{label}</label>
        <button type="button" className="ac-reveal" onClick={() => setShow((v) => !v)} aria-controls={id} aria-pressed={show}>
          {show ? "Hide" : "Show"}
        </button>
      </div>
      <input
        id={id}
        name={name}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        required
        maxLength={128}
        aria-invalid={err ? true : undefined}
        aria-describedby={err ? `${id}-err` : hint ? `${id}-hint` : undefined}
      />
      {err ? <span className="err" id={`${id}-err`}>{err}</span> : hint ? <span className="ac-hint" id={`${id}-hint`}>{hint}</span> : null}
    </div>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, INITIAL);
  return (
    <form action={action} className="ac-form" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <FormNotice state={state} />
      <Field label="Email" name="email" type="email" autoComplete="email" inputMode="email" required state={state} />
      <PasswordField label="Password" name="password" autoComplete="current-password" state={state} />
      <p className="-mt-2 mb-0 text-right text-[13px]">
        <Link className="link" href="/account/forgot">Forgot password?</Link>
      </p>
      <button className="btn block" disabled={pending} aria-busy={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="ac-switch">
        New to Muddhugumma? <Link className="link" href={withNext("/account/register", next)}>Create an account</Link>
      </p>
    </form>
  );
}

export function RegisterForm({ next, referral }: { next?: string; referral?: string }) {
  const [state, action, pending] = useActionState(register, INITIAL);
  const keep = (k: string) => (state?.values ? state.values[k] === "on" : undefined);
  return (
    <form action={action} className="ac-form" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <FormNotice state={state} />
      <Field label="Full name" name="name" autoComplete="name" required maxLength={80} state={state} />
      <Field label="Email" name="email" type="email" autoComplete="email" inputMode="email" required state={state} />
      <Field label="Mobile (optional)" name="phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={20} state={state} hint="For delivery updates on WhatsApp or SMS." />
      <PasswordField label="Password" name="password" autoComplete="new-password" state={state} hint="At least 8 characters, with a letter and a number." />
      <Field label="Referral code (optional)" name="ref" autoComplete="off" autoCapitalize="characters" maxLength={24} defaultValue={referral} state={state} hint="Got a code from a friend? Add it here." />
      <div className="flex flex-col gap-2.5">
        <label className="check">
          <input type="checkbox" name="marketing" defaultChecked={keep("marketing")} key={`m-${state?.values?.marketing ?? ""}`} />
          Send me new arrivals and offers
        </label>
        <label className="check">
          <input type="checkbox" name="whatsapp" defaultChecked={keep("whatsapp")} key={`w-${state?.values?.whatsapp ?? ""}`} />
          Send order updates on WhatsApp
        </label>
      </div>
      <button className="btn block" disabled={pending} aria-busy={pending}>
        {pending ? "Creating account…" : "Create account"}
      </button>
      <p className="ac-fine">By creating an account you agree to our terms of sale and privacy policy.</p>
      <p className="ac-switch">
        Already have an account? <Link className="link" href={withNext("/account/login", next)}>Sign in</Link>
      </p>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, INITIAL);
  return (
    <form action={action} className="ac-form" noValidate>
      <FormNotice state={state} />
      <Field label="Email" name="email" type="email" autoComplete="email" inputMode="email" required state={state} key={state?.ok ? "sent" : "form"} />
      <button className="btn block" disabled={pending} aria-busy={pending}>
        {pending ? "Sending…" : state?.ok ? "Send another link" : "Email me a reset link"}
      </button>
      <p className="ac-switch">
        Remembered it? <Link className="link" href="/account/login">Back to sign in</Link>
      </p>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword.bind(null, token), INITIAL);
  return (
    <form action={action} className="ac-form" noValidate>
      <FormNotice state={state} />
      <PasswordField label="New password" name="password" autoComplete="new-password" state={state} hint="At least 8 characters, with a letter and a number." />
      <PasswordField label="Confirm new password" name="confirm" autoComplete="new-password" state={state} />
      <button className="btn block" disabled={pending} aria-busy={pending}>
        {pending ? "Saving…" : "Save and sign in"}
      </button>
      {state?.message && !state.ok && (
        <p className="ac-switch">
          <Link className="link" href="/account/forgot">Get a new reset link</Link>
        </p>
      )}
    </form>
  );
}
