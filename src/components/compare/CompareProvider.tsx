"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { useStore } from "../StoreProvider";

/* Compare up to three pieces side by side. The picks live in localStorage so they survive reloads and sync across tabs. */
export type CompareItem = { slug: string; name: string; image: string };
type Ctx = { items: CompareItem[]; has: (slug: string) => boolean; toggle: (p: { slug: string; name: string; images: string[] }) => void; remove: (slug: string) => void; clear: () => void };

export const COMPARE_KEY = "mg_compare_v1";
export const COMPARE_MAX = 3;

const CompareCtx = createContext<Ctx | null>(null);
/** Null outside the store layout, so callers can hide their compare buttons. */
export const useCompare = () => useContext(CompareCtx);

export function readCompare(): CompareItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(COMPARE_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x): x is CompareItem => x && typeof x.slug === "string" && typeof x.name === "string").slice(0, COMPARE_MAX) : [];
  } catch {
    return [];
  }
}

export function CompareProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useStore();
  const [items, setItems] = useState<CompareItem[]>([]);

  useEffect(() => {
    setItems(readCompare());
    const on = (e: StorageEvent) => e.key === COMPARE_KEY && setItems(readCompare());
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
  }, []);

  const save = useCallback((next: CompareItem[]) => {
    setItems(next);
    try {
      localStorage.setItem(COMPARE_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const toggle = useCallback<Ctx["toggle"]>(
    (p) => {
      const cur = readCompare();
      if (cur.some((i) => i.slug === p.slug)) return save(cur.filter((i) => i.slug !== p.slug));
      if (cur.length >= COMPARE_MAX) {
        toast({ text: `You can compare up to ${COMPARE_MAX} pieces. Remove one first.`, href: "/compare", cta: "Compare" });
        return;
      }
      save([...cur, { slug: p.slug, name: p.name, image: p.images[0] ?? "" }]);
      if (cur.length === 0) toast({ text: "Added to compare. Pick one or two more.", image: p.images[0] });
    },
    [save, toast]
  );

  const value = useMemo<Ctx>(
    () => ({
      items,
      has: (slug) => items.some((i) => i.slug === slug),
      toggle,
      remove: (slug) => save(readCompare().filter((i) => i.slug !== slug)),
      clear: () => save([]),
    }),
    [items, toggle, save]
  );

  return (
    <CompareCtx.Provider value={value}>
      {children}
      <CompareTray />
    </CompareCtx.Provider>
  );
}

/** Small "Compare" switch for cards and the product page. */
export function CompareToggle({ p, className = "" }: { p: { slug: string; name: string; images: string[] }; className?: string }) {
  const c = useCompare();
  if (!c) return null;
  const on = c.has(p.slug);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => c.toggle(p)}
      className={`inline-flex items-center gap-1.5 self-start text-[11px] font-bold tracking-[.12em] uppercase text-muted hover:text-ink aria-pressed:text-ink ${className}`}
      aria-label={on ? `Remove ${p.name} from compare` : `Add ${p.name} to compare`}
    >
      <span aria-hidden="true" className={`grid place-items-center size-3.5 border ${on ? "bg-ink border-ink text-white" : "border-[#BDB5A8] bg-paper"}`}>
        {on && <Icon name="check" size={10} />}
      </span>
      Compare
    </button>
  );
}

function CompareTray() {
  const c = useCompare();
  const pathname = usePathname();
  if (!c || !c.items.length || pathname === "/compare" || pathname.startsWith("/checkout")) return null;
  const n = c.items.length;
  return (
    <>
      {/* phones: compact pill above the app bar */}
      <Link
        href="/compare"
        className="md:hidden fixed z-46 left-4 bottom-[calc(140px+env(safe-area-inset-bottom,0px))] flex items-center gap-2 bg-ink text-white rounded-full pl-2 pr-4 h-11 shadow-[0_10px_30px_-10px_rgba(27,26,24,.6)] text-[11px] font-bold tracking-[.14em] uppercase"
        aria-label={`Compare ${n} selected piece${n > 1 ? "s" : ""}`}
      >
        <span className="flex -space-x-2">
          {c.items.map((i) => (
            <span key={i.slug} className="relative size-7 rounded-full overflow-hidden border-2 border-ink bg-stone">
              {i.image && <Image src={i.image} alt="" fill sizes="28px" className="object-cover" />}
            </span>
          ))}
        </span>
        Compare ({n})
      </Link>

      {/* tablets and desktop: tray */}
      <aside
        aria-label="Compare tray"
        className="hidden md:flex fixed z-46 left-(--gutter) bottom-18 lg:bottom-5 items-center gap-3 bg-paper border border-ink p-2.5 shadow-[0_20px_40px_-20px_rgba(27,26,24,.45)] max-w-[calc(100vw-2*var(--gutter)-210px)]"
      >
        <ul className="flex gap-2">
          {c.items.map((i) => (
            <li key={i.slug} className="relative">
              <Link href={`/p/${i.slug}`} className="relative block w-12 aspect-3/4 bg-stone overflow-hidden" title={i.name}>
                {i.image && <Image src={i.image} alt={i.name} fill sizes="48px" className="object-cover object-[50%_20%]" />}
              </Link>
              <button
                type="button"
                onClick={() => c.remove(i.slug)}
                className="absolute -top-2 -right-2 size-5 rounded-full bg-ink text-white grid place-items-center"
                aria-label={`Remove ${i.name} from compare`}
              >
                <Icon name="x" size={11} />
              </button>
            </li>
          ))}
          {Array.from({ length: COMPARE_MAX - n }, (_, i) => (
            <li key={`e${i}`} aria-hidden="true" className="w-12 aspect-3/4 border border-dashed border-line" />
          ))}
        </ul>
        <div className="flex flex-col gap-1.5 pl-1">
          <Link className="btn h-10! px-4! text-[11px]!" href="/compare" aria-disabled={n < 2}>
            Compare {n}/{COMPARE_MAX}
          </Link>
          <button type="button" onClick={c.clear} className="text-[11px] font-semibold text-muted underline underline-offset-2 hover:text-ink">
            Clear
          </button>
        </div>
      </aside>
    </>
  );
}
