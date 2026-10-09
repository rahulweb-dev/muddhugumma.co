"use client";
import { useActionState } from "react";
import { Icon } from "../Icon";
import { requestStockAlert, type AlertState } from "@/lib/actions/alerts";

/** Back-in-stock sign-up for a sold-out size (or a sold-out free-size piece). */
export function NotifyMe({ slug, size, email, whole }: { slug: string; size: string; email?: string; whole: boolean }) {
  const [state, action, pending] = useActionState<AlertState, FormData>(requestStockAlert, null);
  if (state?.ok) {
    return (
      <p className="notice ok nm-done" role="status">
        <Icon name="check" size={16} /> {state.message}
      </p>
    );
  }
  return (
    <form className="nm" action={action} key={size}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="size" value={size} />
      <b className="h3">{whole ? "Sold out for now" : `Size ${size} is sold out`}</b>
      <p className="muted">Pieces come back in small batches. Leave your email and we&apos;ll write once, the moment {whole ? "it is" : "this size is"} back.</p>
      <div className="nm-row">
        <label className="sr-only" htmlFor={`nm-${slug}`}>Email address</label>
        <input id={`nm-${slug}`} name="email" type="email" required defaultValue={email ?? ""} placeholder="you@example.com" autoComplete="email" />
        <button type="submit" className="btn" disabled={pending}>{pending ? "Saving…" : "Notify me"}</button>
      </div>
      {state && !state.ok && <p className="notice err" role="alert">{state.message}</p>}
    </form>
  );
}
