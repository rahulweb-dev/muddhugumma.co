import "server-only";
import { db } from "@/lib/db";
import { Order, User } from "@/lib/models";
import { REGION_CONFIG, type Region } from "@/lib/region";
import type { ShipmentView } from "@/lib/shipping";
import { toShipmentView } from "@/lib/tracking";

export type AddressView = {
  id: string;
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postcode: string;
  region: Region;
  isDefault: boolean;
};

export type OrderItemView = {
  slug: string;
  name: string;
  image: string;
  size: string;
  qty: number;
  unitPrice: number;
  optionsPrice: number;
  options?: { blouse?: string; fallPico?: boolean };
};

export type OrderView = {
  number: string;
  userId: string;
  region: Region;
  items: OrderItemView[];
  address: Omit<AddressView, "id" | "isDefault">;
  subtotal: number;
  discount: number;
  coupon: string;
  shipping: number;
  codFee: number;
  total: number;
  prepaidDiscount: number;
  loyaltyDiscount: number;
  loyaltyPoints: number;
  giftWrapFee: number;
  giftWrap: boolean;
  giftCardAmount: number;
  payment: { method: string; status: string; ref: string };
  status: string;
  history: { status: string; at: Date; note: string }[];
  shipment: ShipmentView | null;
  createdAt: Date;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const toAddress = (a: any): AddressView => ({
  id: String(a?._id ?? ""),
  name: a?.name ?? "",
  phone: a?.phone ?? "",
  line1: a?.line1 ?? "",
  line2: a?.line2 ?? "",
  city: a?.city ?? "",
  state: a?.state ?? "",
  postcode: a?.postcode ?? "",
  region: a?.region === "uk" ? "uk" : "in",
  isDefault: !!a?.isDefault,
});

const toOrder = (o: any): OrderView => ({
  number: String(o.number),
  userId: String(o.userId ?? ""),
  region: o.region === "uk" ? "uk" : "in",
  items: (o.items ?? []).map((i: any) => ({
    slug: i.slug ?? "",
    name: i.name ?? "",
    image: i.image ?? "",
    size: i.size ?? "",
    qty: Number(i.qty) || 1,
    unitPrice: Number(i.unitPrice) || 0,
    optionsPrice: Number(i.optionsPrice) || 0,
    options: i.options ? { blouse: i.options.blouse || undefined, fallPico: !!i.options.fallPico } : undefined,
  })),
  address: (({ id: _i, isDefault: _d, ...rest }) => rest)(toAddress(o.address)),
  subtotal: Number(o.subtotal) || 0,
  discount: Number(o.discount) || 0,
  coupon: o.coupon ?? "",
  shipping: Number(o.shipping) || 0,
  codFee: Number(o.codFee) || 0,
  total: Number(o.total) || 0,
  prepaidDiscount: Number(o.prepaidDiscount) || 0,
  loyaltyDiscount: Number(o.loyalty?.discount) || 0,
  loyaltyPoints: Number(o.loyalty?.redeemedPoints) || 0,
  giftWrapFee: Number(o.gift?.fee) || 0,
  giftWrap: !!o.gift?.wrap,
  giftCardAmount: Number(o.giftCard?.amount) || 0,
  payment: { method: o.payment?.method ?? "", status: o.payment?.status ?? "pending", ref: o.payment?.ref ?? "" },
  status: o.status ?? "placed",
  history: (o.history ?? []).map((h: any) => ({ status: String(h.status), at: new Date(h.at), note: h.note ?? "" })),
  shipment: toShipmentView(o.shipment),
  createdAt: new Date(o.createdAt ?? Date.now()),
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function getProfile(uid: string) {
  await db();
  const u = await User.findById(uid, { name: 1, email: 1, phone: 1, addresses: 1, createdAt: 1, birthday: 1, marketingOptIn: 1, whatsappOptIn: 1 }).lean<Record<string, unknown>>();
  if (!u) return null;
  const addresses = ((u.addresses as unknown[]) ?? []).map(toAddress);
  addresses.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  return {
    name: String(u.name ?? ""),
    email: String(u.email ?? ""),
    phone: String(u.phone ?? ""),
    addresses,
    since: u.createdAt ? new Date(u.createdAt as string) : null,
    birthday: typeof u.birthday === "string" ? u.birthday : "",
    marketingOptIn: !!u.marketingOptIn,
    whatsappOptIn: !!u.whatsappOptIn,
  };
}

export async function getOrders(uid: string, limit = 0): Promise<OrderView[]> {
  await db();
  const q = Order.find({ userId: uid }).sort({ createdAt: -1 });
  if (limit) q.limit(limit);
  return (await q.lean()).map(toOrder);
}

export async function getOrder(number: string): Promise<OrderView | null> {
  await db();
  const o = await Order.findOne({ number }).lean();
  return o ? toOrder(o) : null;
}

export const STATUS_LABEL: Record<string, string> = {
  placed: "Placed",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

export const PAYMENT_LABEL: Record<string, string> = {
  cod: "Cash on delivery",
  razorpay: "Razorpay (UPI, cards, net banking)",
  stripe: "Card (Stripe)",
  test: "Test payment",
  giftcard: "Gift card",
};

export const longDate = (d: Date, region: Region) =>
  d.toLocaleDateString(REGION_CONFIG[region].locale, { day: "numeric", month: "short", year: "numeric" });

export const dateTime = (d: Date, region: Region) =>
  d.toLocaleString(REGION_CONFIG[region].locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export const itemCount = (o: OrderView) => o.items.reduce((n, i) => n + i.qty, 0);
