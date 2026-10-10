"use client";
import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCategory, saveCategory } from "@/lib/actions/site";
import { ImageField, Msg, fieldErr } from "../content/ui";
import { slugify, type Result } from "../content/shared";
import { IMAGE_FOCUS, focusPosition, type ImageFocus } from "@/lib/image-focus";

export type CategoryView = { id: string; name: string; slug: string; kicker: string; blurb: string; image: string; imageFocus: string; sort: number; active: boolean; inNav: boolean };

export function CategoryForm({ category, productCount, nextSort, uploadsEnabled }: { category: CategoryView | null; productCount: number; nextSort: number; uploadsEnabled: boolean }) {
  const router = useRouter();
  const [f, setF] = useState(() => ({
    name: category?.name ?? "",
    slug: category?.slug ?? "",
    kicker: category?.kicker ?? "",
    blurb: category?.blurb ?? "",
    image: category?.image ?? "",
    imageFocus: (category?.imageFocus ?? "top") as ImageFocus,
    sort: String(category?.sort ?? nextSort),
    active: category?.active ?? true,
    inNav: category?.inNav ?? true,
  }));
  const [slugTouched, setSlugTouched] = useState(Boolean(category));
  const [res, setRes] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const slugChanged = category && f.slug !== category.slug;

  const submit = () => {
    setRes(null);
    start(async () => {
      const r = await saveCategory({ id: category?.id, ...f, sort: Number(f.sort) || 0 });
      setRes(r);
      if (r.ok) {
        if (!category && r.id) router.replace(`/admin/categories/${r.id}`);
        router.refresh();
      }
    });
  };
  const remove = () =>
    start(async () => {
      const r = await deleteCategory(category!.id);
      setRes(r);
      if (r.ok) router.push("/admin/categories");
    });

  return (
    <form className="adm-form" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <section className="adm-card">
        <div className="form-grid two">
          <div className="field">
            <label htmlFor="c-name">Name</label>
            <input
              id="c-name"
              value={f.name}
              maxLength={60}
              placeholder="Half Sarees"
              aria-invalid={!!(res && !res.ok && res.fields?.name)}
              onChange={(e) => {
                const name = e.target.value;
                setF((x) => ({ ...x, name, slug: slugTouched ? x.slug : slugify(name) }));
              }}
            />
            {fieldErr(res, "name")}
          </div>
          <div className="field">
            <label htmlFor="c-slug">Web address</label>
            <div className="adm-prefix">
              <span>/c/</span>
              <input id="c-slug" value={f.slug} maxLength={60} aria-invalid={!!(res && !res.ok && res.fields?.slug)} onChange={(e) => { setSlugTouched(true); set("slug", slugify(e.target.value) + (e.target.value.endsWith("-") ? "-" : "")); }} />
            </div>
            {fieldErr(res, "slug") ?? (slugChanged ? <small className="muted">Saving moves its {productCount} products to the new address. Old links to /c/{category!.slug} will stop working.</small> : null)}
          </div>
          <div className="field">
            <label htmlFor="c-kicker">Small heading (optional)</label>
            <input id="c-kicker" value={f.kicker} maxLength={60} placeholder="Six yards of grace" onChange={(e) => set("kicker", e.target.value)} />
            <small className="muted">Shown above the category title and on homepage tiles.</small>
          </div>
          <div className="field">
            <label htmlFor="c-sort">Menu order</label>
            <input id="c-sort" type="number" inputMode="numeric" min={0} max={999} value={f.sort} aria-invalid={!!(res && !res.ok && res.fields?.sort)} onChange={(e) => set("sort", e.target.value)} />
            {fieldErr(res, "sort") ?? <small className="muted">Lower numbers come first.</small>}
          </div>
          <div className="field full">
            <label htmlFor="c-blurb">Description ({f.blurb.length}/300)</label>
            <textarea id="c-blurb" rows={3} maxLength={300} value={f.blurb} placeholder="One or two sentences shown at the top of the category page." onChange={(e) => set("blurb", e.target.value)} />
            {fieldErr(res, "blurb")}
          </div>
        </div>
        <ImageField id="c-image" label="Image (category page banner and homepage tile)" value={f.image} onChange={(v) => set("image", v)} folder="/categories" uploadsEnabled={uploadsEnabled} placeholder="categories/sarees.jpg" aspect="aspect-[3/4]" />
        <small className="muted">No image? The homepage uses the newest product&apos;s photo instead.</small>
        <div className="field">
          <label htmlFor="c-focus">Photo focus (what stays visible when the photo is cropped)</label>
          <select id="c-focus" value={f.imageFocus} onChange={(e) => set("imageFocus", e.target.value as ImageFocus)}>
            {IMAGE_FOCUS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {f.image ? (
            <div className="cat-focus-preview" aria-label="Banner preview">
              <span>Banner preview</span>
              <div><Image src={f.image} alt="" fill sizes="420px" style={{ objectFit: "cover", objectPosition: focusPosition(f.imageFocus) }} /></div>
            </div>
          ) : null}
        </div>
        {fieldErr(res, "image")}
        <label className="check">
          <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Live in the shop
        </label>
        <label className="check">
          <input type="checkbox" checked={f.inNav} onChange={(e) => set("inNav", e.target.checked)} /> Show in the main menu and footer
        </label>
      </section>

      <Msg res={res} />
      <div className="adm-savebar">
        <span className="adm-small">
          {category ? (
            confirm ? (
              <span className="adm-row">
                Delete {category.name}?
                <button type="button" className="adm-more text-sale!" onClick={remove} disabled={pending}>Yes, delete</button>
                <button type="button" className="adm-more" onClick={() => setConfirm(false)}>Keep it</button>
              </span>
            ) : (
              <button type="button" className="adm-more" onClick={() => setConfirm(true)}>Delete category</button>
            )
          ) : (
            "New categories appear in the menu straight away."
          )}
        </span>
        <button className="btn adm-btn" disabled={pending}>{pending ? "Saving…" : "Save category"}</button>
      </div>
    </form>
  );
}
