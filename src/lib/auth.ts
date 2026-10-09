import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { can, isStaff, type Permission, type StaffRole } from "./permissions";

export const SESSION_COOKIE = "mg_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type Session = { uid: string; name: string; email: string; role: "customer" | StaffRole };

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is not set.");
  return new TextEncoder().encode(s || "dev-only-secret-change-me-dev-only-secret");
}

export async function createSession(s: Session) {
  const token = await new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function verifyToken(token?: string): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { uid: String(payload.uid), name: String(payload.name), email: String(payload.email), role: isStaff(String(payload.role)) ? (payload.role as StaffRole) : "customer" };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  return verifyToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** For server components and actions that need a signed-in customer. */
export async function requireUser(next = "/account"): Promise<Session> {
  const s = await getSession();
  if (!s) {
    const { redirect } = await import("next/navigation");
    redirect(`/account/login?next=${encodeURIComponent(next)}`);
  }
  return s!;
}

/**
 * For admin pages and admin server actions. Any staff role may enter the admin;
 * pass a permission to restrict a page or action further (see src/lib/permissions.ts).
 */
export async function requireAdmin(perm?: Permission): Promise<Session> {
  const s = await currentStaff();
  const { redirect } = await import("next/navigation");
  if (!s) redirect("/admin/login");
  if (perm && !can(s!.role, perm)) redirect(`/admin?denied=${encodeURIComponent(perm)}`);
  return s!;
}
export const requireStaff = requireAdmin;

/** Permission check for server actions that should return an error instead of redirecting. */
export async function staffCan(perm: Permission): Promise<Session | null> {
  const s = await currentStaff();
  return s && can(s.role, perm) ? s : null;
}

/**
 * The signed-in staff member with their role read fresh from the database, so removing or demoting
 * someone takes effect on their very next click instead of when their 30-day token expires.
 */
const currentStaff = cache(async (): Promise<Session | null> => {
  const s = await getSession();
  if (!s || !isStaff(s.role)) return null;
  const { db } = await import("./db");
  const { User } = await import("./models");
  await db();
  const u = await User.findById(s.uid, { role: 1, name: 1 }).lean<{ role?: string; name?: string }>();
  if (!u || !isStaff(u.role)) return null;
  return { ...s, role: u.role, name: u.name ?? s.name };
});

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}
