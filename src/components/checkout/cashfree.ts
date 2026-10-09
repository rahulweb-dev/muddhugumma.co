"use client";
/* Cashfree Checkout (JS SDK v3) loader, shared by the order checkout and the gift card purchase. */

export type CashfreeCheckoutResult = { error?: { message?: string }; redirect?: boolean; paymentDetails?: { paymentMessage?: string } };
type CashfreeInstance = { checkout: (o: { paymentSessionId: string; redirectTarget: "_modal" | "_self" }) => Promise<CashfreeCheckoutResult> };

declare global {
  interface Window {
    Cashfree?: (o: { mode: "sandbox" | "production" }) => CashfreeInstance;
  }
}

const SRC = "https://sdk.cashfree.com/js/v3/cashfree.js";

export function loadCashfree(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Cashfree) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
    const s = existing ?? document.createElement("script");
    s.addEventListener("load", () => resolve(!!window.Cashfree));
    s.addEventListener("error", () => resolve(false));
    if (!existing) {
      s.src = SRC;
      s.async = true;
      document.body.appendChild(s);
    }
  });
}

/**
 * Opens Cashfree's payment popup. Resolves "done" when the shopper finished paying (the server still verifies),
 * "closed" when they closed it or the payment failed (with Cashfree's message), or "unavailable" if the SDK didn't load.
 */
export async function payWithCashfree(sessionId: string, mode: "sandbox" | "production"): Promise<{ status: "done" | "closed" | "unavailable"; message?: string }> {
  if (!(await loadCashfree()) || !window.Cashfree) return { status: "unavailable" };
  const result = await window.Cashfree({ mode }).checkout({ paymentSessionId: sessionId, redirectTarget: "_modal" });
  if (result.error) return { status: "closed", message: result.error.message };
  return { status: "done" };
}
