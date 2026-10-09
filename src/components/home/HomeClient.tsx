"use client";
import { useActionState, useState } from "react";
import { ProductCard } from "../ProductCard";
import { subscribeAction } from "@/lib/actions/prefs";
import type { ProductDTO } from "@/lib/types";


export function NewArrivals({ products, tabs }: { products: ProductDTO[]; tabs: { label: string; value: string }[] }) {
  const TABS = [{ label: "All", value: "" }, ...tabs];
  const [tab, setTab] = useState("");
  const list = (tab ? products.filter((p) => p.category === tab) : products).slice(0, 8);
  return (
    <>
      <div className="tabs" role="tablist" aria-label="Filter new arrivals">
        {TABS.map((t) => (
          <button key={t.label} role="tab" aria-selected={tab === t.value} onClick={() => setTab(t.value)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="pgrid">
        {list.map((p) => <ProductCard key={p.slug} p={p} />)}
      </div>
    </>
  );
}

export function Newsletter() {
  const [state, action, pending] = useActionState(subscribeAction, null);
  return (
    <>
      <form action={action}>
        <label className="sr-only" htmlFor="news-email">Email address</label>
        <input id="news-email" name="email" type="email" required placeholder="Your email address" />
        <button type="submit" disabled={pending}>{pending ? "Joining…" : "Subscribe"}</button>
      </form>
      <p className={`msg${state && !state.ok ? " err" : ""}`} aria-live="polite">{state?.message}</p>
    </>
  );
}
