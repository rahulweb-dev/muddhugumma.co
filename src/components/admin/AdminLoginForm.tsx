"use client";
import { useActionState, useState } from "react";
import { adminLogin, type ActionState } from "@/lib/actions/auth";

export function AdminLoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(adminLogin, { ok: false });
  const [show, setShow] = useState(false);
  const err = state.errors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      {state.message && <p className="notice err m-0" role="alert">{state.message}</p>}
      <div className="field">
        <label htmlFor="a-email">Email</label>
        <input id="a-email" name="email" type="email" autoComplete="username" required defaultValue={state.values?.email} aria-invalid={err.email ? true : undefined} />
        {err.email && <span className="err">{err.email}</span>}
      </div>
      <div className="field">
        <div className="flex items-center justify-between">
          <label htmlFor="a-password">Password</label>
          <button type="button" className="text-xs text-muted underline underline-offset-2" onClick={() => setShow((v) => !v)} aria-controls="a-password" aria-pressed={show}>
            {show ? "Hide" : "Show"}
          </button>
        </div>
        <input id="a-password" name="password" type={show ? "text" : "password"} autoComplete="current-password" required maxLength={128} aria-invalid={err.password ? true : undefined} />
        {err.password && <span className="err">{err.password}</span>}
      </div>
      <button className="btn block mt-1" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
