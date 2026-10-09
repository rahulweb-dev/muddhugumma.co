"use client";
import { useActionState } from "react";
import { cancelOrder } from "@/lib/actions/orders";
import { FormNotice } from "./Field";
import type { ActionState } from "@/lib/actions/auth";

export function CancelOrder({ number }: { number: string }) {
  const [state, action, pending] = useActionState(cancelOrder.bind(null, number), { ok: false } as ActionState);
  return (
    <form
      action={action}
      className="ac-cancel"
      onSubmit={(e) => {
        if (!window.confirm(`Cancel order ${number}? This cannot be undone.`)) e.preventDefault();
      }}
    >
      <FormNotice state={state} />
      {!state?.ok && (
        <button className="btn ghost block" disabled={pending} aria-busy={pending}>
          {pending ? "Cancelling…" : "Cancel order"}
        </button>
      )}
    </form>
  );
}
