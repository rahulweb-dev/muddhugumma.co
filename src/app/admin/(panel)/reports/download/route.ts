import { requireAdmin } from "@/lib/auth";
import { can, type Permission } from "@/lib/permissions";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/audit";
import { Order, Product, User, type ProductDoc } from "@/lib/models";
import { toCsv } from "@/lib/csv";
import { dayKey, type LeanOrder } from "@/lib/admin-data";
import { requestedScope, scopeFilter, scopeRegions } from "@/lib/admin-scope";
import { stockFor } from "@/lib/stock";
import { categoryLabel } from "@/lib/types";
import { resolveRange } from "../data";

export const dynamic = "force-dynamic";

const ADMIN_TZ = process.env.ADMIN_TIMEZONE || "Asia/Kolkata";
const LIVE = (s: string) => s !== "cancelled" && s !== "returned";
const r2 = (n: number) => Math.round(n * 100) / 100;
const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "Free size"];

/** Who may download what. */
const NEEDS: Record<string, Permission> = { orders: "reports.view", daily: "reports.view", products: "reports.view", stock: "products.manage", customers: "customers.view" };

/**
 * Downloadable reports (CSV, opens in Excel / Google Sheets):
 *   /admin/reports/download?type=orders|daily|products|stock|customers&range=7|30|90|fy (or from=&to=)&region=in|uk|all
 * Follows the store picked in the admin top bar; staff locked to one country always get only that country.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "orders";
  const need = NEEDS[type];
  if (!need) return new Response("Unknown report", { status: 404 });
  const admin = await requireAdmin();
  if (!can(admin.role, need)) return new Response("Your role can't download this report.", { status: 403 });
  const range = resolveRange({ from: url.searchParams.get("from") ?? "", to: url.searchParams.get("to") ?? "", range: url.searchParams.get("range") ?? "" });
  const scope = await requestedScope(url.searchParams.get("region"));
  const regions = scopeRegions(scope);
  await db();

  let header: string[] = [];
  let rows: (string | number)[][] = [];
  const inRange = { ...scopeFilter(scope), createdAt: { $gte: range.start, $lt: range.end } };

  if (type === "orders") {
    const orders = await Order.find(inRange).sort({ createdAt: 1 }).limit(50_000).lean<LeanOrder[]>();
    header = ["order_number", "placed_at", "region", "currency", "status", "payment_method", "payment_status", "customer_name", "email", "phone", "city", "state", "postcode", "pieces", "subtotal", "discount", "coupon", "shipping", "cod_fee", "gift_card", "total", "invoice_number"];
    rows = orders.map((o) => [
      o.number, o.createdAt ? new Date(o.createdAt).toLocaleString("sv-SE", { timeZone: ADMIN_TZ }) : "", o.region, o.currency, o.status, o.payment?.method ?? "", o.payment?.status ?? "",
      o.address?.name ?? "", o.email, o.address?.phone ?? "", o.address?.city ?? "", o.address?.state ?? "", o.address?.postcode ?? "",
      o.items.reduce((n, i) => n + (i.qty ?? 1), 0), o.subtotal ?? 0, o.discount ?? 0, o.coupon ?? "", o.shipping ?? 0, o.codFee ?? 0, o.giftCard?.amount ?? 0, o.total ?? 0, o.invoiceNumber ?? "",
    ]);
  } else if (type === "daily" || type === "products") {
    const orders = await Order.find(inRange, { region: 1, items: 1, total: 1, status: 1, createdAt: 1 }).lean<LeanOrder[]>();
    const live = orders.filter((o) => LIVE(o.status));
    if (type === "daily") {
      const map = new Map<string, { orders: number; pieces: number; revenue: number }>();
      for (const o of live) {
        const k = `${dayKey(new Date(o.createdAt ?? 0))}|${o.region}`;
        const v = map.get(k) ?? { orders: 0, pieces: 0, revenue: 0 };
        v.orders++;
        v.pieces += o.items.reduce((n, i) => n + (i.qty ?? 1), 0);
        v.revenue += o.total ?? 0;
        map.set(k, v);
      }
      header = ["date", "region", "currency", "orders", "pieces", "revenue", "average_order"];
      rows = [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => {
          const [day, region] = k.split("|");
          return [day, region, region === "uk" ? "GBP" : "INR", v.orders, v.pieces, r2(v.revenue), r2(v.orders ? v.revenue / v.orders : 0)];
        });
    } else {
      const map = new Map<string, { name: string; region: string; pieces: number; revenue: number }>();
      for (const o of live) {
        for (const i of o.items) {
          const k = `${i.slug}|${o.region}`;
          const v = map.get(k) ?? { name: i.name ?? i.slug ?? "", region: o.region, pieces: 0, revenue: 0 };
          v.pieces += i.qty ?? 1;
          v.revenue += ((i.unitPrice ?? 0) + (i.optionsPrice ?? 0)) * (i.qty ?? 1);
          map.set(k, v);
        }
      }
      header = ["product", "slug", "region", "currency", "pieces_sold", "revenue"];
      rows = [...map.entries()].sort(([, a], [, b]) => b.pieces - a.pieces).map(([k, v]) => [v.name, k.split("|")[0], v.region, v.region === "uk" ? "GBP" : "INR", v.pieces, r2(v.revenue)]);
    }
  } else if (type === "stock") {
    const products = await Product.find({}, { name: 1, slug: 1, category: 1, active: 1, freeSize: 1, stock: 1, stockUk: 1 }).sort({ name: 1 }).lean<ProductDoc[]>();
    header = ["product", "slug", "category", "live", "region", ...SIZES.map((s) => s.toLowerCase().replace(" ", "_")), "total"];
    rows = products.flatMap((p) =>
      regions.map((r) => {
        const st = stockFor(p, r);
        const cells = SIZES.map((s) => (p.freeSize ? (s === "Free size" ? st[s] ?? 0 : "") : s === "Free size" ? "" : st[s] ?? 0));
        return [p.name, p.slug, categoryLabel(p.category), p.active === false ? "no" : "yes", r, ...cells, cells.reduce<number>((a, c) => a + (typeof c === "number" ? c : 0), 0)];
      })
    );
  } else if (type === "customers") {
    const spend = await Order.aggregate<{ _id: { email: string; region: string }; orders: number; total: number; last: Date; name: string; phone: string }>([
      { $match: { ...scopeFilter(scope), status: { $nin: ["cancelled", "returned"] } } },
      { $sort: { createdAt: 1 } },
      { $group: { _id: { email: "$email", region: "$region" }, orders: { $sum: 1 }, total: { $sum: { $ifNull: ["$total", 0] } }, last: { $max: "$createdAt" }, name: { $last: "$address.name" }, phone: { $last: "$address.phone" } } },
      { $sort: { total: -1 } },
      { $limit: 20_000 },
    ]);
    const users = await User.find({ email: { $in: spend.map((s) => s._id.email) } }, { email: 1, createdAt: 1, marketingOptIn: 1 }).lean<{ email: string; createdAt?: Date; marketingOptIn?: boolean }[]>();
    const byEmail = new Map(users.map((u) => [u.email, u]));
    header = ["name", "email", "phone", "region", "currency", "orders", "total_spent", "last_order", "account_since", "marketing_emails"];
    rows = spend.map((s) => {
      const u = byEmail.get(s._id.email);
      return [s.name ?? "", s._id.email, s.phone ?? "", s._id.region, s._id.region === "uk" ? "GBP" : "INR", s.orders, r2(s.total), s.last ? dayKey(new Date(s.last)) : "", u?.createdAt ? dayKey(new Date(u.createdAt)) : "guest", u ? (u.marketingOptIn ? "yes" : "no") : ""];
    });
  }

  await logActivity(admin, "report.download", { target: `${type} (${rows.length} rows)`, meta: { from: range.from, to: range.to, region: scope } });
  const name = type === "stock" || type === "customers" ? `muddhugumma-${type}-${scope}-${range.to}` : `muddhugumma-${type}-${scope}-${range.from}-to-${range.to}`;
  return new Response("﻿" + toCsv([header, ...rows], { safe: true }), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "no-store" },
  });
}
