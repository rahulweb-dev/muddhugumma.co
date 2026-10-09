"use server";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { Order, Product } from "@/lib/models";
import { getSession } from "@/lib/auth";
import { canonicalSize } from "@/lib/region";
import { stockPath } from "@/lib/stock";
import { onOrderStatusChanged } from "@/lib/order-events";
import type { ActionState } from "@/lib/actions/auth";

const CANCELLABLE = ["placed", "confirmed"];

type CancelledOrder = {
  region?: "in" | "uk";
  payment?: { method?: string; status?: string };
  items?: { productId?: string; slug?: string; size?: string; qty?: number }[];
};

/** Customer cancels their own order while it has not been packed. Restocks every line. */
export async function cancelOrder(number: string, _prev?: ActionState, _form?: FormData): Promise<ActionState> {
  const s = await getSession();
  if (!s) return { ok: false, message: "Your session has ended. Please sign in again." };
  if (typeof number !== "string" || !number || number.length > 40) return { ok: false, message: "Order not found." };

  await db();
  // Atomic: only one request can move the order out of a cancellable state, so stock is restored once.
  const order = await Order.findOneAndUpdate(
    { number, userId: s.uid, status: { $in: CANCELLABLE } },
    {
      $set: { status: "cancelled" },
      $push: { history: { status: "cancelled", at: new Date(), note: "Cancelled by customer" } },
    },
    { returnDocument: "after" }
  ).lean<CancelledOrder>();

  if (!order) {
    const exists = await Order.exists({ number, userId: s.uid });
    return { ok: false, message: exists ? "This order has already been packed, so it can no longer be cancelled here. Contact us and we will help." : "Order not found." };
  }

  await Promise.all(
    (order.items ?? []).map((it) => {
      const qty = Math.max(0, Math.floor(Number(it.qty) || 0));
      const size = canonicalSize(String(it.size || "")).replace(/[.$]/g, "");
      if (!qty || !size) return null;
      const filter = it.productId && mongoose.isValidObjectId(it.productId) ? { _id: it.productId } : { slug: it.slug };
      return Product.updateOne(filter, { $inc: { [stockPath(order.region === "uk" ? "uk" : "in", size)]: qty } });
    })
  );
  // Cancellation email, give back redeemed points and gift-card balance.
  await onOrderStatusChanged(number, "cancelled");

  revalidatePath("/account", "layout");
  revalidatePath(`/order/${number}`);
  revalidatePath("/admin", "layout");
  const prepaid = order.payment?.status === "paid";
  return {
    ok: true,
    message: prepaid ? "Order cancelled. Your refund will reach the original payment method in 5–7 working days." : "Order cancelled. Nothing more to pay.",
  };
}
