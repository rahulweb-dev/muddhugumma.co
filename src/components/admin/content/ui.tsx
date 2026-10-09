"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { deleteBundle, deleteLookbook, deleteSale, searchProducts, setGiftCardActive, toggleSale } from "@/lib/actions/merch";
import { deletePost } from "@/lib/actions/content";
import { cleanImagePath, slugify, type PickedProduct, type Result } from "./shared";

/* ---------- action feedback ---------- */
export function Msg({ res }: { res: Result | null }) {
  if (!res) return null;
  return (
    <div className="flex flex-col gap-2" role="status">
      <p className={`notice ${res.ok ? "ok" : "err"}`}>{res.ok ? res.message : res.error}</p>
      {res.ok && res.warnings?.length ? (
        <ul className="notice m-0 list-none flex flex-col gap-1 text-sale">
          {res.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

export const fieldErr = (res: Result | null, key: string) =>
  res && !res.ok && res.fields?.[key] ? <span className="err">{res.fields[key]}</span> : null;

/* ---------- single image: ImageKit upload with a typed-path fallback ---------- */
export function ImageField({
  id,
  label,
  value,
  onChange,
  folder,
  uploadsEnabled,
  placeholder,
  aspect = "aspect-[4/3]",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  folder: string;
  uploadsEnabled: boolean;
  placeholder: string;
  aspect?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ err: boolean; text: string } | null>(
    uploadsEnabled ? null : { err: false, text: "ImageKit uploads aren't configured on this server. Type the image path instead." }
  );
  const [manual, setManual] = useState(!uploadsEnabled);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setNote(null);
    setBusy(true);
    try {
      if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image.`);
      if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10 MB.`);
      const authRes = await fetch("/api/imagekit/auth", { cache: "no-store" });
      const auth = (await authRes.json().catch(() => ({}))) as { error?: string; token?: string; expire?: number; signature?: string; publicKey?: string };
      if (!authRes.ok) {
        if (authRes.status === 503) {
          setManual(true);
          setNote({ err: false, text: auth.error || "ImageKit isn't configured. Type the image path instead." });
          return;
        }
        throw new Error(auth.error || `Could not authorise the upload (${authRes.status}).`);
      }
      const ext = file.name.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? ".jpg";
      const body = new FormData();
      body.append("file", file);
      body.append("fileName", (slugify(file.name.replace(/\.[^.]+$/, "")) || "image") + ext);
      body.append("folder", folder);
      body.append("publicKey", auth.publicKey ?? "");
      body.append("signature", auth.signature ?? "");
      body.append("expire", String(auth.expire ?? ""));
      body.append("token", auth.token ?? "");
      body.append("useUniqueFileName", "true");
      const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { filePath?: string; message?: string };
      if (!res.ok || !json.filePath) throw new Error(json.message || `Upload failed (${res.status}).`);
      onChange(json.filePath.replace(/^\/+/, ""));
      setNote({ err: false, text: "Uploaded. Save to keep it." });
    } catch (e) {
      setNote({ err: true, text: e instanceof Error ? e.message : "Upload failed." });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10.5px] font-bold tracking-[.14em] uppercase text-muted">{label}</span>
      <div className="flex flex-wrap items-start gap-3">
        <div className={`relative w-36 ${aspect} bg-stone border border-line overflow-hidden shrink-0`}>
          {value ? <Image src={value} alt="" fill sizes="144px" className="object-cover" /> : <span className="absolute inset-0 grid place-items-center text-muted text-xs">No image</span>}
        </div>
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          {value ? <code>{value}</code> : null}
          <div className="adm-row">
            {!manual && (
              <label className={`btn ghost adm-btn cursor-pointer ${busy ? "opacity-60 pointer-events-none" : ""}`}>
                <Icon name="upload" size={16} /> {busy ? "Uploading…" : value ? "Replace" : "Upload"}
                <input ref={fileRef} type="file" accept="image/*" hidden disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
              </label>
            )}
            {value ? <button type="button" className="adm-more" onClick={() => onChange("")}>Remove</button> : null}
            {uploadsEnabled ? (
              <button type="button" className="adm-more" onClick={() => setManual((m) => !m)}>{manual ? "Upload instead" : "Type a path instead"}</button>
            ) : null}
          </div>
          {manual && (
            <div className="field">
              <label htmlFor={id}>Image path</label>
              <input id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(cleanImagePath(e.target.value))} />
            </div>
          )}
        </div>
      </div>
      {note ? <p className={`notice ${note.err ? "err" : ""}`}>{note.text}</p> : null}
    </div>
  );
}

/* ---------- product picker: search, add, remove, reorder ---------- */
export function ProductPicker({ value, onChange, max = 60, label = "Products" }: { value: PickedProduct[]; onChange: (v: PickedProduct[]) => void; max?: number; label?: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PickedProduct[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const n = ++seq.current;
    const t = setTimeout(() => {
      start(async () => {
        const r = await searchProducts(q);
        if (n === seq.current) setHits(r);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  const chosen = new Set(value.map((v) => v.slug));
  const add = (p: PickedProduct) => {
    if (chosen.has(p.slug) || value.length >= max) return;
    onChange([...value, p]);
  };
  const remove = (slug: string) => onChange(value.filter((v) => v.slug !== slug));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-baseline gap-2">
        <span className="text-[10.5px] font-bold tracking-[.14em] uppercase text-muted">{label} ({value.length})</span>
        {value.length >= max ? <small className="muted">Maximum {max}</small> : null}
      </div>
      {value.length ? (
        <ol className="list-none m-0 p-0 flex flex-col gap-2">
          {value.map((p, i) => (
            <li key={p.slug} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3 items-center p-2 border border-line bg-paper">
              <span className="adm-thumb">{p.image ? <Image src={p.image} alt="" width={42} height={56} /> : null}</span>
              <div className="flex flex-col min-w-0">
                <b className={`font-semibold truncate ${p.missing ? "text-sale" : ""}`}>{i + 1}. {p.name}</b>
                <small className="muted truncate">{p.slug}{!p.active && !p.missing ? " · hidden from store" : ""}</small>
              </div>
              <div className="flex gap-1">
                <button type="button" className="adm-icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${p.name} up`}><Icon name="chevD" size={16} className="ic up" /></button>
                <button type="button" className="adm-icon-btn" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label={`Move ${p.name} down`}><Icon name="chevD" size={16} /></button>
                <button type="button" className="adm-icon-btn danger" onClick={() => remove(p.slug)} aria-label={`Remove ${p.name}`}><Icon name="x" size={16} /></button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted adm-small">No products chosen yet.</p>
      )}
      <div className="flex flex-col gap-2 border border-line bg-stone/60 p-3">
        <div className="field">
          <label htmlFor="pp-q">Add products: search by name or slug</label>
          <input
            id="pp-q"
            type="search"
            value={q}
            autoComplete="off"
            placeholder="e.g. banarasi, kanchi, anarkali"
            onFocus={() => setOpen(true)}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
          />
        </div>
        {open ? (
          hits.length ? (
            <ul className="list-none m-0 p-0 grid gap-2 sm:grid-cols-2">
              {hits.map((p) => {
                const taken = chosen.has(p.slug);
                return (
                  <li key={p.slug}>
                    <button
                      type="button"
                      onClick={() => add(p)}
                      disabled={taken || value.length >= max}
                      className="w-full flex items-center gap-3 p-2 border border-line bg-paper text-left hover:border-ink disabled:opacity-50 disabled:cursor-default"
                    >
                      <span className="adm-thumb sm">{p.image ? <Image src={p.image} alt="" width={30} height={40} /> : null}</span>
                      <span className="flex flex-col min-w-0 flex-1">
                        <span className="truncate font-semibold">{p.name}</span>
                        <small className="muted truncate">{p.slug}{p.active ? "" : " · hidden"}</small>
                      </span>
                      <span className="text-[11px] font-bold tracking-widest uppercase text-bronze shrink-0">{taken ? "Added" : "Add"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted adm-small">{pending ? "Searching…" : "No products match."}</p>
          )
        ) : null}
      </div>
    </div>
  );
}

/* ---------- delete with confirmation ---------- */
const DELETERS = { post: deletePost, lookbook: deleteLookbook, sale: deleteSale, bundle: deleteBundle } as const;

export function DeleteButton({ kind, id, label, confirmText, after }: { kind: keyof typeof DELETERS; id: string; label: string; confirmText: string; after: string }) {
  const [ask, setAsk] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-col gap-2">
      {ask ? (
        <div className="adm-row">
          <span className="adm-small">{confirmText}</span>
          <button
            type="button"
            className="btn adm-btn adm-btn-danger"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await DELETERS[kind](id);
                setRes(r);
                if (r.ok) {
                  router.push(after);
                  router.refresh();
                }
              })
            }
          >
            {pending ? "Deleting…" : "Yes, delete"}
          </button>
          <button type="button" className="adm-more" onClick={() => setAsk(false)}>Keep it</button>
        </div>
      ) : (
        <button type="button" className="btn ghost adm-btn adm-btn-danger-ghost self-start" onClick={() => setAsk(true)}>
          <Icon name="trash" size={16} /> {label}
        </button>
      )}
      <Msg res={res && !res.ok ? res : null} />
    </div>
  );
}

/* ---------- on/off switch bound to an action ---------- */
const TOGGLERS = { sale: toggleSale, giftcard: (id: string, on: boolean) => setGiftCardActive(id, on) } as const;

export function ToggleSwitch({ kind, id, active, label }: { kind: keyof typeof TOGGLERS; id: string; active: boolean; label: string }) {
  const [on, setOn] = useState(active);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <span className="sw-wrap">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${label}: ${on ? "on" : "off"}`}
        className="sw"
        disabled={pending}
        onClick={() => {
          const next = !on;
          setOn(next);
          setErr("");
          start(async () => {
            const r = await TOGGLERS[kind](id, next);
            if (!r.ok) {
              setOn(!next);
              setErr(r.error);
            } else router.refresh();
          });
        }}
      >
        <span />
      </button>
      {err ? <small className="sw-err" role="alert">{err}</small> : null}
    </span>
  );
}
