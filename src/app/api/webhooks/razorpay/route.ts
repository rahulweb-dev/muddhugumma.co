import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GiftCard, Order } from "@/lib/models";
import { fetchRazorpayOrder, markAdvancePaid, markOrderPaid, verifyRazorpayWebhook } from "@/lib/payments";
import { activatePurchasedGiftCard } from "@/lib/giftcards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RazorpayEvent = {
  event: string;
  payload?: { payment?: { entity?: { id: string; order_id?: string; amount?: number; status?: string } } };
};

type LeanOrder = { number: string; total?: number; payment?: { method?: string }; partialCod?: { paidOnline?: number } };

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyRazorpayWebhook(raw, req.headers.get("x-razorpay-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  let event: RazorpayEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  const p = event.payload?.payment?.entity;
  if (event.event === "payment.captured" && p?.order_id) {
    await db();
    const ref = `${p.order_id}:${p.id}`;
    // payment.ref holds the Razorpay order id until the order (or the part-COD advance) is paid, then "order_id:payment_id".
    const o = await Order.findOne({ "payment.ref": p.order_id }, { number: 1, total: 1, payment: 1, partialCod: 1 }).lean<LeanOrder>();
    if (o?.payment?.method === "razorpay") {
      if (p.amount === undefined || p.amount === Math.round((o.total ?? 0) * 100)) {
        await markOrderPaid(o.number, ref, "Paid with Razorpay (webhook)", { "payment.ref": p.order_id });
      }
    } else if (o?.payment?.method === "cod" && (o.partialCod?.paidOnline ?? 0) > 0) {
      if (p.amount === undefined || p.amount === Math.round((o.partialCod?.paidOnline ?? 0) * 100)) {
        await markAdvancePaid(o.number, p.order_id, ref, "Advance paid with Razorpay (webhook)");
      }
    } else if (!o) {
      // Gift card purchase: the Razorpay order's receipt is our purchase reference.
      const rz = await fetchRazorpayOrder(p.order_id);
      if (rz && /^GC\d{6}[A-Z0-9]{4}$/.test(rz.receipt)) {
        const card = await GiftCard.findOne({ orderNumber: rz.receipt }, { initial: 1 }).lean<{ initial?: number }>();
        if (card && (p.amount === undefined || p.amount === Math.round((card.initial ?? 0) * 100))) await activatePurchasedGiftCard(rz.receipt);
      }
    }
  }
  // Already-paid and unknown orders are acknowledged so Razorpay stops retrying.
  return NextResponse.json({ received: true });
}
