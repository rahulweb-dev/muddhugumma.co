"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { ProductCard } from "../ProductCard";
import { useStore } from "../StoreProvider";
import { useSalePriced } from "../SalesProvider";
import { getWishlistProducts } from "@/lib/actions/catalog";
import { canonicalSize, sizesFor } from "@/lib/region";
import type { ProductDTO } from "@/lib/types";

export function WishlistView() {
  const { wishlist, region, addToCart, toggleWish } = useStore();
  const priced = useSalePriced();
  const [byslug, setBySlug] = useState<Record<string, ProductDTO | null>>({});
  const [ready, setReady] = useState(false);
  const [picking, setPicking] = useState("");
  const [err, setErr] = useState("");

  // Fetch only slugs we have not loaded yet; removals just filter the list.
  useEffect(() => {
    const missing = wishlist.filter((s) => !(s in byslug));
    if (!missing.length) {
      // The store reads localStorage in its own effect; give it a beat before showing the empty state.
      const t = setTimeout(() => setReady(true), wishlist.length ? 0 : 250);
      return () => clearTimeout(t);
    }
    let live = true;
    getWishlistProducts(missing)
      .then((list) => {
        if (!live) return;
        setBySlug((cur) => {
          const next = { ...cur };
          for (const s of missing) next[s] = list.find((p) => p.slug === s) ?? null;
          return next;
        });
        setReady(true);
      })
      .catch(() => {
        if (live) {
          setErr("We could not load your wishlist. Please refresh the page.");
          setReady(true);
        }
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wishlist]);

  const items = useMemo(() => wishlist.map((s) => byslug[s]).filter((p): p is ProductDTO => !!p), [wishlist, byslug]);

  const move = (p: ProductDTO, size: string) => {
    toggleWish(p.slug);
    addToCart(priced(p), size, p.freeSize ? { blouse: "unstitched", fallPico: false } : undefined);
    setPicking("");
  };

  return (
    <div className="wl pad">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-current="page">Wishlist</span>
      </nav>
      <header className="page-head">
        <span className="kick">Saved for later</span>
        <h1 className="h1">My <i>wishlist</i></h1>
        {ready && items.length > 0 && <p className="muted">{items.length} {items.length === 1 ? "piece" : "pieces"} saved. Prices shown in {region === "in" ? "₹ INR" : "£ GBP"}.</p>}
      </header>

      {err && <p className="notice err">{err}</p>}

      {!ready ? (
        <div className="pgrid" aria-busy="true" aria-label="Loading wishlist">
          {Array.from({ length: Math.max(2, Math.min(8, wishlist.length || 4)) }, (_, i) => <div key={i} className="wl-skel" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          <Icon name="heart" size={36} />
          <h2 className="h2">Nothing <i>saved yet</i></h2>
          <p>Tap the heart on any saree, kurta set or lehenga to keep it here. Your wishlist follows you when you sign in.</p>
          <div className="cta-row">
            <Link className="btn" href="/c/new">Shop new arrivals</Link>
            <Link className="btn ghost" href="/c/all">Browse all</Link>
          </div>
        </div>
      ) : (
        <div className="pgrid wl-grid">
          {items.map((p) => {
            const sizes = sizesFor(p.freeSize, region);
            const inStock = (s: string) => (p.stock[canonicalSize(s)] ?? 0) > 0;
            const soldOut = !sizes.some(inStock);
            return (
              <div className="wl-item" key={p.slug}>
                <ProductCard p={p} />
                {picking === p.slug ? (
                  <div className="wl-pick" role="group" aria-label={`Choose a size for ${p.name}`}>
                    <small>Select size</small>
                    <div>
                      {sizes.map((s) => (
                        <button key={s} type="button" disabled={!inStock(s)} onClick={() => move(p, s)}>
                          {s.replace("UK ", "")}
                        </button>
                      ))}
                    </div>
                    <button type="button" className="link" onClick={() => setPicking("")}>Cancel</button>
                  </div>
                ) : (
                  <div className="wl-act">
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={soldOut}
                      onClick={() => (p.freeSize ? move(p, sizes[0]) : setPicking(p.slug))}
                    >
                      {soldOut ? "Sold out" : "Move to bag"}
                    </button>
                    <button type="button" className="rm" aria-label={`Remove ${p.name} from wishlist`} onClick={() => toggleWish(p.slug)}>
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
