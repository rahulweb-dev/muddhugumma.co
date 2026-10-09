"use client";
import { useEffect } from "react";
import { useStore } from "../StoreProvider";
import { COUPON_KEY } from "@/lib/checkout-pricing";

/** Empties the bag once an order is confirmed or paid. */
export function ClearBag() {
  const { clearCart } = useStore();
  useEffect(() => {
    try {
      // Also write storage directly: on a fresh page load (e.g. back from Stripe) StoreProvider
      // reads localStorage after this effect runs.
      localStorage.setItem("mg_cart_v1", "[]");
      localStorage.removeItem(COUPON_KEY);
    } catch {}
    clearCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
