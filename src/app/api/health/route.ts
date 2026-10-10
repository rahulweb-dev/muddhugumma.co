import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Health check for uptime monitors (GitHub Actions uptime.yml, UptimeRobot…): 200 when the site AND the database
 * answer, 503 otherwise. Says nothing about configuration or data, so it is safe to leave public.
 */
export async function GET() {
  const started = Date.now();
  let database: "ok" | "down" = "down";
  try {
    await Promise.race([
      (async () => {
        await db();
        await mongoose.connection.db?.admin().ping();
      })(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
    ]);
    database = "ok";
  } catch (e) {
    console.error("[health] database check failed", e);
  }
  const ok = database === "ok";
  return NextResponse.json(
    { ok, database, ms: Date.now() - started, at: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
