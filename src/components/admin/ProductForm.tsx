"use client";
import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { saveProduct, toggleProductActive, type ActionResult, type ProductInput } from "@/lib/actions/admin";
import type { ProductDTO } from "@/lib/types";
import type { ProductExtras, ProductFormOptions } from "@/lib/admin-data";

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;
const UK_LABEL: Record<(typeof SIZES)[number], string> = { XS: "UK 6", S: "UK 8", M: "UK 10", L: "UK 12", XL: "UK 14", XXL: "UK 16" };
const COLLECTIONS = [
  { value: "bridal", label: "Bridal" },
  { value: "festive", label: "Festive" },
  { value: "new", label: "New in" },
  { value: "bestseller", label: "Bestseller" },
] as const;
const OCCASIONS = ["wedding", "festive", "party", "office", "everyday"] as const;
// Colour family (for the colour filter) and its default swatch. "" = not applicable, e.g. jewellery.
const COLOURS: Record<ProductInput["colour"], string> = {
  red: "#8E1B2C",
  pink: "#D8457F",
  orange: "#D9772B",
  yellow: "#E2B73A",
  green: "#1D5A3A",
  blue: "#2E4E7A",
  purple: "#6E2450",
  brown: "#7A4A2A",
  black: "#1B1A18",
  ivory: "#F4EEE4",
  gold: "#B8913F",
  multi: "#9A744A",
  "": "#CCCCCC",
};

type Category = ProductInput["category"];
type Colour = ProductInput["colour"];
type Collection = ProductInput["collections"][number];
type Occasion = ProductInput["occasions"][number];

type FormState = {
  name: string;
  slug: string;
  category: Category;
  collections: Collection[];
  fabric: string;
  occasions: Occasion[];
  colour: Colour;
  hex: string;
  images: string[];
  inNow: string;
  inMrp: string;
  ukNow: string;
  ukMrp: string;
  freeSize: boolean;
  free: string; // India stock
  sizes: Record<(typeof SIZES)[number], string>;
  freeUk: string; // UK stock
  sizesUk: Record<(typeof SIZES)[number], string>;
  tag: string;
  origin: string;
  craft: string;
  description: string;
  details: string;
  care: string;
  active: boolean;
  video: string;
  madeToOrder: boolean;
  costPrice: string;
  supplierId: string;
  lookbooks: string[];
  blouseOptions: boolean;
};

const slugify =(s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

const str = (n: number | undefined) => (n === undefined || n === null ? "" : String(n));

function fromProduct(p: ProductDTO | null | undefined, x: ProductExtras | null | undefined, firstCategory: string): FormState {
  const colour = (p ? (p.colour in COLOURS ? p.colour : "") : "red") as Colour;
  return {
    name: p?.name ?? "",
    slug: p?.slug ?? "",
    category: p?.category ?? firstCategory,
    collections: (p?.collections ?? []).filter((c): c is Collection => COLLECTIONS.some((x) => x.value === c)),
    fabric: p?.fabric ?? "",
    occasions: (p?.occasions ?? []).filter((o): o is Occasion => (OCCASIONS as readonly string[]).includes(o)),
    colour,
    hex: p?.hex && /^#[0-9a-fA-F]{6}$/.test(p.hex) ? p.hex : COLOURS[colour],
    images: p?.images ?? [],
    inNow: str(p?.price.in.now),
    inMrp: p?.price.in.mrp ? str(p.price.in.mrp) : "",
    ukNow: str(p?.price.uk.now),
    ukMrp: p?.price.uk.mrp ? str(p.price.uk.mrp) : "",
    freeSize: p ? p.freeSize : true,
    free: str(p?.stock["Free size"] ?? (p ? 0 : 10)),
    sizes: Object.fromEntries(SIZES.map((s) => [s, str(p?.stock[s] ?? (p ? 0 : 5))])) as FormState["sizes"],
    // A new product starts with no UK stock, so nothing sells in the UK until it is counted in.
    freeUk: str(x?.stockUk["Free size"] ?? 0),
    sizesUk: Object.fromEntries(SIZES.map((s) => [s, str(x?.stockUk[s] ?? 0)])) as FormState["sizesUk"],
    tag: p?.tag ?? "",
    origin: p?.origin ?? "",
    craft: p?.craft ?? "",
    description: p?.description ?? "",
    details: (p?.details ?? []).join("\n"),
    care: p?.care ?? "",
    active: p ? p.active : true,
    video: x?.video ?? "",
    madeToOrder: x?.madeToOrder ?? false,
    costPrice: x?.costPrice ? String(x.costPrice) : "",
    supplierId: x?.supplierId ?? "",
    lookbooks: x?.lookbooks ?? [],
    blouseOptions: p ? p.blouseOptions : firstCategory === "sarees",
  };
}

const num = (s: string) => (s.trim() === "" ? 0 : Number(s));

export function ProductForm({
  product,
  extras,
  options,
  uploadsEnabled,
}: {
  product?: ProductDTO | null;
  extras?: ProductExtras | null;
  options: ProductFormOptions;
  uploadsEnabled: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState<FormState>(() => fromProduct(product, extras, options.categories[0]?.slug ?? ""));
  const [slugTouched, setSlugTouched] = useState(Boolean(product));
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [uploading, setUploading] = useState(0);
  const [uploadNote, setUploadNote] = useState<{ kind: "err" | "info"; text: string } | null>(
    uploadsEnabled ? null : { kind: "info", text: "ImageKit uploads are not configured on this server. Add images by typing their path instead." }
  );
  const [manualMode, setManualMode] = useState(!uploadsEnabled);
  const [pathDraft, setPathDraft] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }));
  const fields = msg && !msg.ok ? msg.fields ?? {} : {};
  const fe = (key: string) => (fields[key] ? <span className="err">{fields[key]}</span> : null);
  const toggleIn = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  /* ----- images ----- */
  const move = (i: number, d: -1 | 1) =>
    setF((x) => {
      const j = i + d;
      if (j < 0 || j >= x.images.length) return x;
      const images = [...x.images];
      [images[i], images[j]] = [images[j], images[i]];
      return { ...x, images };
    });
  const removeImage = (i: number) => setF((x) => ({ ...x, images: x.images.filter((_, k) => k !== i) }));
  const addPath = () => {
    const p = pathDraft.trim().replace(/^https?:\/\/[^/]+\//, "").replace(/^\/+/, "").replace(/^img\//, "");
    if (!p) return;
    if (/\s/.test(p)) {
      setUploadNote({ kind: "err", text: "Image paths cannot contain spaces." });
      return;
    }
    setF((x) => (x.images.includes(p) ? x : { ...x, images: [...x.images, p] }));
    setPathDraft("");
  };

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploadNote(null);
    const list = Array.from(files).slice(0, 12);
    setUploading(list.length);
    try {
      for (const file of list) {
        if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image.`);
        if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10 MB.`);
        const authRes = await fetch("/api/imagekit/auth", { cache: "no-store" });
        const auth = (await authRes.json().catch(() => ({}))) as { error?: string; token?: string; expire?: number; signature?: string; publicKey?: string };
        if (!authRes.ok) {
          if (authRes.status === 503) {
            setManualMode(true);
            setUploadNote({ kind: "info", text: auth.error || "ImageKit is not configured. Type an image path instead." });
            return;
          }
          throw new Error(auth.error || `Could not authorise the upload (${authRes.status}).`);
        }
        const body = new FormData();
        body.append("file", file);
        body.append("fileName", slugify(file.name.replace(/\.[^.]+$/, "")) + (file.name.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? ".jpg"));
        body.append("folder", "/products");
        body.append("publicKey", auth.publicKey ?? "");
        body.append("signature", auth.signature ?? "");
        body.append("expire", String(auth.expire ?? ""));
        body.append("token", auth.token ?? "");
        body.append("useUniqueFileName", "true");
        const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", { method: "POST", body });
        const json = (await res.json().catch(() => ({}))) as { filePath?: string; message?: string };
        if (!res.ok || !json.filePath) throw new Error(json.message || `Upload failed for ${file.name} (${res.status}).`);
        const path = json.filePath.replace(/^\/+/, "");
        setF((x) => ({ ...x, images: [...x.images, path] }));
        setUploading((n) => n - 1);
      }
      setUploadNote({ kind: "info", text: `${list.length} image${list.length === 1 ? "" : "s"} uploaded. Save the product to keep ${list.length === 1 ? "it" : "them"}.` });
    } catch (e) {
      setUploadNote({ kind: "err", text: e instanceof Error ? e.message : "Upload failed." });
    } finally {
      setUploading(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /* ----- submit ----- */
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const counts = (free: string, sizes: FormState["sizes"]): Record<string, number> =>
      f.freeSize ? { "Free size": num(free) } : Object.fromEntries(SIZES.map((s) => [s, num(sizes[s])]));
    const stock = counts(f.free, f.sizes);
    const stockUk = counts(f.freeUk, f.sizesUk);
    const input: ProductInput = {
      id: product?.id,
      name: f.name,
      slug: f.slug || slugify(f.name),
      category: f.category,
      collections: f.collections,
      fabric: f.fabric,
      occasions: f.occasions,
      colour: f.colour,
      hex: f.hex,
      images: f.images,
      price: { in: { now: num(f.inNow), mrp: num(f.inMrp) }, uk: { now: num(f.ukNow), mrp: num(f.ukMrp) } },
      freeSize: f.freeSize,
      stock,
      stockUk,
      tag: f.tag,
      origin: f.origin,
      craft: f.craft,
      description: f.description,
      details: f.details.split("\n").map((l) => l.trim()).filter(Boolean),
      care: f.care,
      active: f.active,
      video: f.video.trim(),
      madeToOrder: f.madeToOrder,
      costPrice: num(f.costPrice),
      supplierId: f.supplierId,
      lookbooks: f.lookbooks,
      blouseOptions: f.blouseOptions,
    };
    start(async () => {
      const res = await saveProduct(input);
      setMsg(res);
      if (res.ok) {
        if (!product && res.id) router.push(`/admin/products/${res.id}?saved=1`);
        else router.refresh();
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  function softDelete() {
    if (!product) return;
    startDelete(async () => {
      const res = await toggleProductActive(product.id, false);
      if (res.ok) {
        router.push("/admin/products");
        router.refresh();
      } else {
        setMsg(res);
        setConfirmDelete(false);
      }
    });
  }

  return (
    <form className="adm-form pf" onSubmit={submit} noValidate>
      {msg ? <p className={`notice ${msg.ok ? "ok" : "err"}`} role="status">{msg.ok ? msg.message : msg.error}</p> : null}

      <section className="adm-card">
        <h2 className="h3">Basics</h2>
        <div className="form-grid two">
          <div className="field full">
            <label htmlFor="p-name">Name</label>
            <input
              id="p-name"
              value={f.name}
              aria-invalid={!!fields.name}
              onChange={(e) => {
                const name = e.target.value;
                setF((x) => ({ ...x, name, slug: slugTouched ? x.slug : slugify(name) }));
              }}
              placeholder="Bottle Green Banarasi Silk Saree"
              required
            />
            {fe("name")}
          </div>
          <div className="field full">
            <label htmlFor="p-slug">Slug (web address)</label>
            <div className="adm-prefix">
              <span>/p/</span>
              <input
                id="p-slug"
                value={f.slug}
                aria-invalid={!!fields.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set("slug", e.target.value.toLowerCase().replace(/\s+/g, "-"));
                }}
              />
              {slugTouched && (
                <button type="button" className="adm-more" onClick={() => { setSlugTouched(false); set("slug", slugify(f.name)); }}>
                  From name
                </button>
              )}
            </div>
            {fe("slug")}
          </div>
          <div className="field">
            <label htmlFor="p-cat">Category</label>
            <select id="p-cat" value={f.category} onChange={(e) => {
              const category = e.target.value as Category;
              setF((x) => ({ ...x, category, freeSize: product ? x.freeSize : category === "sarees", blouseOptions: product ? x.blouseOptions : category === "sarees" }));
            }}>
              {!options.categories.some((c) => c.slug === f.category) && <option value={f.category}>{f.category || "Choose…"}</option>}
              {options.categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}{c.active ? "" : " (hidden)"}</option>)}
            </select>
            <small className="muted"><Link href="/admin/categories">Manage categories</Link></small>
          </div>
          <div className="field">
            <label htmlFor="p-fabric">Fabric</label>
            <input id="p-fabric" value={f.fabric} aria-invalid={!!fields.fabric} onChange={(e) => set("fabric", e.target.value)} placeholder="Silk, Cotton, Georgette…" list="fabrics" />
            <datalist id="fabrics">
              {["Silk", "Raw silk", "Tissue silk", "Cotton", "Linen", "Georgette", "Chiffon", "Organza", "Velvet", "Chanderi"].map((x) => <option key={x} value={x} />)}
            </datalist>
            {fe("fabric")}
          </div>
          <fieldset className="adm-fs">
            <legend>Collections</legend>
            <div className="adm-checks">
              {COLLECTIONS.map((c) => (
                <label key={c.value} className="check">
                  <input type="checkbox" checked={f.collections.includes(c.value)} onChange={() => set("collections", toggleIn(f.collections, c.value))} /> {c.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="adm-fs">
            <legend>Occasions</legend>
            <div className="adm-checks">
              {OCCASIONS.map((o) => (
                <label key={o} className="check">
                  <input type="checkbox" checked={f.occasions.includes(o)} onChange={() => set("occasions", toggleIn(f.occasions, o))} /> {o[0].toUpperCase() + o.slice(1)}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="field">
            <label htmlFor="p-colour">Colour family</label>
            <select id="p-colour" value={f.colour} onChange={(e) => {
              const colour = e.target.value as Colour;
              setF((x) => ({ ...x, colour, hex: x.hex === COLOURS[x.colour] ? COLOURS[colour] : x.hex }));
            }}>
              {(Object.keys(COLOURS) as Colour[]).map((c) => <option key={c} value={c}>{c ? c[0].toUpperCase() + c.slice(1) : "Not applicable"}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="p-hex">Swatch colour</label>
            <div className="adm-hex">
              <input id="p-hex" type="color" value={f.hex} onChange={(e) => set("hex", e.target.value)} aria-label="Pick swatch colour" />
              <input value={f.hex} aria-invalid={!!fields.hex} onChange={(e) => set("hex", e.target.value)} aria-label="Swatch hex code" maxLength={7} />
            </div>
            {fe("hex")}
          </div>
        </div>
      </section>

      <section className="adm-card">
        <h2 className="h3">Images</h2>
        <p className="muted adm-small">The first image is the cover on product cards. Portrait 3:4 photos look best.</p>
        {f.images.length ? (
          <ol className="adm-imgs">
            {f.images.map((src, i) => (
              <li key={src + i}>
                <span className="adm-thumb lg"><Image src={src} alt="" width={90} height={120} /></span>
                <div className="adm-img-meta">
                  <code>{src}</code>
                  {i === 0 ? <small className="kick">Cover</small> : null}
                </div>
                <div className="adm-img-act">
                  <button type="button" className="adm-icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move image up"><Icon name="chevD" size={16} className="ic up" /></button>
                  <button type="button" className="adm-icon-btn" onClick={() => move(i, 1)} disabled={i === f.images.length - 1} aria-label="Move image down"><Icon name="chevD" size={16} /></button>
                  <button type="button" className="adm-icon-btn danger" onClick={() => removeImage(i)} aria-label="Remove image"><Icon name="trash" size={16} /></button>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="notice">No images yet. Add at least one before making the product live.</p>
        )}
        {fe("images")}

        <div className="adm-upload">
          {!manualMode && (
            <label className={`btn ghost adm-btn ${uploading ? "is-busy" : ""}`}>
              <Icon name="upload" size={16} /> {uploading ? `Uploading ${uploading}…` : "Upload images"}
              <input ref={fileRef} type="file" accept="image/*" multiple hidden disabled={!!uploading} onChange={(e) => upload(e.target.files)} />
            </label>
          )}
          {(manualMode || !uploadsEnabled) ? null : (
            <button type="button" className="adm-more" onClick={() => setManualMode(true)}>Add by path instead</button>
          )}
        </div>
        {manualMode && (
          <div className="adm-path">
            <div className="field grow">
              <label htmlFor="p-path">Image path</label>
              <input
                id="p-path"
                value={pathDraft}
                onChange={(e) => setPathDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPath(); } }}
                placeholder="products/green-banarasi-3.webp"
              />
            </div>
            <button type="button" className="btn ghost adm-btn" onClick={addPath}>Add</button>
            {uploadsEnabled && <button type="button" className="adm-more" onClick={() => setManualMode(false)}>Upload instead</button>}
          </div>
        )}
        {uploadNote ? <p className={`notice ${uploadNote.kind === "err" ? "err" : ""}`} role="status">{uploadNote.text}</p> : null}
      </section>

      <section className="adm-card">
        <h2 className="h3">Pricing</h2>
        <p className="muted adm-small">Leave MRP empty when there is no markdown. MRP must be above the selling price.</p>
        <div className="adm-grid4">
          <div className="field">
            <label htmlFor="p-in-now">India price ₹</label>
            <input id="p-in-now" type="number" inputMode="numeric" min={0} step={1} value={f.inNow} aria-invalid={!!fields["price.in.now"]} onChange={(e) => set("inNow", e.target.value)} required />
            {fe("price.in.now")}
          </div>
          <div className="field">
            <label htmlFor="p-in-mrp">India MRP ₹</label>
            <input id="p-in-mrp" type="number" inputMode="numeric" min={0} step={1} value={f.inMrp} aria-invalid={!!fields["price.in.mrp"]} onChange={(e) => set("inMrp", e.target.value)} />
            {fe("price.in.mrp")}
          </div>
          <div className="field">
            <label htmlFor="p-uk-now">UK price £</label>
            <input id="p-uk-now" type="number" inputMode="decimal" min={0} step="0.01" value={f.ukNow} aria-invalid={!!fields["price.uk.now"]} onChange={(e) => set("ukNow", e.target.value)} required />
            {fe("price.uk.now")}
          </div>
          <div className="field">
            <label htmlFor="p-uk-mrp">UK MRP £</label>
            <input id="p-uk-mrp" type="number" inputMode="decimal" min={0} step="0.01" value={f.ukMrp} aria-invalid={!!fields["price.uk.mrp"]} onChange={(e) => set("ukMrp", e.target.value)} />
            {fe("price.uk.mrp")}
          </div>
        </div>
      </section>

      <section className="adm-card">
        <h2 className="h3">Stock</h2>
        <label className="check">
          <input type="checkbox" checked={f.freeSize} onChange={(e) => set("freeSize", e.target.checked)} /> Free size (sarees, dupattas)
        </label>
        <p className="muted adm-small">India and the UK hold separate stock: each site sells only its own pieces.</p>
        {([
          ["in", "India stock", "free", "sizes"],
          ["uk", "UK stock", "freeUk", "sizesUk"],
        ] as const).map(([r, title, freeKey, sizesKey]) => (
          <fieldset key={r} className="adm-stock">
            <legend className="adm-small">{title}</legend>
            {f.freeSize ? (
              <div className="adm-grid6">
                <div className="field">
                  <label htmlFor={`st-${r}-free`}>Free size</label>
                  <input id={`st-${r}-free`} type="number" inputMode="numeric" min={0} step={1} value={f[freeKey]} onChange={(e) => set(freeKey, e.target.value)} />
                </div>
              </div>
            ) : (
              <div className="adm-grid6">
                {SIZES.map((s) => (
                  <div key={s} className="field">
                    <label htmlFor={`st-${r}-${s}`}>{r === "uk" ? `${s} · ${UK_LABEL[s]}` : s}</label>
                    <input id={`st-${r}-${s}`} type="number" inputMode="numeric" min={0} step={1} value={f[sizesKey][s]} onChange={(e) => set(sizesKey, { ...f[sizesKey], [s]: e.target.value })} />
                  </div>
                ))}
              </div>
            )}
          </fieldset>
        ))}
        {fe("stock")}
        {fe("stockUk")}
      </section>

      <section className="adm-card">
        <h2 className="h3">Story and details</h2>
        <div className="form-grid two">
          <div className="field">
            <label htmlFor="p-tag">Tag</label>
            <input id="p-tag" value={f.tag} maxLength={30} onChange={(e) => set("tag", e.target.value)} placeholder="New, Bestseller, Handloom…" />
          </div>
          <div className="field">
            <label htmlFor="p-origin">Origin</label>
            <input id="p-origin" value={f.origin} maxLength={80} onChange={(e) => set("origin", e.target.value)} placeholder="Varanasi, Uttar Pradesh" />
          </div>
          <div className="field full">
            <label htmlFor="p-craft">Craft</label>
            <input id="p-craft" value={f.craft} maxLength={120} onChange={(e) => set("craft", e.target.value)} placeholder="Kadhua handloom zari brocade" />
          </div>
          <div className="field full">
            <label htmlFor="p-desc">Description</label>
            <textarea id="p-desc" rows={4} value={f.description} maxLength={2000} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="field full">
            <label htmlFor="p-details">Details (one per line)</label>
            <textarea id="p-details" rows={5} value={f.details} onChange={(e) => set("details", e.target.value)} placeholder={"Saree length 5.5 m plus 0.8 m blouse piece\nSilk Mark certified"} />
          </div>
          <div className="field full">
            <label htmlFor="p-care">Care</label>
            <input id="p-care" value={f.care} maxLength={300} onChange={(e) => set("care", e.target.value)} placeholder="Dry clean only." />
          </div>
        </div>
      </section>

      <section className="adm-card">
        <h2 className="h3">Sourcing, video and lookbooks</h2>
        <div className="form-grid two">
          <div className="field">
            <label htmlFor="p-supplier">Supplier / weaver</label>
            <select id="p-supplier" value={f.supplierId} aria-invalid={!!fields.supplierId} onChange={(e) => set("supplierId", e.target.value)}>
              <option value="">Not set</option>
              {options.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {fe("supplierId")}
            {!options.suppliers.length && <small className="muted">No suppliers yet. <Link className="adm-a" href="/admin/suppliers">Add one</Link>.</small>}
          </div>
          <div className="field">
            <label htmlFor="p-cost">Cost price ₹ (admin only)</label>
            <input id="p-cost" type="number" inputMode="decimal" min={0} step="any" value={f.costPrice} aria-invalid={!!fields.costPrice} onChange={(e) => set("costPrice", e.target.value)} placeholder="Landed cost per piece" />
            {fe("costPrice")}
          </div>
          <div className="field full">
            <label htmlFor="p-video">Drape video (ImageKit path or https link)</label>
            <input id="p-video" value={f.video} maxLength={300} aria-invalid={!!fields.video} onChange={(e) => set("video", e.target.value)} placeholder="videos/green-banarasi-drape.mp4" />
            {fe("video")}
          </div>
          <label className="check full">
            <input type="checkbox" checked={f.madeToOrder} onChange={(e) => set("madeToOrder", e.target.checked)} /> Made to order (goes on the stitching board when ordered)
          </label>
          <label className="check full">
            <input type="checkbox" checked={f.blouseOptions} onChange={(e) => set("blouseOptions", e.target.checked)} /> Offer blouse stitching and fall &amp; pico (for sarees sold with an unstitched blouse piece)
          </label>
          <fieldset className="adm-fs full">
            <legend>Lookbooks</legend>
            {options.lookbooks.length ? (
              <div className="adm-checks">
                {options.lookbooks.map((l) => (
                  <label key={l.slug} className="check">
                    <input type="checkbox" checked={f.lookbooks.includes(l.slug)} onChange={() => set("lookbooks", toggleIn(f.lookbooks, l.slug))} /> {l.title}
                    {!l.active && <small className="muted">(hidden)</small>}
                  </label>
                ))}
              </div>
            ) : (
              <p className="muted adm-small">No lookbooks yet.</p>
            )}
          </fieldset>
        </div>
      </section>

      <div className="adm-savebar">
        <label className="check">
          <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Live in store
        </label>
        <div className="adm-row">
          {product && f.active && (
            <Link className="adm-more" href={`/p/${product.slug}`} target="_blank">View in store</Link>
          )}
          <Link className="btn ghost adm-btn" href="/admin/products">Cancel</Link>
          <button className="btn adm-btn" disabled={pending || !!uploading}>{pending ? "Saving…" : product ? "Save changes" : "Create product"}</button>
        </div>
      </div>

      {product && (
        <section className="adm-card adm-danger">
          <h2 className="h3">Delete product</h2>
          <p className="muted adm-small">Deleting hides the product from the store and search. Past orders keep their copy, and you can switch it back on from the products list.</p>
          {confirmDelete ? (
            <div className="adm-row" role="group" aria-label="Confirm delete">
              <span>Hide “{product.name}” from the store?</span>
              <button type="button" className="btn adm-btn adm-btn-danger" onClick={softDelete} disabled={deleting}>{deleting ? "Deleting…" : "Yes, delete"}</button>
              <button type="button" className="btn ghost adm-btn" onClick={() => setConfirmDelete(false)} disabled={deleting}>Keep it</button>
            </div>
          ) : (
            <button type="button" className="btn ghost adm-btn adm-btn-danger-ghost" onClick={() => setConfirmDelete(true)} disabled={!product.active}>
              <Icon name="trash" size={16} /> {product.active ? "Delete product" : "Already hidden"}
            </button>
          )}
        </section>
      )}
    </form>
  );
}
