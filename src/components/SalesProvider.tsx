"use client";
import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useStore } from "./StoreProvider";
import { effectivePrice, salePrices, type ActiveSale } from "@/lib/pricing";
import type { ProductDTO } from "@/lib/types";

/* Running timed sales, fetched on the server per request and shared with every card, the PDP and the bag. */
const SalesCtx = createContext<ActiveSale[]>([]);

export function SalesProvider({ sales, children }: { sales: ActiveSale[]; children: React.ReactNode }) {
  return <SalesCtx.Provider value={sales}>{children}</SalesCtx.Provider>;
}

export const useSales = () => useContext(SalesCtx);

type Priced = Pick<ProductDTO, "slug" | "category" | "collections" | "price">;

/** Region price after any running sale, plus the sale itself (for the "Diwali Sale −20%" tag). */
export function usePrice(p: Priced) {
  const sales = useSales();
  const { region } = useStore();
  return useMemo(() => effectivePrice(p, region, sales), [p, region, sales]);
}

/** Product with sale prices for both regions, ready for addToCart (the bag shows what the shopper saw). */
export function useSalePriced() {
  const sales = useSales();
  return <T extends Priced>(p: T): T => (sales.length ? { ...p, price: salePrices(p, sales) } : p);
}

function left(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m` : `${pad(h)}h ${pad(m)}m ${pad(sec)}s`;
}

/** Countdown strip for the sale ending soonest in the shopper's region. Sits under the announcement bar. */
export function SaleCountdown() {
  const sales = useSales();
  const { region } = useStore();
  const sale = useMemo(
    () => sales.filter((s) => s.regions.includes(region)).sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt))[0] ?? null,
    [sales, region]
  );
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!sale) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sale]);
  if (!sale) return null;
  const ms = now === null ? null : Date.parse(sale.endsAt) - now;
  if (ms !== null && ms <= 0) return null;
  const detail = sale.banner || `${sale.percentOff}% off`;
  return (
    <Link
      href="/c/sale"
      className="flex items-center justify-center gap-x-2 gap-y-0.5 flex-wrap bg-sale text-white text-[12px] tracking-[.04em] text-center px-4 py-1.75 leading-snug hover:underline underline-offset-2"
    >
      <b className="font-bold">{sale.name}</b>
      <span aria-hidden="true">·</span>
      <span>{detail}</span>
      <span aria-hidden="true">·</span>
      <span className="tabular-nums" suppressHydrationWarning>
        {ms === null ? `ends ${new Date(sale.endsAt).toLocaleDateString(region === "uk" ? "en-GB" : "en-IN", { day: "numeric", month: "short" })}` : `ends in ${left(ms)}`}
      </span>
    </Link>
  );
}
