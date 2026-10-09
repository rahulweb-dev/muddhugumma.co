"use client";
/* Razorpay Checkout loader, shared by the order checkout and the gift card purchase. */

export type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: (r: { error?: { description?: string } }) => void) => void };
  }
}

const RZP_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export function loadRazorpay(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${RZP_SRC}"]`);
    const s = existing ?? document.createElement("script");
    s.addEventListener("load", () => resolve(!!window.Razorpay));
    s.addEventListener("error", () => resolve(false));
    if (!existing) {
      s.src = RZP_SRC;
      s.async = true;
      document.body.appendChild(s);
    }
  });
}
