import type { InputHTMLAttributes, ReactNode } from "react";
import type { ActionState } from "@/lib/actions/auth";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  state?: ActionState;
  hint?: ReactNode;
  className?: string;
};

/** Labelled input using the global `field` styles, with an inline error from the action state. */
export function Field({ label, name, state, hint, className, id, defaultValue, ...rest }: Props) {
  const fid = id ?? `f-${name}`;
  const err = state?.errors?.[name];
  const value = state?.values?.[name] ?? defaultValue;
  return (
    <div className={`field${className ? ` ${className}` : ""}`}>
      <label htmlFor={fid}>{label}</label>
      <input
        id={fid}
        name={name}
        defaultValue={value}
        aria-invalid={err ? true : undefined}
        aria-describedby={err ? `${fid}-err` : hint ? `${fid}-hint` : undefined}
        {...rest}
      />
      {err ? (
        <span className="err" id={`${fid}-err`}>{err}</span>
      ) : hint ? (
        <span className="ac-hint" id={`${fid}-hint`}>{hint}</span>
      ) : null}
    </div>
  );
}

export function FormNotice({ state }: { state?: ActionState }) {
  if (!state?.message) return null;
  return (
    <p className={`notice ${state.ok ? "ok" : "err"}`} role={state.ok ? "status" : "alert"}>
      {state.message}
    </p>
  );
}
