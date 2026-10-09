import "server-only";
import { db } from "./db";
import { Activity } from "./models";
import type { Session } from "./auth";

/**
 * Records who did what in the admin. Never throws: a failed log line must not break the action it describes.
 * Example: await logActivity(admin, "order.status", { target: order.number, targetId: id, meta: { to: "shipped" } })
 */
export async function logActivity(
  actor: Pick<Session, "uid" | "name"> | null,
  action: string,
  opts: { target?: string; targetId?: string; meta?: Record<string, string | number | boolean | undefined> } = {}
) {
  try {
    await db();
    const meta = Object.fromEntries(Object.entries(opts.meta ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
    await Activity.create({ actorId: actor?.uid ?? "system", actorName: actor?.name ?? "System", action, target: opts.target ?? "", targetId: opts.targetId ?? "", meta });
  } catch (e) {
    console.error("[audit] failed to log", action, e);
  }
}
