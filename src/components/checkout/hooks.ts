"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "../StoreProvider";
import { cartProductInfo, checkGiftCard, validateCoupon, type CartProductInfo, type CouponResult } from "@/lib/actions/checkout";
import { COUPON_KEY } from "@/lib/checkout-pricing";
import { effectivePrice, type ActiveSale } from "@/lib/pricing";
import type { Region } from "@/lib/region";
import type { CartLine } from "@/lib/types";

const CART_KEY = "mg_cart_v1"; // StoreProvider's storage key

/**
 * The bag lives in localStorage and StoreProvider loads it after mount, so an empty `cart`
 * on first paint doesn't mean an empty bag. This reports when the real bag is in hand.
 */
export function useCartReady() {
  const { cart } = useStore();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return;
    let stored = 0;
    try {
      const v = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      stored = Array.isArray(v) ? v.length : 0;
    } catch {}
    if (cart.length > 0 || stored === 0) {
      setReady(true);
      return;
    }
    const t = setTimeout(() => setReady(true), 800);
    return () => clearTimeout(t);
  }, [cart, ready]);
  return ready;
}

const readCode = () => {
  try {
    return localStorage.getItem(COUPON_KEY) || "";
  } catch {
    return "";
  }
};
const writeCode = (c: string) => {
  try {
    if (c) localStorage.setItem(COUPON_KEY, c);
    else localStorage.removeItem(COUPON_KEY);
  } catch {}
};

/** Coupon remembered between bag and checkout, re-validated on the server whenever the bag changes. */
export function useCoupon(region: Region, subtotal: number) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<CouponResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setCode(readCode()), []);

  useEffect(() => {
    if (!code || subtotal <= 0) {
      setResult(null);
      return;
    }
    let live = true;
    validateCoupon(code, region, subtotal)
      .then((r) => live && setResult(r))
      .catch(() => live && setResult(null));
    return () => {
      live = false;
    };
  }, [code, region, subtotal]);

  const apply = useCallback(
    async (raw: string) => {
      const c = raw.trim().toUpperCase();
      setError("");
      if (!c) return setError("Enter a coupon code.");
      setBusy(true);
      try {
        const r = await validateCoupon(c, region, subtotal);
        if (r.ok) {
          setCode(c);
          setResult(r);
          writeCode(c);
        } else setError(r.message);
      } catch {
        setError("Couldn't check that code. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [region, subtotal]
  );

  const remove = useCallback(() => {
    setCode("");
    setResult(null);
    setError("");
    writeCode("");
  }, []);

  return {
    code,
    result,
    discount: result?.ok ? result.discount : 0,
    /** Message when a remembered code no longer applies (e.g. bag fell below the minimum). */
    invalid: result && !result.ok ? result.message : "",
    error,
    busy,
    apply,
    remove,
  };
}

export type CouponState = ReturnType<typeof useCoupon>;

/**
 * Bag lines with live prices: the latest catalogue prices from the server plus any timed sale
 * (active sales come from the server page), using the same effectivePrice() rule as placeOrder.
 * Until the server answers, the prices saved in the bag are shown.
 */
export function useLivePrices(cart: CartLine[], sales: ActiveSale[]) {
  const [info, setInfo] = useState<Record<string, CartProductInfo>>({});
  const [loadedKey, setLoadedKey] = useState("");
  const [nonce, setNonce] = useState(0);
  const key = [...new Set(cart.map((l) => l.slug))].sort().join(",");

  useEffect(() => {
    if (!key) return;
    let live = true;
    cartProductInfo(key.split(","))
      .then((r) => {
        if (!live) return;
        setInfo(r);
        setLoadedKey(key);
      })
      .catch(() => live && setLoadedKey(key));
    return () => {
      live = false;
    };
  }, [key, nonce]);

  const lines = useMemo(
    () =>
      cart.map((l) => {
        const p = info[l.slug];
        if (!p) return { ...l, sale: null as ActiveSale | null };
        const ein = effectivePrice(p, "in", sales);
        const euk = effectivePrice(p, "uk", sales);
        return { ...l, price: { in: { now: ein.now, mrp: ein.mrp }, uk: { now: euk.now, mrp: euk.mrp } }, sale: ein.sale ?? euk.sale };
      }),
    [cart, info, sales]
  );
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { lines, loaded: !key || loadedKey === key, refresh };
}

export type LiveLine = ReturnType<typeof useLivePrices>["lines"][number];

/** Gift card applied at checkout (balance checked on the server; placeOrder re-checks and deducts it). */
export function useGiftCard(region: Region) {
  const [card, setCard] = useState<{ code: string; balance: number; expires: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCard(null);
    setError("");
  }, [region]);

  const apply = useCallback(
    async (raw: string) => {
      setError("");
      if (!raw.trim()) return setError("Enter your gift card code.");
      setBusy(true);
      try {
        const r = await checkGiftCard(raw, region);
        if (r.ok) setCard({ code: r.code, balance: r.balance, expires: r.expires });
        else setError(r.message);
      } catch {
        setError("Couldn't check that card. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [region]
  );
  const remove = useCallback(() => {
    setCard(null);
    setError("");
  }, []);
  const recheck = useCallback(async () => {
    if (!card) return;
    const r = await checkGiftCard(card.code, region).catch(() => null);
    if (r?.ok) setCard({ code: r.code, balance: r.balance, expires: r.expires });
    else {
      setCard(null);
      if (r && !r.ok) setError(r.message);
    }
  }, [card, region]);
  return { card, error, busy, apply, remove, recheck };
}

export type GiftCardState = ReturnType<typeof useGiftCard>;
