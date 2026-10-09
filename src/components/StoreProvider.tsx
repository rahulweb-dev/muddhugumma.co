"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Region } from "@/lib/region";
import type { CartLine, ProductDTO } from "@/lib/types";
import { setRegionAction, syncWishlist } from "@/lib/actions/prefs";
import { currencyFor, itemFromProduct, track } from "@/lib/analytics";
import { syncCart } from "@/lib/actions/cart";
import { currentSlugs } from "@/lib/actions/catalog";

type Toast = { id: number; text: string; image?: string; href?: string; cta?: string };

type Store = {
  region: Region;
  setRegion: (r: Region) => void;
  switching: boolean;
  user: { name: string; role: string } | null;
  cart: CartLine[];
  cartCount: number;
  addToCart: (p: Pick<ProductDTO, "slug" | "name" | "images" | "price">, size: string, options?: CartLine["options"], qty?: number) => void;
  updateQty: (key: string, qty: number) => void;
  removeLine: (key: string) => void;
  clearCart: () => void;
  wishlist: string[];
  isWished: (slug: string) => boolean;
  toggleWish: (slug: string, name?: string) => void;
  toast: (t: Omit<Toast, "id">) => void;
};

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore must be used inside <StoreProvider>");
  return c;
};

const CART_KEY = "mg_cart_v1";
const WISH_KEY = "mg_wish_v1";
const read = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};
const lineKey = (slug: string, size: string, o?: CartLine["options"]) => [slug, size, o?.blouse ?? "", o?.fallPico ? "fall" : ""].join("|");

export function StoreProvider({
  initialRegion,
  user,
  serverWishlist,
  children,
}: {
  initialRegion: Region;
  user: { name: string; role: string } | null;
  serverWishlist: string[] | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [region, setRegionState] = useState<Region>(initialRegion);
  const [switching, startTransition] = useTransition();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const loaded = useRef(false);

  useEffect(() => setRegionState(initialRegion), [initialRegion]);

  // Load browser state once; merge the guest wishlist into the account when signed in.
  useEffect(() => {
    setCart(read<CartLine[]>(CART_KEY, []));
    const local = read<string[]>(WISH_KEY, []);
    if (serverWishlist) {
      const merged = [...new Set([...serverWishlist, ...local])];
      setWishlist(merged);
      if (merged.length !== serverWishlist.length) syncWishlist(merged);
    } else setWishlist(local);
    loaded.current = true;
  }, [serverWishlist]);

  // Products whose URL was renamed: move saved bag lines and wishlist entries to the new slug (once per visit).
  useEffect(() => {
    const saved = [...read<CartLine[]>(CART_KEY, []).map((l) => l.slug), ...read<string[]>(WISH_KEY, [])];
    if (!saved.length) return;
    currentSlugs(saved)
      .then((map) => {
        if (!Object.keys(map).length) return;
        setCart((c) => c.map((l) => (map[l.slug] ? { ...l, slug: map[l.slug] } : l)));
        setWishlist((w) => [...new Set(w.map((s) => map[s] ?? s))]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { if (loaded.current) write(CART_KEY, cart); }, [cart]);

  // Signed-in shoppers: mirror the bag on the account (debounced) for abandoned-bag reminders.
  const lastSynced = useRef<string | null>(null);
  useEffect(() => {
    if (!user || !loaded.current) return;
    const lines = cart.map((l) => ({ slug: l.slug, size: l.size, qty: l.qty, options: l.options }));
    const sig = JSON.stringify(lines);
    if (sig === lastSynced.current) return;
    const t = setTimeout(() => {
      lastSynced.current = sig;
      syncCart(lines).catch(() => { lastSynced.current = null; });
    }, 2000);
    return () => clearTimeout(t);
  }, [cart, user]);
  useEffect(() => { if (loaded.current) write(WISH_KEY, wishlist); }, [wishlist]);

  // Keep tabs in step.
  useEffect(() => {
    const on = (e: StorageEvent) => {
      if (e.key === CART_KEY) setCart(read(CART_KEY, []));
      if (e.key === WISH_KEY) setWishlist(read(WISH_KEY, []));
    };
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
  }, []);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-1), { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 3400);
  }, []);

  const setRegion = useCallback(
    (r: Region) => {
      setRegionState(r);
      startTransition(async () => {
        await setRegionAction(r);
        router.refresh();
      });
    },
    [router]
  );

  const addToCart: Store["addToCart"] = useCallback(
    (p, size, options, qty = 1) => {
      const key = lineKey(p.slug, size, options);
      setCart((c) => {
        const hit = c.find((l) => l.key === key);
        if (hit) return c.map((l) => (l.key === key ? { ...l, qty: Math.min(10, l.qty + qty) } : l));
        return [...c, { key, slug: p.slug, name: p.name, image: p.images[0], size, qty, price: p.price, options }];
      });
      toast({ text: `Added to bag · ${size}`, image: p.images[0], href: "/bag", cta: "View bag" });
      const item = itemFromProduct(p, region, { size, quantity: qty });
      track("add_to_cart", { currency: currencyFor(region), value: (item.price ?? 0) * qty, items: [item] });
    },
    [toast, region]
  );

  const toggleWish = useCallback(
    (slug: string, name?: string) => {
      const has = wishlist.includes(slug);
      const next = has ? wishlist.filter((s) => s !== slug) : [slug, ...wishlist];
      setWishlist(next);
      if (user) syncWishlist(next);
      if (!has) track("add_to_wishlist", { items: [{ item_id: slug, item_name: name || slug }] });
      toast({ text: has ? "Removed from wishlist" : `Saved${name ? ` ${name}` : ""} to wishlist`, href: has ? undefined : "/wishlist", cta: has ? undefined : "View" });
    },
    [user, toast, wishlist]
  );

  const value = useMemo<Store>(
    () => ({
      region,
      setRegion,
      switching,
      user,
      cart,
      cartCount: cart.reduce((n, l) => n + l.qty, 0),
      addToCart,
      updateQty: (key, qty) => setCart((c) => c.map((l) => (l.key === key ? { ...l, qty: Math.max(1, Math.min(10, qty)) } : l))),
      removeLine: (key) => setCart((c) => c.filter((l) => l.key !== key)),
      clearCart: () => setCart([]),
      wishlist,
      isWished: (slug) => wishlist.includes(slug),
      toggleWish,
      toast,
    }),
    [region, setRegion, switching, user, cart, addToCart, wishlist, toggleWish, toast]
  );

  const t = toasts[toasts.length - 1];
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className={`toast${t ? " show" : ""}`} role="status" aria-live="polite">
        {t && (
          <>
            {t.image && <img src={imgSrc(t.image, 80)} alt="" />}
            <span>{t.text}</span>
            {t.href && <a href={t.href}>{t.cta}</a>}
          </>
        )}
      </div>
    </Ctx.Provider>
  );
}

/** Plain URL for tiny thumbnails outside next/image. */
export function imgSrc(path: string, w: number) {
  const ep = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT?.replace(/\/$/, "");
  return ep ? `${ep}/${path}?tr=w-${w},q-70,f-auto` : `/img/${path}`;
}
