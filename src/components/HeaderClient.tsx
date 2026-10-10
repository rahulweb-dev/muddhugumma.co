"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";
import { useStore } from "./StoreProvider";
import { SaleCountdown } from "./SalesProvider";
import { REGION_CONFIG, formatMoney, isRegion, type Region } from "@/lib/region";
import type { Suggestion } from "@/lib/queries";

/** Rotating top bar. Messages come from Admin → Settings, falling back to the region defaults. */
export function Announcement({ region, messages }: { region: Region; messages?: string[] }) {
  const custom = messages?.filter(Boolean);
  const lines = custom?.length ? custom : REGION_CONFIG[region].announcements;
  const [i, setI] = useState(0);
  const [show, setShow] = useState(true);
  useEffect(() => {
    setI(0);
    if (lines.length < 2) return;
    const t = setInterval(() => {
      setShow(false);
      setTimeout(() => {
        setI((n) => (n + 1) % lines.length);
        setShow(true);
      }, 400);
    }, 4200);
    return () => clearInterval(t);
  }, [lines]);
  return (
    <>
      <div className="ann" aria-live="polite">
        <span style={{ opacity: show ? 1 : 0 }}>{lines[i]}</span>
      </div>
      <SaleCountdown />
    </>
  );
}

/** Feed and campaign links can carry ?region=uk|in: switch the storefront to match. */
export function RegionFromUrl() {
  const params = useSearchParams();
  const { region, setRegion } = useStore();
  const wanted = params.get("region");
  useEffect(() => {
    if (isRegion(wanted) && wanted !== region) setRegion(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);
  return null;
}

const CURRENCY_OPTIONS: { region: Region; symbol: string; code: string; country: string }[] = [
  { region: "in", symbol: "₹", code: "INR", country: "India" },
  { region: "uk", symbol: "£", code: "GBP", country: "United Kingdom" },
];

/** Currency switch: ₹ INR | £ GBP (symbols only on narrow phones). Changes prices, sizes and delivery rules site-wide. */
export function RegionPill() {
  const { region, setRegion, switching } = useStore();
  return (
    <div className="cur-switch" role="group" aria-label="Currency and shipping country" aria-busy={switching || undefined}>
      {CURRENCY_OPTIONS.map((o) => {
        const on = region === o.region;
        return (
          <button
            key={o.region}
            type="button"
            aria-pressed={on}
            disabled={switching}
            onClick={() => !on && setRegion(o.region)}
            title={on ? `Shopping in ${o.country} (${o.code})` : `Switch to ${o.country} prices in ${o.code}`}
          >
            <span aria-hidden="true">{o.symbol}</span>
            <span className="cur-code">{o.code}</span>
            <span className="sr-only">{` ${o.country}`}</span>
          </button>
        );
      })}
    </div>
  );
}

export function CountBadge({ kind }: { kind: "cart" | "wish" }) {
  const { cartCount, wishlist } = useStore();
  const n = kind === "cart" ? cartCount : wishlist.length;
  return <em hidden={!n}>{n}</em>;
}

type Option = { id: string; href: string; kind: "link" | "product" | "all"; label: string };

export function SearchBox({ variant }: { variant: "desktop" | "mobile" }) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const { region } = useStore();
  const uid = useId().replace(/:/g, "");
  const listId = `sugg-${variant}-${uid}`;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const cache = useRef(new Map<string, Suggestion>());
  const wrap = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (pathname === "/search") setQ(params.get("q") ?? "");
  }, [pathname, params]);
  useEffect(() => setOpen(false), [pathname]);

  // Debounced fetch of suggestions.
  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 2) {
      setData(null);
      setLoading(false);
      return;
    }
    const key = `${region}|${term.toLowerCase()}`;
    const hit = cache.current.get(key);
    if (hit) {
      setData(hit);
      setActive(-1);
      return;
    }
    const ctl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search/suggest?q=${encodeURIComponent(term)}`, { signal: ctl.signal });
        if (!r.ok) throw new Error(String(r.status));
        const json = (await r.json()) as Suggestion;
        cache.current.set(key, json);
        setData(json);
        setActive(-1);
      } catch {
        if (!ctl.signal.aborted) setData(null);
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, open, region]);

  // Close when focus or a click lands outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | FocusEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("focusin", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("focusin", onDown);
    };
  }, [open]);

  const term = q.trim();
  const options: Option[] = [];
  if (data && term.length >= 2) {
    data.links.forEach((l, i) => options.push({ id: `${listId}-l${i}`, href: l.href, kind: "link", label: l.label }));
    data.products.forEach((p) => options.push({ id: `${listId}-p-${p.slug}`, href: `/p/${p.slug}`, kind: "product", label: p.name }));
    options.push({ id: `${listId}-all`, href: `/search?q=${encodeURIComponent(term)}`, kind: "all", label: `See all results for “${term}”` });
  }
  const showList = open && term.length >= 2 && (options.length > 0 || loading);

  const go = (href: string) => {
    setOpen(false);
    setActive(-1);
    router.push(href);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (active >= 0 && options[active]) return go(options[active].href);
    if (term) go(`/search?q=${encodeURIComponent(term)}`);
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!options.length) return;
      e.preventDefault();
      setOpen(true);
      const n = options.length;
      setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : a <= 0 ? n - 1 : a - 1));
    }
  };

  const optionClass = (i: number) => `flex items-center gap-3 px-3 py-2 cursor-pointer ${i === active ? "bg-stone" : "hover:bg-stone"}`;
  let idx = -1;
  const next = () => ++idx;

  return (
    <form ref={wrap} role="search" className={`${variant === "desktop" ? "sbox" : "msearch"} relative`} onSubmit={submit}>
      <Icon name="search" size={variant === "desktop" ? 16 : 17} />
      <label className="sr-only" htmlFor={`q-${variant}`}>Search</label>
      <input
        id={`q-${variant}`}
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={variant === "mobile" ? "Search sarees, half sarees…" : "Search the store…"}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={active >= 0 && options[active] ? options[active].id : undefined}
      />
      <div
        className={`${showList ? "" : "hidden "}absolute z-50 top-[calc(100%+6px)] ${variant === "desktop" ? "right-0 w-[min(400px,90vw)]" : "left-0 right-0"} bg-paper border border-line shadow-[0_24px_40px_-24px_rgba(27,26,24,.45)] text-ink text-[13px] max-h-[70vh] overflow-y-auto`}
      >
        {data?.correction && (
          <p className="px-3 pt-3 pb-1 text-[12px] text-muted">
            Showing suggestions for <b className="text-ink">{data.correction}</b>
          </p>
        )}
        <ul id={listId} role="listbox" aria-label="Search suggestions" className="py-1.5">
          {loading && !options.length && <li className="px-3 py-3 text-muted" role="presentation">Searching…</li>}
          {data?.links.length ? (
            <li role="presentation" className="px-3 pt-2 pb-1 text-[10px] font-bold tracking-[.2em] uppercase text-muted">Shop</li>
          ) : null}
          {data?.links.map((l) => {
            const i = next();
            return (
              <li key={l.href} id={options[i]?.id} role="option" aria-selected={i === active} className={optionClass(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => go(l.href)} onMouseEnter={() => setActive(i)}>
                <Icon name="search" size={14} />
                <span className="flex-1 min-w-0 truncate">{l.label}</span>
                {l.note && <span className="text-[10.5px] text-muted uppercase tracking-[.12em]">{l.note}</span>}
              </li>
            );
          })}
          {data?.products.length ? (
            <li role="presentation" className="px-3 pt-3 pb-1 text-[10px] font-bold tracking-[.2em] uppercase text-muted">Pieces</li>
          ) : null}
          {data?.products.map((p) => {
            const i = next();
            return (
              <li key={p.slug} id={options[i]?.id} role="option" aria-selected={i === active} className={optionClass(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => go(`/p/${p.slug}`)} onMouseEnter={() => setActive(i)}>
                <span className="relative w-9 aspect-3/4 flex-none bg-stone overflow-hidden">
                  {p.image && <Image src={p.image} alt="" fill sizes="36px" className="object-cover object-[50%_20%]" />}
                </span>
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="truncate">{p.name}</span>
                  <span className="text-[11.5px] text-muted">{p.category}{p.sale ? ` · ${p.sale}` : ""}</span>
                </span>
                <span className="flex flex-col items-end tabular-nums">
                  <b className={p.sale ? "text-sale" : undefined}>{formatMoney(p.price, region)}</b>
                  {p.mrp > 0 && <s className="text-[11px] text-muted">{formatMoney(p.mrp, region)}</s>}
                </span>
              </li>
            );
          })}
          {data && !data.products.length && !data.links.length && !loading && (
            <li role="presentation" className="px-3 py-3 text-muted">No direct matches yet. Press Enter to search everything.</li>
          )}
          {data && (() => {
            const i = next();
            return (
              <li id={options[i]?.id} role="option" aria-selected={i === active} className={`${optionClass(i)} border-t border-line mt-1 font-bold text-[12px] tracking-[.06em]`} onMouseDown={(e) => e.preventDefault()} onClick={() => go(options[i].href)} onMouseEnter={() => setActive(i)}>
                <span className="flex-1">{options[i]?.label}</span>
                <Icon name="chevR" size={14} />
              </li>
            );
          })()}
        </ul>
      </div>
    </form>
  );
}

export function MobileMenu({ nav }: { nav: { label: string; href: string; sale?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const { region, user } = useStore();
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <>
      <button className="burger" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
        <Icon name="menu" />
      </button>
      <Overlay open={open} onClose={() => setOpen(false)} side="left" title="Menu">
        <ul className="drawer-links">
          {nav.map((n) => (
            <li key={n.href}>
              <Link className={n.sale ? "sale" : undefined} href={n.href}>
                {n.label}
                <Icon name="chevR" size={16} />
              </Link>
            </li>
          ))}
        </ul>
        <ul className="drawer-links">
          <li><Link href="/lookbook">Lookbooks<Icon name="chevR" size={16} /></Link></li>
          <li><Link href="/journal">Journal<Icon name="chevR" size={16} /></Link></li>
          <li><Link href="/gift-cards">Gift cards<Icon name="chevR" size={16} /></Link></li>
          <li><Link href="/consult">Book a video consult<Icon name="chevR" size={16} /></Link></li>
          <li><Link href="/wishlist">Wishlist<Icon name="chevR" size={16} /></Link></li>
          <li><Link href={user ? "/account/orders" : "/account/login"}>{user ? "My orders" : "Sign in"}<Icon name="chevR" size={16} /></Link></li>
          <li><Link href="/track">Track order<Icon name="chevR" size={16} /></Link></li>
          <li><Link href="/help/shipping">Shipping &amp; returns<Icon name="chevR" size={16} /></Link></li>
          <li><Link href="/contact">Contact us<Icon name="chevR" size={16} /></Link></li>
        </ul>
        <div className="flex flex-col gap-2 border-t border-line pt-4 text-[13px]">
          <span className="muted">Prices and delivery for</span>
          <div className="flex items-center gap-3">
            <RegionPill />
            <span>{region === "uk" ? "United Kingdom · £ GBP" : "India · ₹ INR"}</span>
          </div>
        </div>
      </Overlay>
    </>
  );
}

/** Publishes the sticky header's live height as --head-h so sticky sidebars/galleries sit just below it. */
export function HeadHeight() {
  useEffect(() => {
    const head = document.querySelector<HTMLElement>(".head");
    if (!head) return;
    const set = () => document.documentElement.style.setProperty("--head-h", `${head.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(head);
    return () => ro.disconnect();
  }, []);
  return null;
}
