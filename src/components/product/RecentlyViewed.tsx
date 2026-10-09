"use client";
import { useEffect, useState } from "react";
import { ProductCard } from "../ProductCard";
import { getRecentlyViewed } from "@/lib/actions/catalog";
import type { ProductDTO } from "@/lib/types";

const KEY = "mg_recent_v1";
const MAX = 12;

/**
 * Shows the shopper's recently viewed pieces. On a product page pass `slug` to record the visit
 * (and leave it out of the rail); elsewhere (homepage) the rail only reads.
 */
export function RecentlyViewed({ slug, className = "pdp-sec pad" }: { slug?: string; className?: string }) {
  const [items, setItems] = useState<ProductDTO[]>([]);

  useEffect(() => {
    let prev: string[] = [];
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
      if (Array.isArray(raw)) prev = raw.filter((s): s is string => typeof s === "string");
    } catch {}
    if (slug) {
      try {
        localStorage.setItem(KEY, JSON.stringify([slug, ...prev.filter((s) => s !== slug)].slice(0, MAX)));
      } catch {}
    }
    const others = prev.filter((s) => s !== slug).slice(0, 8);
    if (!others.length) {
      setItems([]);
      return;
    }
    let live = true;
    getRecentlyViewed(others)
      .then((list) => live && setItems(list))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [slug]);

  if (!items.length) return null;
  return (
    <section className={className} aria-labelledby="rv-h">
      <div className="sec-head">
        <div><span className="kick">Pick up where you left off</span><h2 className="h2" id="rv-h">Recently <i>viewed</i></h2></div>
      </div>
      <div className="rail">{items.map((p) => <ProductCard key={p.slug} p={p} />)}</div>
    </section>
  );
}
