import "server-only";
import { db } from "./db";
import { Order, Product, ReturnRequest, type OrderDoc, type OrderItemDoc, type ProductDoc, type ReturnDoc, type ReturnStatus } from "./models";
import { canonicalSize, REGION_CONFIG, sizesFor, type Region } from "./region";
import { issueGiftCard } from "./giftcards";
import { logActivity } from "./audit";
import { onReturnUpdated, STORE_CREDIT_NOTE } from "./order-events";

/* Returns & exchanges shared logic. Owner: comms & accounts. Admin pages (content & service) call updateReturnStatus. */

export const RETURN_REASONS = ["Size doesn't fit", "Colour looks different", "Arrived damaged", "Quality not as expected", "Changed my mind", "Other"];

export const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  requested: "Requested",
  approved: "Approved",
  pickup_scheduled: "Pickup scheduled",
  picked_up: "Picked up",
  received: "Received at studio",
  refunded: "Refunded",
  exchanged: "Exchanged",
  rejected: "Not approved",
};

export const REFUND_METHOD_LABEL: Record<ReturnDoc["refundMethod"], string> = {
  original: "Original payment method",
  store_credit: "Store credit (gift card)",
  bank: "Bank transfer",
};

export type ReturnExtras = {
  note?: string;
  refundAmount?: number;
  refundMethod?: "original" | "store_credit" | "bank";
  pickup?: { courier?: string; awb?: string; date?: Date };
};

/* ---------- eligibility ---------- */

/** When the order was delivered: the courier's delivered scan, else the "delivered" history entry. */
export function deliveredAt(o: Pick<OrderDoc, "shipment" | "history">): Date | null {
  if (o.shipment?.deliveredAt) return new Date(o.shipment.deliveredAt);
  const h = [...(o.history ?? [])].reverse().find((x) => x.status === "delivered");
  return h?.at ? new Date(h.at) : null;
}

export type ReturnWindow = { open: boolean; deadline: Date | null; reason: string };

export function returnWindow(o: Pick<OrderDoc, "status" | "region" | "shipment" | "history">, now = new Date()): ReturnWindow {
  if (o.status !== "delivered") return { open: false, deadline: null, reason: "Returns open once your order has been delivered." };
  const at = deliveredAt(o);
  if (!at) return { open: false, deadline: null, reason: "We couldn't find the delivery date for this order. Contact us and we'll help." };
  const deadline = new Date(at.getTime() + REGION_CONFIG[o.region].returnsDays * 864e5);
  if (now > deadline) return { open: false, deadline, reason: `The ${REGION_CONFIG[o.region].returnsDays}-day return window for this order has closed.` };
  return { open: true, deadline, reason: "" };
}

/** Why an item can't be returned (matches /help/returns), or "" when it can. */
export function nonReturnableReason(item: Pick<OrderItemDoc, "options">, product?: Pick<ProductDoc, "madeToOrder"> | null): string {
  if (item.options?.blouse === "stitched") return "Blouses stitched to your measurements can't be returned.";
  if (item.options?.fallPico) return "Sarees with fall and pico added at your request can't be returned.";
  if (product?.madeToOrder) return "Made-to-order pieces are made just for you, so they can't be returned.";
  return "";
}

const lineKey = (slug: string, size: string) => `${slug}|${size}`;
const OPEN_STATUSES: ReturnStatus[] = ["requested", "approved", "pickup_scheduled", "picked_up", "received", "refunded", "exchanged"];

/** Per order line: how many units can still be returned, why not, and which sizes are in stock for an exchange. */
export type ReturnableLine = {
  index: number;
  slug: string;
  name: string;
  image: string;
  size: string;
  qty: number;
  unitPrice: number;
  available: number;
  blocked: string;
  exchangeSizes: string[];
};

export async function getReturnableLines(o: OrderDoc): Promise<ReturnableLine[]> {
  await db();
  const slugs = [...new Set((o.items ?? []).map((i) => i.slug))];
  const [products, existing] = await Promise.all([
    Product.find({ slug: { $in: slugs } }, { slug: 1, madeToOrder: 1, freeSize: 1, stock: 1 }).lean<Pick<ProductDoc, "slug" | "madeToOrder" | "freeSize" | "stock">[]>(),
    ReturnRequest.find({ orderNumber: o.number, status: { $in: OPEN_STATUSES } }, { items: 1 }).lean<Pick<ReturnDoc, "items">[]>(),
  ]);
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const used = new Map<string, number>();
  for (const rt of existing) for (const it of rt.items) used.set(lineKey(it.slug, it.size), (used.get(lineKey(it.slug, it.size)) ?? 0) + (Number(it.qty) || 0));

  return (o.items ?? []).map((it, index) => {
    const p = bySlug.get(it.slug);
    const key = lineKey(it.slug, it.size);
    const qty = Number(it.qty) || 1;
    const taken = Math.min(qty, used.get(key) ?? 0);
    used.set(key, (used.get(key) ?? 0) - taken); // the same slug/size on two lines shares the count
    const stock = (p?.stock instanceof Map ? Object.fromEntries(p.stock) : p?.stock ?? {}) as Record<string, number>;
    const exchangeSizes = p ? sizesFor(!!p.freeSize, o.region).filter((s) => s !== it.size && (Number(stock[canonicalSize(s)]) || 0) > 0) : [];
    return {
      index,
      slug: it.slug,
      name: it.name,
      image: it.image,
      size: it.size,
      qty,
      unitPrice: (Number(it.unitPrice) || 0) + (Number(it.optionsPrice) || 0),
      available: qty - taken,
      blocked: nonReturnableReason(it, p),
      exchangeSizes,
    };
  });
}

/* ---------- create (customer) ---------- */

export type CreateReturnInput = {
  orderNumber: string;
  userId: string;
  lines: { index: number; qty: number; reason: string; kind: "return" | "exchange"; exchangeSize?: string }[];
  refundMethod: "original" | "store_credit" | "bank";
  comments?: string;
};

export type CreateReturnResult = { ok: true; number: string } | { ok: false; error: string; field?: string };

/** Validates against the order and creates RT-<order>-<n>. Notifies the customer. */
export async function createReturn(input: CreateReturnInput): Promise<CreateReturnResult> {
  await db();
  const o = await Order.findOne({ number: input.orderNumber, userId: input.userId }).lean<OrderDoc>();
  if (!o) return { ok: false, error: "Order not found." };
  const win = returnWindow(o);
  if (!win.open) return { ok: false, error: win.reason };
  if (!input.lines.length) return { ok: false, error: "Choose at least one item to return or exchange." };

  const isCod = o.payment?.method === "cod";
  const allowedMethods = isCod ? ["bank", "store_credit"] : ["original", "store_credit"];
  const anyReturn = input.lines.some((l) => l.kind === "return");
  const refundMethod = anyReturn ? input.refundMethod : isCod ? "store_credit" : "original";
  if (anyReturn && !allowedMethods.includes(refundMethod)) return { ok: false, error: "Choose how you'd like your refund.", field: "refundMethod" };

  const lines = await getReturnableLines(o);
  const seen = new Set<number>();
  const items: ReturnDoc["items"] = [];
  for (const l of input.lines) {
    const line = lines[l.index];
    const f = `line-${l.index}`;
    if (!line || seen.has(l.index)) return { ok: false, error: "One of the items isn't part of this order." };
    seen.add(l.index);
    if (line.blocked) return { ok: false, error: `${line.name}: ${line.blocked}`, field: f };
    if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > line.available) {
      return { ok: false, error: line.available ? `${line.name}: choose a quantity from 1 to ${line.available}.` : `${line.name} already has a return request.`, field: f };
    }
    if (!RETURN_REASONS.includes(l.reason)) return { ok: false, error: `${line.name}: choose a reason.`, field: f };
    if (l.kind === "exchange") {
      if (!l.exchangeSize || !line.exchangeSizes.includes(l.exchangeSize)) return { ok: false, error: `${line.name}: choose an in-stock size to exchange for.`, field: f };
    }
    items.push({
      slug: line.slug,
      name: line.name,
      image: line.image,
      size: line.size,
      qty: l.qty,
      reason: l.reason,
      kind: l.kind,
      exchangeSize: l.kind === "exchange" ? l.exchangeSize : undefined,
      unitPrice: line.unitPrice,
    });
  }

  const refundAmount = items.filter((i) => i.kind === "return").reduce((n, i) => n + i.unitPrice * i.qty, 0);
  const comments = (input.comments ?? "").trim().slice(0, 600);

  // Number RT-<order>-<n>; retry on the rare clash when two requests are made at once.
  for (let attempt = 0; attempt < 4; attempt++) {
    const n = (await ReturnRequest.countDocuments({ orderNumber: o.number })) + 1 + attempt;
    const number = `RT-${o.number}-${n}`;
    try {
      await ReturnRequest.create({
        number,
        orderNumber: o.number,
        userId: input.userId,
        region: o.region,
        items,
        status: "requested",
        refundAmount: o.region === "in" ? Math.round(refundAmount) : Math.round(refundAmount * 100) / 100,
        refundMethod,
        comments,
        history: [{ status: "requested", at: new Date(), note: "Requested by customer" }],
      });
      await onReturnUpdated(number);
      return { ok: true, number };
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
    }
  }
  return { ok: false, error: "We couldn't save your request just now. Please try again." };
}

/* ---------- reads ---------- */

export type ReturnView = {
  number: string;
  orderNumber: string;
  region: Region;
  status: ReturnStatus;
  statusLabel: string;
  items: { slug: string; name: string; image: string; size: string; qty: number; reason: string; kind: "return" | "exchange"; exchangeSize: string; unitPrice: number }[];
  refundAmount: number;
  refundMethod: ReturnDoc["refundMethod"];
  refundMethodLabel: string;
  pickup: { courier: string; awb: string; date: string } | null;
  comments: string;
  history: { status: string; label: string; at: string; note: string }[];
  createdAt: string;
};

export function toReturnView(r: ReturnDoc): ReturnView {
  const iso = (d?: Date) => (d ? new Date(d).toISOString() : "");
  return {
    number: r.number,
    orderNumber: r.orderNumber,
    region: r.region === "uk" ? "uk" : "in",
    status: r.status,
    statusLabel: RETURN_STATUS_LABEL[r.status] ?? r.status,
    items: (r.items ?? []).map((i) => ({
      slug: i.slug,
      name: i.name,
      image: i.image ?? "",
      size: i.size,
      qty: Number(i.qty) || 1,
      reason: i.reason ?? "",
      kind: i.kind === "exchange" ? "exchange" : "return",
      exchangeSize: i.exchangeSize ?? "",
      unitPrice: Number(i.unitPrice) || 0,
    })),
    refundAmount: Number(r.refundAmount) || 0,
    refundMethod: r.refundMethod ?? "original",
    refundMethodLabel: REFUND_METHOD_LABEL[r.refundMethod ?? "original"],
    pickup: r.pickup?.date || r.pickup?.courier || r.pickup?.awb ? { courier: r.pickup.courier ?? "", awb: r.pickup.awb ?? "", date: iso(r.pickup.date) } : null,
    comments: r.comments ?? "",
    history: (r.history ?? []).map((h) => ({ status: h.status, label: RETURN_STATUS_LABEL[h.status as ReturnStatus] ?? h.status, at: iso(h.at), note: h.note ?? "" })),
    createdAt: iso(r.createdAt),
  };
}

export async function getReturnsForOrder(orderNumber: string): Promise<ReturnView[]> {
  await db();
  const list = await ReturnRequest.find({ orderNumber }).sort({ createdAt: -1 }).lean<ReturnDoc[]>();
  return list.map(toReturnView);
}

export async function getReturnsForUser(userId: string): Promise<ReturnView[]> {
  await db();
  const list = await ReturnRequest.find({ userId }).sort({ createdAt: -1 }).limit(200).lean<ReturnDoc[]>();
  return list.map(toReturnView);
}

/* ---------- status changes (admin) ---------- */

const STEP: Record<ReturnStatus, number> = { requested: 0, approved: 1, pickup_scheduled: 2, picked_up: 3, received: 4, refunded: 5, exchanged: 5, rejected: 9 };
const FINAL = new Set<ReturnStatus>(["refunded", "exchanged", "rejected"]);

const restock = (items: ReturnDoc["items"], pick: (i: ReturnDoc["items"][number]) => string | undefined, sign: 1 | -1) =>
  Promise.all(
    items.map((it) => {
      const size = canonicalSize(pick(it) ?? "").replace(/[.$]/g, "");
      const qty = Math.max(0, Math.floor(Number(it.qty) || 0));
      if (!size || !qty) return null;
      return Product.updateOne({ slug: it.slug }, { $inc: { [`stock.${size}`]: sign * qty } });
    })
  );

/** Moves a return to a new status (restock on "received", store-credit gift card on "refunded"), logs history, notifies the customer. */
export async function updateReturnStatus(
  returnNumber: string,
  status: ReturnStatus,
  actor: { uid: string; name: string },
  extras: ReturnExtras = {}
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    if (!(status in STEP)) return { ok: false, error: "Unknown return status." };
    await db();
    const rt = await ReturnRequest.findOne({ number: returnNumber }).lean<ReturnDoc>();
    if (!rt) return { ok: false, error: "Return not found." };
    if (FINAL.has(rt.status)) return { ok: false, error: `This return is already ${RETURN_STATUS_LABEL[rt.status].toLowerCase()}.` };
    if (status === rt.status && status !== "pickup_scheduled") return { ok: false, error: `Already ${RETURN_STATUS_LABEL[status].toLowerCase()}.` };
    if (status !== "rejected" && STEP[status] < STEP[rt.status]) return { ok: false, error: `It's already ${RETURN_STATUS_LABEL[rt.status].toLowerCase()}; it can't go back to ${RETURN_STATUS_LABEL[status].toLowerCase()}.` };
    if (status === "exchanged" && !rt.items.some((i) => i.kind === "exchange")) return { ok: false, error: "This request has no exchange items. Mark it refunded instead." };

    const set: Record<string, unknown> = { status };
    const notes: string[] = [];
    if (extras.note?.trim()) notes.push(extras.note.trim().slice(0, 500));

    if (status === "pickup_scheduled") {
      const pk = extras.pickup ?? {};
      if (!pk.date || Number.isNaN(new Date(pk.date).getTime())) return { ok: false, error: "Choose the pickup date." };
      set.pickup = { courier: pk.courier ?? "", awb: pk.awb ?? "", date: new Date(pk.date) };
      notes.push(`Pickup on ${new Date(pk.date).toISOString().slice(0, 10)}${pk.courier ? ` with ${pk.courier}` : ""}${pk.awb ? ` · AWB ${pk.awb}` : ""}`);
    }

    let giftCode = "";
    if (status === "refunded") {
      const method = extras.refundMethod ?? rt.refundMethod ?? "original";
      const amount = extras.refundAmount ?? rt.refundAmount;
      if (!(Number(amount) > 0)) return { ok: false, error: "Enter the refund amount." };
      const rounded = rt.region === "in" ? Math.round(Number(amount)) : Math.round(Number(amount) * 100) / 100;
      set.refundAmount = rounded;
      set.refundMethod = method;
      if (method === "store_credit") {
        const order = await Order.findOne({ number: rt.orderNumber }, { email: 1, address: 1 }).lean<Pick<OrderDoc, "email" | "address">>();
        const card = await issueGiftCard({
          region: rt.region,
          amount: rounded,
          recipientEmail: order?.email,
          recipientName: order?.address?.name,
          orderNumber: rt.orderNumber,
          message: `Store credit for return ${rt.number}`,
          notify: false, // the refund email below carries the code
        });
        giftCode = card.code;
        notes.push(`${STORE_CREDIT_NOTE} ${giftCode}`);
      } else {
        notes.push(`Refund of ${rounded} to ${REFUND_METHOD_LABEL[method].toLowerCase()}`);
      }
    }

    // Atomic: only move from the status we read, so two staff clicking at once can't double-restock.
    const res = await ReturnRequest.updateOne(
      { number: returnNumber, status: rt.status },
      { $set: set, $push: { history: { status, at: new Date(), note: [...notes, `(${actor.name})`].join(" · ") } } }
    );
    if (!res.modifiedCount) return { ok: false, error: "Someone else just updated this return. Refresh and try again." };

    const everReceived = (rt.history ?? []).some((h) => h.status === "received");
    if (status === "received" && !everReceived) await restock(rt.items, (i) => i.size, 1);
    // The replacement size leaves the studio when the exchange is completed.
    if (status === "exchanged") await restock(rt.items.filter((i) => i.kind === "exchange"), (i) => i.exchangeSize, -1);

    await logActivity(actor, "return.status", { target: rt.number, meta: { from: rt.status, to: status, giftCard: giftCode || undefined } });
    await onReturnUpdated(returnNumber);

    const msg: Partial<Record<ReturnStatus, string>> = {
      received: "Marked received. Items are back in stock.",
      refunded: giftCode ? `Refunded as store credit: gift card ${giftCode}.` : "Marked refunded. The customer has been emailed.",
      exchanged: "Marked exchanged. Replacement stock has been taken off.",
      pickup_scheduled: "Pickup saved. The customer has been emailed.",
    };
    return { ok: true, message: msg[status] ?? `Moved to ${RETURN_STATUS_LABEL[status]}.` };
  } catch (e) {
    console.error("[returns] updateReturnStatus failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "Could not update the return." };
  }
}
