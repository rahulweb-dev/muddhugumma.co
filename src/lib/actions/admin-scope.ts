"use server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { ADMIN_SCOPE_COOKIE, isScope } from "@/lib/admin-scope";

/** Admin top-bar switcher: All / India / UK. Remembered for a year on this device. */
export async function setAdminScope(scope: string): Promise<void> {
  await requireAdmin();
  if (!isScope(scope)) return;
  (await cookies()).set(ADMIN_SCOPE_COOKIE, scope, {
    path: "/admin",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
}
