"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { Icon } from "../Icon";
import { Overlay } from "../Overlay";
import { ProductCard } from "../ProductCard";
import { useStore } from "../StoreProvider";
import { loadMoreProducts } from "@/lib/actions/catalog";
import { REGION_CONFIG } from "@/lib/region";
import type { ProductDTO } from "@/lib/types";
import {
  EMPTY_FILTERS,
  SORTS,
  filterCount,
  hrefWith,
  swatch,
  titleCase,
  toListingQuery,
  toParams,
  toggle,
  type Facets,
  type FilterState,
  type ListingLink,
  type SortKey,
} from "./filters";

/* ---------- sort select (desktop top bar) ---------- */
export function SortSelect({ base, state }: { base: string; state: FilterState }) {
  const router = useRouter();
  const hidden = toParams({ ...state, sort: undefined, page: undefined });
  return (
    <form className="sortsel" method="get" action={base}>
      {hidden.map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label htmlFor="plp-sort">Sort by</label>
      <select
        id="plp-sort"
        name="sort"
        value={state.sort ?? "relevance"}
        onChange={(e) => router.push(hrefWith(base, state, { sort: e.target.value as SortKey }), { scroll: false })}
      >
        {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <noscript><button type="submit" className="link">Apply</button></noscript>
    </form>
  );
}

/* ---------- product grid with "Load more" ---------- */
export function ListingGrid({
  slug,
  state,
  initial,
  total,
  page,
  pages,
  pageSize,
  base,
}: {
  slug: string;
  state: FilterState;
  initial: ProductDTO[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  base: string;
}) {
  const [items, setItems] = useState(initial);
  const [last, setLast] = useState(page);
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, from + items.length - 1);

  const more = () =>
    start(async () => {
      setErr("");
      try {
        const res = await loadMoreProducts({ ...toListingQuery(slug, state), page: last + 1 });
        setItems((cur) => [...cur, ...res.items.filter((p) => !cur.some((c) => c.slug === p.slug))]);
        setLast(res.page);
      } catch {
        setErr("Could not load more styles. Please try again.");
      }
    });

  return (
    <>
      <div className="pgrid plp-grid">
        {items.map((p, i) => <ProductCard key={p.slug} p={p} priority={i < 3} bag />)}
      </div>
      <nav className="plp-more" aria-label="Pagination">
        <p aria-live="polite">Showing {from}–{to} of {total}</p>
        <div className="plp-meter" aria-hidden="true"><span style={{ width: `${Math.min(100, (to / Math.max(1, total)) * 100)}%` }} /></div>
        {last < pages && (
          <button type="button" className="btn ghost" onClick={more} disabled={pending}>
            {pending ? "Loading…" : "Load more"}
          </button>
        )}
        {err && <p className="notice err">{err}</p>}
        {pages > 1 && <PageLinks base={base} state={state} page={page} pages={pages} />}
      </nav>
    </>
  );
}

function pageList(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((n, i) => {
    if (i && n - sorted[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

function PageLinks({ base, state, page, pages }: { base: string; state: FilterState; page: number; pages: number }) {
  return (
    <ul className="pages">
      {page > 1 && (
        <li><Link href={hrefWith(base, state, { page: page - 1 })} aria-label="Previous page" rel="prev"><Icon name="chevL" size={16} /></Link></li>
      )}
      {pageList(page, pages).map((n, i) =>
        n === "…" ? (
          <li key={`gap${i}`} className="gap">…</li>
        ) : (
          <li key={n}>
            <Link href={hrefWith(base, state, { page: n })} aria-current={n === page ? "page" : undefined}>{n}</Link>
          </li>
        )
      )}
      {page < pages && (
        <li><Link href={hrefWith(base, state, { page: page + 1 })} aria-label="Next page" rel="next"><Icon name="chevR" size={16} /></Link></li>
      )}
    </ul>
  );
}

/* ---------- mobile sticky Sort / Filter bar with bottom sheets ---------- */
type Group = "category" | "fabric" | "colour" | "occasion" | "price" | "size";

export function MobileBar({
  base,
  slug,
  state,
  facets,
  total,
  showCategories,
  links,
}: {
  base: string;
  slug: string;
  state: FilterState;
  facets: Facets;
  total: number;
  showCategories: boolean;
  links: ListingLink[];
}) {
  const router = useRouter();
  const { region } = useStore();
  const r = REGION_CONFIG[region];
  const [sheet, setSheet] = useState<"" | "sort" | "filter">("");
  const [draft, setDraft] = useState<FilterState>(state);
  const [group, setGroup] = useState<Group>(showCategories ? "category" : "fabric");
  const close = useCallback(() => setSheet(""), []);
  const n = filterCount(state);

  const openFilter = () => {
    setDraft(state);
    setSheet("filter");
  };
  const apply = () => {
    setSheet("");
    router.push(hrefWith(base, draft));
  };
  const clear = () => setDraft({ ...EMPTY_FILTERS, q: state.q, exact: state.exact, sort: state.sort });

  const groups: { id: Group; label: string; n: number }[] = [
    ...(showCategories ? [{ id: "category" as const, label: "Category", n: 0 }] : []),
    { id: "fabric", label: "Fabric", n: draft.fabric.length },
    { id: "colour", label: "Colour", n: draft.colour.length },
    { id: "occasion", label: "Occasion", n: draft.occasion.length },
    { id: "price", label: "Price", n: draft.price !== undefined || draft.max ? 1 : 0 },
    { id: "size", label: "Size", n: draft.size ? 1 : 0 },
  ];

  const multi = (key: "fabric" | "colour" | "occasion") =>
    facets[key].map((f) => (
      <label className="mf-opt" key={f.value}>
        <input type="checkbox" checked={draft[key].includes(f.value)} onChange={() => setDraft((d) => ({ ...d, [key]: toggle(d[key], f.value) }))} />
        {key === "colour" && <span className="sw" style={{ background: swatch(f.value) }} />}
        <span>{titleCase(f.value)}</span>
        <em>{f.count}</em>
      </label>
    ));

  return (
    <>
      <div className="plp-mbar">
        <button type="button" onClick={() => setSheet("sort")}>
          <Icon name="sort" size={18} />
          <span>Sort<small>{SORTS.find((s) => s.value === (state.sort ?? "relevance"))?.label}</small></span>
        </button>
        <button type="button" onClick={openFilter}>
          <Icon name="filter" size={18} />
          <span>Filter<small>{n ? `${n} applied` : "None applied"}</small></span>
        </button>
      </div>

      <Overlay open={sheet === "sort"} onClose={close} side="bottom" title="Sort by">
        <ul className="mf-sort">
          {SORTS.map((s) => (
            <li key={s.value}>
              <Link
                href={hrefWith(base, state, { sort: s.value })}
                aria-current={(state.sort ?? "relevance") === s.value ? "true" : undefined}
                onClick={close}
                scroll={false}
              >
                {s.label}
                {(state.sort ?? "relevance") === s.value && <Icon name="check" size={18} />}
              </Link>
            </li>
          ))}
        </ul>
      </Overlay>

      <Overlay
        open={sheet === "filter"}
        onClose={close}
        side="bottom"
        title={`Filter · ${total} styles`}
        footer={
          <>
            <button type="button" className="btn ghost" onClick={clear}>Clear</button>
            <button type="button" className="btn" onClick={apply}>Apply</button>
          </>
        }
      >
        <div className="mf">
          <div className="mf-tabs" role="tablist" aria-orientation="vertical" aria-label="Filter groups">
            {groups.map((g) => (
              <button key={g.id} type="button" role="tab" aria-selected={group === g.id} onClick={() => setGroup(g.id)}>
                {g.label}
                {g.n > 0 && <em>{g.n}</em>}
              </button>
            ))}
          </div>
          <div className="mf-pane" role="tabpanel">
            {group === "category" && (
              <ul className="mf-cats">
                {links.map((c) => (
                  <li key={c.slug}>
                    <Link href={hrefWith(`/c/${c.slug}`, { ...draft, q: undefined })} aria-current={c.slug === slug ? "page" : undefined} onClick={close}>
                      {c.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {group === "fabric" && multi("fabric")}
            {group === "colour" && multi("colour")}
            {group === "occasion" && multi("occasion")}
            {group === "price" &&
              r.priceBands.map((b, i) => (
                <label className="mf-opt" key={b.label}>
                  <input
                    type="radio"
                    name="mf-price"
                    checked={draft.price === i}
                    onChange={() => setDraft((d) => ({ ...d, price: i, max: undefined }))}
                  />
                  <span>{b.label}</span>
                </label>
              ))}
            {group === "size" && (
              <div className="mf-sizes">
                {r.sizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={draft.size === s}
                    onClick={() => setDraft((d) => ({ ...d, size: d.size === s ? undefined : s }))}
                  >
                    {s}
                  </button>
                ))}
                <p className="muted">Free-size pieces are always shown.</p>
              </div>
            )}
          </div>
        </div>
      </Overlay>
    </>
  );
}
