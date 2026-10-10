// Plain-language names for statuses in the admin, so staff don't need to learn system words.
// The CSS class on a status chip still uses the raw value (e.g. "status confirmed") for its colour.

export const ORDER_STATUS_LABEL: Record<string, string> = {
  placed: "New · awaiting payment",
  confirmed: "To pack",
  packed: "Packed · to dispatch",
  shipped: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Not paid yet",
  paid: "Paid",
  failed: "Payment failed",
  refunded: "Refunded",
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cod: "Cash on delivery",
  cashfree: "Online (Cashfree)",
  razorpay: "Online (Razorpay)",
  stripe: "Card (Stripe)",
  giftcard: "Gift card",
  test: "Test payment",
};

export const orderStatusLabel = (s?: string | null) => ORDER_STATUS_LABEL[s ?? ""] ?? s ?? "";
export const paymentStatusLabel = (s?: string | null) => PAYMENT_STATUS_LABEL[s ?? "pending"] ?? s ?? "";
