import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GiftCard } from "@/lib/models";
import { markOrderPaid, verifyStripeSignature } from "@/lib/payments";
import { activatePurchasedGiftCard } from "@/lib/giftcards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StripeEvent = {
  type: string;
  data: { object: { id: string; payment_status?: string; payment_intent?: string | null; amount_total?: number | null; metadata?: Record<string, string>; client_reference_id?: string | null } };
};

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  let event: StripeEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const s = event.data.object;
    const number = s.metadata?.number || s.client_reference_id || "";
    if (number && s.payment_status === "paid") {
      if (s.metadata?.kind === "giftcard") {
        await db();
        const card = await GiftCard.findOne({ orderNumber: number }, { initial: 1 }).lean<{ initial?: number }>();
        if (card && (s.amount_total == null || s.amount_total === Math.round((card.initial ?? 0) * 100))) await activatePurchasedGiftCard(number);
      } else {
        // Only the session we created for this order can mark it paid (fires onOrderPaid).
        await markOrderPaid(number, s.payment_intent || s.id, "Paid with Stripe", { "payment.method": "stripe", "payment.ref": s.id });
      }
    }
  }
  return NextResponse.json({ received: true });
}
