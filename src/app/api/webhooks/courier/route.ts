import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { shiprocketCode } from "@/lib/shiprocket";
import { recordTrackingEvent } from "@/lib/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Shiprocket tracking webhook. (Shiprocket rejects webhook URLs containing its own name, hence /courier.)
// Set it in Shiprocket → Settings → API → Webhooks, with SHIPROCKET_WEBHOOK_TOKEN as the token (sent as x-api-key).

type Payload = { awb?: string | number; current_status?: string; shipment_status?: string; current_timestamp?: string; scans?: { location?: string; date?: string }[] };

function tokenOk(got: string | null) {
  const want = process.env.SHIPROCKET_WEBHOOK_TOKEN;
  if (!want || !got) return false;
  const a = Buffer.from(want);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!tokenOk(req.headers.get("x-api-key"))) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const p = (await req.json().catch(() => null)) as Payload | null;
  const awb = String(p?.awb ?? "").trim().toUpperCase();
  const code = shiprocketCode(String(p?.current_status ?? p?.shipment_status ?? ""));
  if (awb && code) {
    const last = p?.scans?.[p.scans.length - 1];
    const at = p?.current_timestamp ? new Date(p.current_timestamp.replace(" ", "T") + "+05:30") : undefined;
    await recordTrackingEvent({ awb }, { code, location: last?.location ?? "", at: at && !Number.isNaN(at.getTime()) ? at : undefined, source: "shiprocket" }, "Shiprocket").catch((e) =>
      console.error("[courier webhook]", e)
    );
  }
  // Always 200 so Shiprocket doesn't keep retrying statuses we don't track.
  return NextResponse.json({ ok: true });
}
