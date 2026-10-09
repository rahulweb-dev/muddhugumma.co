"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveBundle, saveLookbook, saveSale, type BundleInput, type LookbookInput, type SaleInput } from "@/lib/actions/merch";
import { DeleteButton, ImageField, Msg, ProductPicker, fieldErr } from "./ui";
import { FESTIVALS, istInputToIso, isoToIstInput, slugify, type PickedProduct, type Result } from "./shared";

/* ---------- shared bits ---------- */
function useSave(basePath: string, isNew: boolean) {
  const router = useRouter();
  const [res, setRes] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const save = (fn: () => Promise<Result>) => {
    setRes(null);
    start(async () => {
      const r = await fn();
      setRes(r);
      if (r.ok) {
        if (isNew && r.id) router.replace(`${basePath}/${r.id}`);
        router.refresh();
      }
    });
  };
  return { res, pending, save };
}

function SlugInput({ id, prefix, value, onChange, onReset, res }: { id: string; prefix: string; value: string; onChange: (v: string) => void; onReset?: () => void; res: Result | null }) {
  return (
    <div className="field">
      <label htmlFor={id}>Slug (web address)</label>
      <div className="adm-prefix">
        <span>{prefix}</span>
        <input id={id} value={value} maxLength={100} aria-invalid={!!(res && !res.ok && res.fields?.slug)} onChange={(e) => onChange(slugify(e.target.value) + (e.target.value.endsWith("-") ? "-" : ""))} />
        {onReset ? <button type="button" className="adm-more" onClick={onReset}>From title</button> : null}
      </div>
      {fieldErr(res, "slug")}
    </div>
  );
}

const Check = ({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) => (
  <label className="check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {children}</label>
);

/* ---------- lookbooks ---------- */
export type LookbookView = { id: string; title: string; slug: string; festival: string; intro: string; hero: string; products: PickedProduct[]; active: boolean; sort: number };

export function LookbookForm({ lookbook, uploadsEnabled }: { lookbook: LookbookView | null; uploadsEnabled: boolean }) {
  const [f, setF] = useState(() => ({
    title: lookbook?.title ?? "",
    slug: lookbook?.slug ?? "",
    festival: lookbook?.festival ?? "",
    intro: lookbook?.intro ?? "",
    hero: lookbook?.hero ?? "",
    products: lookbook?.products ?? [],
    active: lookbook?.active ?? false,
    sort: String(lookbook?.sort ?? 0),
  }));
  const [slugTouched, setSlugTouched] = useState(Boolean(lookbook));
  const { res, pending, save } = useSave("/admin/lookbooks", !lookbook);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: LookbookInput = { id: lookbook?.id, title: f.title, slug: f.slug, festival: f.festival, intro: f.intro, hero: f.hero, productSlugs: f.products.map((p) => p.slug), active: f.active, sort: Math.round(Number(f.sort) || 0) };
    save(() => saveLookbook(input));
  };

  return (
    <form className="adm-form" onSubmit={submit} noValidate>
      <section className="adm-card">
        <div className="adm-grid3">
          <div className="field col-span-2">
            <label htmlFor="lb-title">Title</label>
            <input id="lb-title" value={f.title} maxLength={120} placeholder="Diwali at home: silks in jewel tones" aria-invalid={!!(res && !res.ok && res.fields?.title)} onChange={(e) => { const title = e.target.value; setF((x) => ({ ...x, title, slug: slugTouched ? x.slug : slugify(title) })); }} />
            {fieldErr(res, "title")}
          </div>
          <div className="field">
            <label htmlFor="lb-fest">Festival or occasion</label>
            <input id="lb-fest" list="lb-festivals" value={f.festival} maxLength={60} placeholder="Diwali" onChange={(e) => set("festival", e.target.value)} />
            <datalist id="lb-festivals">{FESTIVALS.map((x) => <option key={x} value={x} />)}</datalist>
          </div>
        </div>
        <SlugInput id="lb-slug" prefix="/lookbook/" value={f.slug} res={res} onChange={(v) => { setSlugTouched(true); set("slug", v); }} onReset={slugTouched && f.title ? () => { setSlugTouched(false); set("slug", slugify(f.title)); } : undefined} />
        <div className="field">
          <label htmlFor="lb-intro">Intro</label>
          <textarea id="lb-intro" value={f.intro} maxLength={1500} placeholder="Two or three sentences that set the mood: the colours, fabrics and moments this edit is for." onChange={(e) => set("intro", e.target.value)} />
          {fieldErr(res, "intro")}
        </div>
        <ImageField id="lb-hero" label="Hero image" value={f.hero} onChange={(v) => set("hero", v)} folder="/lookbooks" uploadsEnabled={uploadsEnabled} placeholder="lookbooks/diwali-hero.webp" aspect="aspect-[16/9]" />
        {fieldErr(res, "hero")}
      </section>

      <section className="adm-card">
        <ProductPicker value={f.products} onChange={(v) => set("products", v)} label="Products, in display order" />
        {fieldErr(res, "productSlugs")}
      </section>

      <section className="adm-card">
        <div className="adm-grid3">
          <div className="field">
            <label htmlFor="lb-sort">Sort order</label>
            <input id="lb-sort" type="number" step={1} value={f.sort} onChange={(e) => set("sort", e.target.value)} />
            <small className="muted">Lower numbers show first.</small>
          </div>
          <div className="adm-check-pad flex items-center">
            <Check checked={f.active} onChange={(v) => set("active", v)}>Live on the store</Check>
          </div>
        </div>
      </section>

      <div className="adm-savebar">
        <span className="muted adm-small">{f.products.length} product{f.products.length === 1 ? "" : "s"} · {f.active ? "Live" : "Hidden"}</span>
        <button className="btn adm-btn" disabled={pending}>{pending ? "Saving…" : lookbook ? "Save changes" : "Create lookbook"}</button>
      </div>
      <Msg res={res} />
      {lookbook ? (
        <section className="adm-card adm-danger">
          <h2 className="h3">Delete lookbook</h2>
          <DeleteButton kind="lookbook" id={lookbook.id} label="Delete lookbook" confirmText={`Delete "${lookbook.title}"? Products stay in the catalogue.`} after="/admin/lookbooks" />
        </section>
      ) : null}
    </form>
  );
}

/* ---------- bundles ---------- */
export type BundleView = { id: string; name: string; slug: string; description: string; image: string; products: PickedProduct[]; active: boolean };

export function BundleForm({ bundle, uploadsEnabled }: { bundle: BundleView | null; uploadsEnabled: boolean }) {
  const [f, setF] = useState(() => ({
    name: bundle?.name ?? "",
    slug: bundle?.slug ?? "",
    description: bundle?.description ?? "",
    image: bundle?.image ?? "",
    products: bundle?.products ?? [],
    active: bundle?.active ?? false,
  }));
  const [slugTouched, setSlugTouched] = useState(Boolean(bundle));
  const { res, pending, save } = useSave("/admin/bundles", !bundle);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: BundleInput = { id: bundle?.id, name: f.name, slug: f.slug, description: f.description, image: f.image, productSlugs: f.products.map((p) => p.slug), active: f.active };
    save(() => saveBundle(input));
  };

  return (
    <form className="adm-form" onSubmit={submit} noValidate>
      <section className="adm-card">
        <div className="field">
          <label htmlFor="bd-name">Name</label>
          <input id="bd-name" value={f.name} maxLength={120} placeholder="The complete Kanjivaram look" aria-invalid={!!(res && !res.ok && res.fields?.name)} onChange={(e) => { const name = e.target.value; setF((x) => ({ ...x, name, slug: slugTouched ? x.slug : slugify(name) })); }} />
          {fieldErr(res, "name")}
        </div>
        <SlugInput id="bd-slug" prefix="/bundle/" value={f.slug} res={res} onChange={(v) => { setSlugTouched(true); set("slug", v); }} onReset={slugTouched && f.name ? () => { setSlugTouched(false); set("slug", slugify(f.name)); } : undefined} />
        <div className="field">
          <label htmlFor="bd-desc">Description</label>
          <textarea id="bd-desc" value={f.description} maxLength={1000} placeholder="What goes together and why: the saree, a contrast blouse and the dupatta that finishes it." onChange={(e) => set("description", e.target.value)} />
          {fieldErr(res, "description")}
        </div>
        <ImageField id="bd-img" label="Bundle image" value={f.image} onChange={(v) => set("image", v)} folder="/bundles" uploadsEnabled={uploadsEnabled} placeholder="bundles/kanjivaram-look.webp" aspect="aspect-[3/4]" />
        {fieldErr(res, "image")}
      </section>

      <section className="adm-card">
        <ProductPicker value={f.products} onChange={(v) => set("products", v)} max={8} label="Products in the bundle" />
        {fieldErr(res, "productSlugs")}
      </section>

      <div className="adm-savebar">
        <Check checked={f.active} onChange={(v) => set("active", v)}>Live on the store</Check>
        <button className="btn adm-btn" disabled={pending}>{pending ? "Saving…" : bundle ? "Save changes" : "Create bundle"}</button>
      </div>
      <Msg res={res} />
      {bundle ? (
        <section className="adm-card adm-danger">
          <h2 className="h3">Delete bundle</h2>
          <DeleteButton kind="bundle" id={bundle.id} label="Delete bundle" confirmText={`Delete "${bundle.name}"?`} after="/admin/bundles" />
        </section>
      ) : null}
    </form>
  );
}

/* ---------- timed sales ---------- */
export type SaleView = { id: string; name: string; banner: string; percentOff: number; categories: string[]; collections: string[]; products: PickedProduct[]; regions: string[]; startsAt: string; endsAt: string; active: boolean };

const COLS = [{ v: "bridal", l: "Bridal" }, { v: "festive", l: "Festive" }, { v: "new", l: "New in" }] as const;
const toggle = (list: string[], v: string, on: boolean) => (on ? [...new Set([...list, v])] : list.filter((x) => x !== v));

export function SaleForm({ sale, defaults, categories }: { sale: SaleView | null; defaults: { startsAt: string; endsAt: string }; categories: { slug: string; name: string }[] }) {
  const CATS = categories.map((c) => ({ v: c.slug, l: c.name }));
  const [f, setF] = useState(() => ({
    name: sale?.name ?? "",
    banner: sale?.banner ?? "",
    percentOff: String(sale?.percentOff ?? 20),
    categories: sale?.categories ?? [],
    collections: sale?.collections ?? [],
    products: sale?.products ?? [],
    regions: sale?.regions ?? ["in", "uk"],
    startsAt: isoToIstInput(sale?.startsAt ?? defaults.startsAt),
    endsAt: isoToIstInput(sale?.endsAt ?? defaults.endsAt),
    active: sale?.active ?? true,
  }));
  const { res, pending, save } = useSave("/admin/sales", !sale);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const pct = Number(f.percentOff);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: SaleInput = {
      id: sale?.id,
      name: f.name,
      banner: f.banner,
      percentOff: Number.isFinite(pct) ? pct : 0,
      categories: f.categories as SaleInput["categories"],
      collections: f.collections as SaleInput["collections"],
      slugs: f.products.map((p) => p.slug),
      regions: f.regions as SaleInput["regions"],
      startsAt: istInputToIso(f.startsAt),
      endsAt: istInputToIso(f.endsAt),
      active: f.active,
    };
    save(() => saveSale(input));
  };

  return (
    <form className="adm-form" onSubmit={submit} noValidate>
      <section className="adm-card">
        <div className="adm-grid3">
          <div className="field col-span-2">
            <label htmlFor="sl-name">Name (staff only)</label>
            <input id="sl-name" value={f.name} maxLength={80} placeholder="Diwali silk sale 2026" aria-invalid={!!(res && !res.ok && res.fields?.name)} onChange={(e) => set("name", e.target.value)} />
            {fieldErr(res, "name")}
          </div>
          <div className="field">
            <label htmlFor="sl-pct">Percent off</label>
            <div className="adm-prefix">
              <input id="sl-pct" type="number" inputMode="numeric" min={1} max={80} step={1} value={f.percentOff} aria-invalid={!!(res && !res.ok && res.fields?.percentOff)} onChange={(e) => set("percentOff", e.target.value)} />
              <span className="pr-3">%</span>
            </div>
            {fieldErr(res, "percentOff")}
            {pct > 50 && pct <= 80 ? <small className="text-sale">That&apos;s a deep discount: check margins.</small> : null}
          </div>
        </div>
        <div className="field">
          <label htmlFor="sl-banner">Banner text (shown to shoppers)</label>
          <input id="sl-banner" value={f.banner} maxLength={140} placeholder="Diwali sale: 20% off silk sarees, ends Sunday midnight" onChange={(e) => set("banner", e.target.value)} />
          {fieldErr(res, "banner")}
        </div>
      </section>

      <section className="adm-card">
        <h2 className="h3">Applies to</h2>
        <p className="muted adm-small">A product is on sale if it matches any of these: a chosen category, a chosen collection, or picked by name.</p>
        <fieldset className="adm-fs">
          <legend>Categories</legend>
          <div className="adm-checks">{CATS.map((c) => <Check key={c.v} checked={f.categories.includes(c.v)} onChange={(on) => set("categories", toggle(f.categories, c.v, on))}>{c.l}</Check>)}</div>
        </fieldset>
        <fieldset className="adm-fs">
          <legend>Collections</legend>
          <div className="adm-checks">{COLS.map((c) => <Check key={c.v} checked={f.collections.includes(c.v)} onChange={(on) => set("collections", toggle(f.collections, c.v, on))}>{c.l}</Check>)}</div>
        </fieldset>
        <ProductPicker value={f.products} onChange={(v) => set("products", v)} label="Specific products" />
        {fieldErr(res, "targets")}
      </section>

      <section className="adm-card">
        <h2 className="h3">Where and when</h2>
        <fieldset className="adm-fs">
          <legend>Regions</legend>
          <div className="adm-checks">
            <Check checked={f.regions.includes("in")} onChange={(on) => set("regions", toggle(f.regions, "in", on))}>India (₹)</Check>
            <Check checked={f.regions.includes("uk")} onChange={(on) => set("regions", toggle(f.regions, "uk", on))}>United Kingdom (£)</Check>
          </div>
          {fieldErr(res, "regions")}
        </fieldset>
        <div className="adm-grid3">
          <div className="field">
            <label htmlFor="sl-start">Starts (IST)</label>
            <input id="sl-start" type="datetime-local" value={f.startsAt} aria-invalid={!!(res && !res.ok && res.fields?.startsAt)} onChange={(e) => set("startsAt", e.target.value)} />
            {fieldErr(res, "startsAt")}
          </div>
          <div className="field">
            <label htmlFor="sl-end">Ends (IST)</label>
            <input id="sl-end" type="datetime-local" value={f.endsAt} min={f.startsAt || undefined} aria-invalid={!!(res && !res.ok && res.fields?.endsAt)} onChange={(e) => set("endsAt", e.target.value)} />
            {fieldErr(res, "endsAt")}
          </div>
          <div className="adm-check-pad flex items-end">
            <Check checked={f.active} onChange={(v) => set("active", v)}>Switched on</Check>
          </div>
        </div>
        <p className="muted adm-small">Times are India time. 00:00 IST is 18:30 the previous evening in London (19:30 in winter).</p>
      </section>

      <div className="adm-savebar">
        <span className="muted adm-small">{Number.isFinite(pct) && pct > 0 ? `${pct}% off` : "Set a discount"} · {f.regions.map((r) => (r === "uk" ? "UK" : "India")).join(" + ") || "no region"}</span>
        <button className="btn adm-btn" disabled={pending}>{pending ? "Saving…" : sale ? "Save changes" : "Create sale"}</button>
      </div>
      <Msg res={res} />
      {sale ? (
        <section className="adm-card adm-danger">
          <h2 className="h3">Delete sale</h2>
          <p className="muted adm-small">To stop a sale early, switch it off instead: that keeps the record.</p>
          <DeleteButton kind="sale" id={sale.id} label="Delete sale" confirmText={`Delete "${sale.name}"?`} after="/admin/sales" />
        </section>
      ) : null}
    </form>
  );
}
