import "server-only";
// Shiprocket (India) over plain fetch: book a shipment for an order in one step (create order → assign courier and
// AWB → request pickup → label), and turn Shiprocket's tracking webhooks into our tracking codes.
// Env: SHIPROCKET_EMAIL + SHIPROCKET_PASSWORD (an API user from Shiprocket → Settings → API), SHIPROCKET_PICKUP
// (pickup location name, default "Primary"), SHIPROCKET_WEBHOOK_TOKEN (the token you set on the webhook),
// optional parcel defaults SHIPROCKET_PARCEL="30x25x5x0.5" (length × breadth × height cm × weight kg).
import type { TrackingCode } from "./shipping";

const API = "https://apiv2.shiprocket.in/v1/external";

export const shiprocketConfigured = () => !!(process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD);

let token: { value: string; until: number } | null = null;
async function auth(): Promise<string> {
  if (token && token.until > Date.now()) return token.value;
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.SHIPROCKET_EMAIL, password: process.env.SHIPROCKET_PASSWORD }),
    cache: "no-store",
  });
  const d = (await res.json().catch(() => ({}))) as { token?: string; message?: string };
  if (!res.ok || !d.token) throw new Error(`Shiprocket sign-in failed: ${d.message ?? res.status}`);
  token = { value: d.token, until: Date.now() + 8 * 86_400_000 }; // tokens last 10 days
  return d.token;
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await auth()}` },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const d = (await res.json().catch(() => ({}))) as T & { message?: string; errors?: unknown };
  if (!res.ok) throw new Error(`Shiprocket ${path}: ${d.message ?? JSON.stringify(d.errors ?? res.status).slice(0, 200)}`);
  return d;
}

export type ShiprocketOrder = {
  number: string;
  createdAt: Date;
  email: string;
  address: { name?: string; phone?: string; line1?: string; line2?: string; city?: string; state?: string; postcode?: string };
  items: { name: string; slug?: string; size?: string; qty: number; unitPrice: number; optionsPrice?: number }[];
  total: number;
  /** Amount the courier collects at the door (0 for prepaid). */
  collect: number;
};

export type Booked = { shipmentId: string; awb: string; courier: string; labelUrl: string; pickup: boolean };

/** Books the parcel: Shiprocket order + cheapest recommended courier + AWB, then asks for a pickup and a label. */
export async function bookShipment(o: ShiprocketOrder): Promise<Booked> {
  const [l, b, h, w] = (process.env.SHIPROCKET_PARCEL || "30x25x5x0.5").split("x").map(Number);
  const a = o.address;
  const [first, ...rest] = (a.name || "Customer").split(" ");
  const created = await call<{ order_id?: number; shipment_id?: number }>("/orders/create/adhoc", {
    order_id: o.number,
    order_date: o.createdAt.toISOString().slice(0, 16).replace("T", " "),
    pickup_location: process.env.SHIPROCKET_PICKUP || "Primary",
    billing_customer_name: first,
    billing_last_name: rest.join(" ") || ".",
    billing_address: a.line1 ?? "",
    billing_address_2: a.line2 ?? "",
    billing_city: a.city ?? "",
    billing_pincode: a.postcode ?? "",
    billing_state: a.state ?? "",
    billing_country: "India",
    billing_email: o.email,
    billing_phone: (a.phone ?? "").replace(/\D/g, "").slice(-10),
    shipping_is_billing: true,
    order_items: o.items.map((i) => ({ name: i.name.slice(0, 120), sku: `${i.slug ?? "item"}-${i.size ?? ""}`.slice(0, 50), units: i.qty, selling_price: i.unitPrice + (i.optionsPrice ?? 0) })),
    payment_method: o.collect > 0 ? "COD" : "Prepaid",
    sub_total: o.collect > 0 ? o.collect : o.total,
    length: l || 30,
    breadth: b || 25,
    height: h || 5,
    weight: w || 0.5,
  });
  if (!created.shipment_id) throw new Error("Shiprocket didn't return a shipment.");
  const shipmentId = String(created.shipment_id);

  const awb = await call<{ response?: { data?: { awb_code?: string; courier_name?: string } }; awb_assign_status?: number }>("/courier/assign/awb", { shipment_id: shipmentId });
  const code = awb.response?.data?.awb_code;
  if (!code) throw new Error("Shiprocket couldn't assign a courier yet. Open Shiprocket to pick one, or try again.");

  let pickup = true;
  await call("/courier/generate/pickup", { shipment_id: [shipmentId] }).catch(() => (pickup = false));
  const label = await call<{ label_url?: string }>("/courier/generate/label", { shipment_id: [shipmentId] }).catch(() => ({ label_url: "" }));
  return { shipmentId, awb: code, courier: awb.response?.data?.courier_name ?? "Shiprocket", labelUrl: label.label_url ?? "", pickup };
}

/** Shiprocket's shipment status text → our tracking code (null for statuses we don't show). */
export function shiprocketCode(status: string): TrackingCode | null {
  const s = status.trim().toUpperCase();
  if (s.includes("RTO") && s.includes("DELIVERED")) return "rto_delivered";
  if (s.includes("RTO")) return "rto";
  if (s === "DELIVERED") return "delivered";
  if (s.includes("OUT FOR DELIVERY")) return "out_for_delivery";
  if (s.includes("UNDELIVERED") || s.includes("ATTEMPT")) return "delivery_attempted";
  if (s.includes("PICKED UP")) return "picked_up";
  if (s.includes("DESTINATION HUB") || s.includes("REACHED")) return "reached_hub";
  if (s.includes("CUSTOMS")) return "customs";
  if (s.includes("TRANSIT")) return "in_transit";
  if (s.includes("DELAY") || s.includes("LOST") || s.includes("DAMAGED")) return "exception";
  if (s === "SHIPPED") return "shipped";
  return null;
}
