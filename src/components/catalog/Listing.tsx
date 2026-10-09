// Shared category / search listing: filter sidebar (plain links, works without JS), applied chips, sort, grid, pagination.
import Link from "next/link";
import { Icon } from "../Icon";
import { ListingGrid, MobileBar, SortSelect } from "./ListingClient";
import { REGION_CONFIG, type Region } from "@/lib/region";
import type { ProductDTO } from "@/lib/types";
import { activeCategories } from "@/lib/categories";
import {
  listingLinks,
  appliedChips,
  clearedHref,
  filterCount,
  hrefWith,
  swatch,
  titleCase,
  toggle,
  type Facet,
  type ListingLink,
  type Facets,
  type FilterState,
} from "./filters";

export type ListingResult = { items: ProductDTO[]; total: number; page: number; pages: number; facets: Facets };

type Props = {
  base: string; // "/c/sarees" or "/search"
  slug: string; // listing key used for the query
  state: FilterState;
  result: ListingResult;
  region: Region;
  pageSize: number;
  showCategories?: boolean;
};

function Opt({ href, on, children, count, radio }: { href: string; on: boolean; children: React.ReactNode; count?: number; radio?: boolean }) {
  return (
    <li>
      <Link className={`opt${radio ? " radio" : ""}`} href={href} role={radio ? "radio" : "checkbox"} aria-checked={on} scroll={false} rel="nofollow">
        <span className="box" aria-hidden="true">{on && <Icon name="check" size={12} />}</span>
        <span className="lbl">{children}</span>
        {count !== undefined && <em>{count}</em>}
      </Link>
    </li>
  );
}

function Group({ title, n, children, open = true }: { title: string; n?: number; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="fg" open={open}>
      <summary>
        <span>{title}{n ? <em>{n}</em> : null}</span>
        <Icon name="chevD" size={16} />
      </summary>
      <ul>{children}</ul>
    </details>
  );
}

function FilterSidebar({ base, slug, state, facets, region, showCategories, links }: Omit<Props, "result" | "pageSize"> & { facets: Facets; links: ListingLink[] }) {
  const r = REGION_CONFIG[region];
  const multi = (key: "fabric" | "colour" | "occasion", list: Facet[]) =>
    list.map((f) => (
      <Opt key={f.value} href={hrefWith(base, state, { [key]: toggle(state[key], f.value) })} on={state[key].includes(f.value)} count={f.count}>
        {key === "colour" && <span className="sw" style={{ background: swatch(f.value) }} />}
        {titleCase(f.value)}
      </Opt>
    ));
  return (
    <aside className="plp-side" aria-label="Filters">
      <div className="side-head">
        <b className="h3">Filters</b>
        {filterCount(state) > 0 && <Link className="link" href={clearedHref(base, state)}>Clear all</Link>}
      </div>
      {showCategories && (
        <Group title="Category">
          {links.map((c) => (
            <li key={c.slug}>
              <Link className="cat-l" href={hrefWith(`/c/${c.slug}`, { ...state, q: undefined })} aria-current={c.slug === slug ? "page" : undefined}>
                {c.label}
              </Link>
            </li>
          ))}
        </Group>
      )}
      {facets.fabric.length > 0 && <Group title="Fabric" n={state.fabric.length}>{multi("fabric", facets.fabric)}</Group>}
      {facets.colour.length > 0 && (
        <Group title="Colour" n={state.colour.length}>
          {multi("colour", facets.colour)}
        </Group>
      )}
      {facets.occasion.length > 0 && <Group title="Occasion" n={state.occasion.length}>{multi("occasion", facets.occasion)}</Group>}
      <Group title="Price" n={state.price !== undefined || state.max ? 1 : 0}>
        {r.priceBands.map((b, i) => (
          <Opt key={b.label} radio href={hrefWith(base, state, { price: state.price === i ? undefined : i, max: undefined })} on={state.price === i}>
            {b.label}
          </Opt>
        ))}
      </Group>
      <Group title="Size" n={state.size ? 1 : 0}>
        <li className="size-row">
          {r.sizes.map((s) => (
            <Link key={s} href={hrefWith(base, state, { size: state.size === s ? undefined : s })} aria-pressed={state.size === s} scroll={false} rel="nofollow">
              {s.replace("UK ", "")}
            </Link>
          ))}
        </li>
      </Group>
    </aside>
  );
}

export function EmptyListing({ base, state, region, links }: { base: string; state: FilterState; region: Region; links: ListingLink[] }) {
  const filtered = filterCount(state) > 0;
  return (
    <div className="empty plp-empty">
      <span className="kick">Nothing here yet</span>
      <h2 className="h2">No styles <i>match</i></h2>
      <p>
        {filtered
          ? "Try removing a filter or two. Our weaves are made in small runs, so some combinations sell through quickly."
          : state.q
            ? `We couldn't find anything for “${state.q}”. Check the spelling or try a broader word like “silk” or “kurta”.`
            : "This edit is being restocked. Have a look at the rest of the house in the meantime."}
      </p>
      <div className="cta-row">
        {filtered && <Link className="btn" href={clearedHref(base, state)}>Clear filters</Link>}
        <Link className="btn ghost" href="/c/all">Shop all</Link>
      </div>
      <div className="sugg">
        <small>Popular right now</small>
        <div>
          {links.slice(2, -1).map((c) => <Link className="chip" key={c.slug} href={`/c/${c.slug}`}>{c.label}</Link>)}
          <Link className="chip" href={region === "in" ? "/c/all?max=2000&sort=price-asc" : "/c/all?max=25&sort=price-asc"}>
            Under {region === "in" ? "₹2,000" : "£25"}
          </Link>
        </div>
      </div>
    </div>
  );
}

export async function Listing({ base, slug, state, result, region, pageSize, showCategories = true }: Props) {
  const links = listingLinks(await activeCategories());
  const chips = appliedChips(base, state, region);
  const listKey = new URLSearchParams(Object.entries({ slug, ...Object.fromEntries(Object.entries(state).map(([k, v]) => [k, String(v ?? "")])) })).toString();
  return (
    <div className="plp-body">
      <FilterSidebar base={base} slug={slug} state={state} facets={result.facets} region={region} showCategories={showCategories} links={links} />
      <div className="plp-main">
        <div className="plp-bar">
          <div className="applied">
            <span className="cnt">{result.total} {result.total === 1 ? "style" : "styles"}</span>
            {chips.map((c) => (
              <Link key={c.key} className="chip" href={c.href} scroll={false} aria-label={`Remove filter ${c.label}`}>
                {c.label}
                <Icon name="x" />
              </Link>
            ))}
            {chips.length > 1 && <Link className="clear" href={clearedHref(base, state)}>Clear all</Link>}
          </div>
          <SortSelect base={base} state={state} />
        </div>
        {result.items.length ? (
          <ListingGrid
            key={listKey}
            slug={slug}
            state={state}
            initial={result.items}
            total={result.total}
            page={result.page}
            pages={result.pages}
            pageSize={pageSize}
            base={base}
          />
        ) : (
          <EmptyListing base={base} state={state} region={region} links={links} />
        )}
      </div>
      <MobileBar key={`m-${listKey}`} base={base} slug={slug} state={state} facets={result.facets} total={result.total} showCategories={showCategories} links={links} />
    </div>
  );
}
