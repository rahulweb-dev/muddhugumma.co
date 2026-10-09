import { NextResponse } from "next/server";
import { JOBS } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron calls these with "Authorization: Bearer <CRON_SECRET>". Locally: curl -H "Authorization: Bearer $CRON_SECRET" localhost:3100/api/cron/low-stock
export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const { job } = await params;
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const entry = JOBS[job];
  if (!entry) return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  const started = Date.now();
  try {
    const summary = await entry.run();
    return NextResponse.json({ job, ok: true, summary, ms: Date.now() - started });
  } catch (e) {
    console.error(`[cron] ${job} failed`, e);
    return NextResponse.json({ job, ok: false, error: String(e) }, { status: 500 });
  }
}
