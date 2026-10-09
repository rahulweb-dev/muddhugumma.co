import { NextResponse } from "next/server";
import { settleCashfree, verifyCashfreeWebhook } from "@/lib/cashfree";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CashfreeEvent = { type?: string; data?: { order?: { order_id?: string } } };

/** Cashfree payment webhook. The payload only tells us which order to check; settleCashfree asks Cashfree itself. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyCashfreeWebhook(raw, req.headers.get("x-webhook-signature"), req.headers.get("x-webhook-timestamp"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  let event: CashfreeEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }
  const orderId = event.data?.order?.order_id;
  if (event.type === "PAYMENT_SUCCESS_WEBHOOK" && orderId) {
    await settleCashfree(orderId, "webhook").catch((e) => console.error("[cashfree webhook] settle failed", e));
  }
  // Failed, dropped and unknown events are acknowledged so Cashfree stops retrying.
  return NextResponse.json({ received: true });
}
