"use server";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { staffCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/audit";
import { Order } from "@/lib/models";
import { MEASUREMENT_FIELDS, STITCH_LABEL, STITCH_STATUSES, type StitchStatusKey } from "@/components/admin/constants";

export type StitchResult = { ok: true; message: string } | { ok: false; error: string; fields?: Record<string, string> };

const NO = { ok: false as const, error: "Your role doesn't allow you to update stitching." };
const CLOSED = ["cancelled", "returned"];

type ItemRef = { orderId: string; index: number; slug: string };

async function loadItem(ref: ItemRef) {
  if (!mongoose.isValidObjectId(ref.orderId) || !Number.isInteger(ref.index) || ref.index < 0 || ref.index > 200) return null;
  await db();
  const o = await Order.findById(ref.orderId, { number: 1, status: 1, items: 1 }).lean<{
    number: string;
    status: string;
    items: { slug?: string; name?: string; size?: string; stitching?: { status?: string; measurements?: Record<string, string> } }[];
  }>();
  const item = o?.items?.[ref.index];
  if (!o || !item || item.slug !== ref.slug) return null;
  return { order: o, item };
}

function refresh(orderId: string) {
  revalidatePath("/admin/stitching");
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin", "layout");
}

/** Moves one order item to a stitching status (normally the next one on the board). */
export async function setStitchStatus(ref: ItemRef, status: string): Promise<StitchResult> {
  const me = await staffCan("stitching.manage");
  if (!me) return NO;
  if (!(STITCH_STATUSES as readonly string[]).includes(status)) return { ok: false, error: "Choose a valid stitching stage." };
  const found = await loadItem(ref);
  if (!found) return { ok: false, error: "That item has changed. Reload the board." };
  if (CLOSED.includes(found.order.status)) return { ok: false, error: `Order ${found.order.number} is ${found.order.status}.` };
  const from = (found.item.stitching?.status as StitchStatusKey | undefined) ?? "measurements_needed";
  const to = status as StitchStatusKey;
  if (from === to) return { ok: true, message: `Already at ${STITCH_LABEL[to]}.` };
  const p = `items.${ref.index}`;
  await Order.updateOne(
    { _id: ref.orderId, [`${p}.slug`]: ref.slug },
    {
      $set: { [`${p}.stitching.status`]: to, [`${p}.stitching.updatedAt`]: new Date() },
      $push: { history: { status: found.order.status, at: new Date(), note: `Stitching · ${found.item.name} (${found.item.size}): ${STITCH_LABEL[to]} (${me.name})` } },
    }
  );
  await logActivity(me, "stitching.status", { target: found.order.number, targetId: ref.orderId, meta: { item: found.item.name, index: ref.index, from, to } });
  refresh(ref.orderId);
  return { ok: true, message: `${found.item.name} moved to ${STITCH_LABEL[to]}.` };
}

const measurement = z
  .string()
  .trim()
  .max(8)
  .refine((v) => v === "" || (/^\d{1,2}(\.\d{1,2})?$/.test(v) && Number(v) > 0 && Number(v) <= 70), "Inches between 1 and 70, e.g. 14.5");

const DetailsSchema = z.object({
  measurements: z.object(Object.fromEntries(MEASUREMENT_FIELDS.map((f) => [f.key, measurement])) as Record<(typeof MEASUREMENT_FIELDS)[number]["key"], typeof measurement>),
  tailor: z.string().trim().max(80),
  notes: z.string().trim().max(500),
});
export type StitchDetailsInput = z.input<typeof DetailsSchema>;

/** Saves measurements, tailor and notes. The first full set of core measurements moves the item to "Measurements in". */
export async function saveStitchDetails(ref: ItemRef, input: StitchDetailsInput): Promise<StitchResult> {
  const me = await staffCan("stitching.manage");
  if (!me) return NO;
  const parsed = DetailsSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[String(i.path[i.path.length - 1])] ??= i.message;
    return { ok: false, error: Object.values(fields)[0] ?? "Check the measurements.", fields };
  }
  const found = await loadItem(ref);
  if (!found) return { ok: false, error: "That item has changed. Reload the board." };
  if (CLOSED.includes(found.order.status)) return { ok: false, error: `Order ${found.order.number} is ${found.order.status}.` };
  const v = parsed.data;
  const measurements = Object.fromEntries(Object.entries(v.measurements).filter(([, x]) => x !== ""));
  const status = (found.item.stitching?.status as StitchStatusKey | undefined) ?? "measurements_needed";
  const core = ["bust", "waist", "shoulder", "blouseLength"].every((k) => measurements[k]);
  const promote = status === "measurements_needed" && core;
  const p = `items.${ref.index}`;
  const set: Record<string, unknown> = {
    [`${p}.stitching.measurements`]: measurements,
    [`${p}.stitching.tailor`]: v.tailor,
    [`${p}.stitching.notes`]: v.notes,
    [`${p}.stitching.status`]: promote ? "measurements_received" : status,
    [`${p}.stitching.updatedAt`]: new Date(),
  };
  await Order.updateOne({ _id: ref.orderId, [`${p}.slug`]: ref.slug }, { $set: set });
  await logActivity(me, "stitching.details", {
    target: found.order.number,
    targetId: ref.orderId,
    meta: { item: found.item.name, index: ref.index, measurements: Object.keys(measurements).length, tailor: v.tailor || undefined, promoted: promote || undefined },
  });
  refresh(ref.orderId);
  return { ok: true, message: promote ? "Saved. Moved to Measurements in." : "Saved." };
}
