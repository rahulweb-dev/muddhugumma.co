import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Next 16 "proxy" (formerly middleware): gate account/admin routes and set the region cookie on first visit.
// Pages still call requireUser()/requireAdmin(); this only saves a render for signed-out visitors.

const SESSION_COOKIE = "mg_session"; // keep in sync with src/lib/auth.ts
const REGION_COOKIE = "mg_region"; // keep in sync with src/lib/region.ts
const PUBLIC_ACCOUNT = ["/account/login", "/account/register", "/account/forgot", "/account/reset"];
const ADMIN_LOGIN = "/admin/login";

function secret() {
  // Same fallback as src/lib/auth.ts; in production auth.ts refuses to sign without AUTH_SECRET.
  return new TextEncoder().encode(process.env.AUTH_SECRET || "dev-only-secret-change-me-dev-only-secret");
}

const STAFF = new Set(["admin", "manager", "packer", "stylist"]); // keep in sync with src/lib/permissions.ts

async function readRole(token?: string): Promise<"staff" | "customer" | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.uid) return null;
    return STAFF.has(String(payload.role)) ? "staff" : "customer";
  } catch {
    return null;
  }
}

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isAdmin = under(pathname, "/admin") && !under(pathname, ADMIN_LOGIN);
  const isAccount = under(pathname, "/account") && !PUBLIC_ACCOUNT.some((p) => under(pathname, p));

  if (isAdmin || isAccount) {
    const role = await readRole(request.cookies.get(SESSION_COOKIE)?.value);
    if (!role) {
      const url = request.nextUrl.clone();
      url.pathname = isAdmin ? ADMIN_LOGIN : "/account/login";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      const res = NextResponse.redirect(url);
      if (request.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE); // expired or tampered
      return res;
    }
    if (isAdmin && role !== "staff") {
      const url = request.nextUrl.clone();
      url.pathname = ADMIN_LOGIN;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Explicit ?region=in|uk (product feeds, shared links) wins and is remembered.
  const asked = request.nextUrl.searchParams.get("region");
  if (asked === "in" || asked === "uk") {
    request.cookies.set(REGION_COOKIE, asked);
    const res = NextResponse.next({ request: { headers: request.headers } });
    res.cookies.set(REGION_COOKIE, asked, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    return res;
  }

  // First visit: pick the storefront region from the CDN's geo header (GB → UK, everyone else → India).
  if (!request.cookies.has(REGION_COOKIE)) {
    const country = (request.headers.get("x-vercel-ip-country") || request.headers.get("cf-ipcountry") || "").toUpperCase();
    const region = country === "GB" ? "uk" : "in";
    // Expose it to this render as well as future requests.
    request.cookies.set(REGION_COOKIE, region);
    const res = NextResponse.next({ request: { headers: request.headers } });
    res.cookies.set(REGION_COOKIE, region, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next internals, webhooks and static files (anything with a file extension).
    "/((?!_next/static|_next/image|_next/data|api/webhooks|favicon\\.ico|robots\\.txt|sitemap\\.xml|img/|.*\\.[a-zA-Z0-9]{2,5}$).*)",
  ],
};
