import "server-only";
import { db } from "@/lib/db";
import { Order, Product, ReturnRequest } from "@/lib/models";
import type { Region } from "@/lib/region";
import { dayKey, financialYear, zonedDayStart, type LeanOrder } from "@/lib/admin-data";

const DAY = 86_400_000;
export const PRESETS = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
  { key: "fy", label: "This financial year" },
] as const;

export type Range = { preset: string; from: string; to: string; start: Date; end: Date; label: string };

/** Reads ?range= (7, 30, 90, fy) or ?from=&to= (yyyy-mm-dd, inclusive, store timezone). Defaults to 30 days. */
export function resolveRange(sp: { range?: string; from?: string; to?: string }): Range {
  const today = dayKey(new Date());
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  if (sp.from && sp.to && ymd.test(sp.from) && ymd.test(sp.to) && zonedDayStart(sp.from) && zonedDayStart(sp.to)) {
    const [from, to] = sp.from <= sp.to ? [sp.from, sp.to] : [sp.to, sp.from];
    return { preset: "custom", from, to, start: zonedDayStart(from)!, end: new Date(zonedDayStart(to)!.getTime() + DAY), label: `${from} to ${to}` };
  }
  if (sp.range === "fy") {
    const fy = financialYear();
    const to = fy.to < today ? fy.to : today;
    return { preset: "fy", from: fy.from, to, start: zonedDayStart(fy.from)!, end: new Date(zonedDayStart(to)!.getTime() + DAY), label: `${fy.label} so far` };
  }
  const days = sp.range === "7" ? 7 : sp.range === "90" ? 90 : 30;
  const endStart = zonedDayStart(today)!;
  const start = new Date(endStart.getTime() - (days - 1) * DAY);
  const from = dayKey(new Date(start.getTime() + DAY / 2));
  return { preset: String(days), from, to: today, start, end: new Date(endStart.getTime() + DAY), label: `Last ${days} days` };
}

export type Ranked = { key: string; label: string; units: number; revenue: number };
export type RegionReport = {
  region: Region;
  orders: number;
  liveOrders: number;
  cancelled: number;
  returnedOrders: number;
  returnRequests: number;
  revenue: number;
  aov: number;
  units: number;
  cancellationRate: number;
  returnRate: number;
  bestByUnits: Ranked[];
  bestByRevenue: Ranked[];
  categories: { key: string; revenue: number; units: number }[];
  cod: { orders: number; revenue: number };
  prepaid: { orders: number; revenue: number };
  topCustomers: { email: string; name: string; orders: number; revenue: number }[];
  daily: { day: string; revenue: number; orders: number }[];
  margin: null | { itemRevenue: number; cost: number; margin: number; pct: number; unitsWithoutCost: number; productsWithoutCost: number; byProduct: { key: string; label: string; margin: number; revenue: number }[] };
};

const LIVE = (s: string) => s !== "cancelled" && s !== "returned";
const round2 = (n: number) => Math.round(n * 100) / 100;
const lineRevenue = (i: LeanOrder["items"][number]) => ((i.unitPrice ?? 0) + (i.optionsPrice ?? 0)) * (i.qty ?? 1);

export async function loadReport(range: Range): Promise<Record<Region, RegionReport>> {
  await db();
  const orders = await Order.find(
    { createdAt: { $gte: range.start, $lt: range.end } },
    { number: 1, email: 1, region: 1, items: 1, total: 1, status: 1, payment: 1, "address.name": 1, createdAt: 1 }
  ).lean<LeanOrder[]>();
  const [returns, products] = await Promise.all([
    ReturnRequest.find({ createdAt: { $gte: range.start, $lt: range.end }, status: { $ne: "rejected" } }, { region: 1 }).lean<{ region?: Region }[]>(),
    Product.find({ slug: { $in: [...new Set(orders.flatMap((o) => o.items.map((i) => i.slug ?? "")))] } }, { slug: 1, category: 1, costPrice: 1 }).lean<{ slug: string; category: string; costPrice?: number }[]>(),
  ]);
  const product = new Map(products.map((p) => [p.slug, p]));
  const days: string[] = [];
  for (let t = range.start.getTime() + DAY / 2; t < range.end.getTime(); t += DAY) days.push(dayKey(new Date(t)));

  const build = (region: Region): RegionReport => {
    const all = orders.filter((o) => o.region === region);
    const live = all.filter((o) => LIVE(o.status));
    const cancelled = all.filter((o) => o.status === "cancelled").length;
    const returnedOrders = all.filter((o) => o.status === "returned").length;
    const returnRequests = returns.filter((r) => r.region === region).length;
    const revenue = live.reduce((n, o) => n + (o.total ?? 0), 0);

    const bySlug = new Map<string, Ranked>();
    const byCat = new Map<string, { key: string; revenue: number; units: number }>();
    const byCustomer = new Map<string, { email: string; name: string; orders: number; revenue: number }>();
    const byDay = new Map(days.map((d) => [d, { day: d, revenue: 0, orders: 0 }]));
    const cod = { orders: 0, revenue: 0 };
    const prepaid = { orders: 0, revenue: 0 };
    let units = 0;
    let itemRevenue = 0;
    let cost = 0;
    let unitsWithoutCost = 0;
    const noCost = new Set<string>();
    const marginBy = new Map<string, { key: string; label: string; margin: number; revenue: number }>();

    for (const o of live) {
      const pay = o.payment?.method === "cod" ? cod : prepaid;
      pay.orders++;
      pay.revenue += o.total ?? 0;
      const email = (o.email ?? "").toLowerCase();
      const c = byCustomer.get(email) ?? { email, name: o.address?.name ?? "", orders: 0, revenue: 0 };
      c.orders++;
      c.revenue += o.total ?? 0;
      byCustomer.set(email, c);
      const d = o.createdAt ? byDay.get(dayKey(new Date(o.createdAt))) : undefined;
      if (d) {
        d.orders++;
        d.revenue += o.total ?? 0;
      }
      for (const it of o.items) {
        const q = it.qty ?? 1;
        const rev = lineRevenue(it);
        const slug = it.slug ?? it.name ?? "?";
        units += q;
        const s = bySlug.get(slug) ?? { key: slug, label: it.name ?? slug, units: 0, revenue: 0 };
        s.units += q;
        s.revenue += rev;
        bySlug.set(slug, s);
        const p = it.slug ? product.get(it.slug) : undefined;
        const cat = p?.category ?? "other";
        const cc = byCat.get(cat) ?? { key: cat, revenue: 0, units: 0 };
        cc.revenue += rev;
        cc.units += q;
        byCat.set(cat, cc);
        if (region === "in") {
          if (p?.costPrice && p.costPrice > 0) {
            itemRevenue += rev;
            cost += p.costPrice * q;
            const m = marginBy.get(slug) ?? { key: slug, label: it.name ?? slug, margin: 0, revenue: 0 };
            m.margin += rev - p.costPrice * q;
            m.revenue += rev;
            marginBy.set(slug, m);
          } else {
            unitsWithoutCost += q;
            noCost.add(slug);
          }
        }
      }
    }

    const ranked = [...bySlug.values()];
    return {
      region,
      orders: all.length,
      liveOrders: live.length,
      cancelled,
      returnedOrders,
      returnRequests,
      revenue: round2(revenue),
      aov: live.length ? round2(revenue / live.length) : 0,
      units,
      cancellationRate: all.length ? cancelled / all.length : 0,
      returnRate: all.length ? returnRequests / all.length : 0,
      bestByUnits: [...ranked].sort((a, b) => b.units - a.units || b.revenue - a.revenue).slice(0, 8),
      bestByRevenue: [...ranked].sort((a, b) => b.revenue - a.revenue).slice(0, 8),
      categories: [...byCat.values()].sort((a, b) => b.revenue - a.revenue),
      cod: { orders: cod.orders, revenue: round2(cod.revenue) },
      prepaid: { orders: prepaid.orders, revenue: round2(prepaid.revenue) },
      topCustomers: [...byCustomer.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8),
      daily: [...byDay.values()],
      margin:
        region === "in"
          ? {
              itemRevenue: round2(itemRevenue),
              cost: round2(cost),
              margin: round2(itemRevenue - cost),
              pct: itemRevenue ? (itemRevenue - cost) / itemRevenue : 0,
              unitsWithoutCost,
              productsWithoutCost: noCost.size,
              byProduct: [...marginBy.values()].sort((a, b) => b.margin - a.margin).slice(0, 8),
            }
          : null,
    };
  };

  return { in: build("in"), uk: build("uk") };
}
