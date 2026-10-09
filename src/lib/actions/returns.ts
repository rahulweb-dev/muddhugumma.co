"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { createReturn, type CreateReturnInput } from "@/lib/returns";
import type { ActionState } from "@/lib/actions/auth";

const MAX_LINES = 40;

/** Customer return/exchange request from /account/orders/[number]/return. Everything is re-checked against the order on the server. */
export async function submitReturn(orderNumber: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const s = await getSession();
  if (!s) return { ok: false, message: "Your session has ended. Please sign in again." };
  if (typeof orderNumber !== "string" || !/^[A-Za-z0-9-]{3,40}$/.test(orderNumber)) return { ok: false, message: "Order not found." };

  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v.trim() : "";
  };

  const lines: CreateReturnInput["lines"] = [];
  for (let i = 0; i < MAX_LINES; i++) {
    if (str(`pick-${i}`) !== "on") continue;
    const kind = str(`kind-${i}`) === "exchange" ? "exchange" : "return";
    lines.push({ index: i, qty: Number.parseInt(str(`qty-${i}`) || "1", 10), reason: str(`reason-${i}`), kind, exchangeSize: kind === "exchange" ? str(`size-${i}`) : undefined });
  }
  const m = str("refundMethod");
  const refundMethod = m === "store_credit" || m === "bank" ? m : "original";

  const res = await createReturn({ orderNumber, userId: s.uid, lines, refundMethod, comments: str("comments").slice(0, 600) });
  if (!res.ok) return { ok: false, message: res.error, errors: res.field ? { [res.field]: res.error } : undefined };

  revalidatePath("/account", "layout");
  redirect(`/account/returns?created=${encodeURIComponent(res.number)}`);
}
