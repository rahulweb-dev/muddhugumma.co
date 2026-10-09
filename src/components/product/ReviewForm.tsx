"use client";
import Image from "next/image";
import { useActionState, useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { submitReview, type ReviewState } from "@/lib/actions/reviews";

const WORDS = ["", "Poor", "Fair", "Good", "Very good", "Loved it"];
const MAX_PHOTOS = 3;
const MAX_BYTES = 8 * 1024 * 1024;

type Photo = { id: string; preview: string; path?: string; error?: string };

/** Uploads one photo straight from the browser to ImageKit (folder /reviews) with a one-time signature. */
async function uploadPhoto(file: File): Promise<string> {
  const a = await fetch("/api/imagekit/review-auth", { cache: "no-store" });
  const auth = (await a.json().catch(() => ({}))) as { token?: string; expire?: number; signature?: string; publicKey?: string; folder?: string; error?: string };
  if (!a.ok || !auth.signature) throw new Error(auth.error || "Photo uploads are unavailable right now.");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
  const fd = new FormData();
  fd.append("file", file);
  fd.append("fileName", `review-${Date.now()}.${ext}`);
  fd.append("publicKey", auth.publicKey!);
  fd.append("signature", auth.signature);
  fd.append("expire", String(auth.expire));
  fd.append("token", auth.token!);
  fd.append("folder", auth.folder || "/reviews");
  fd.append("useUniqueFileName", "true");
  const r = await fetch("https://upload.imagekit.io/api/v1/files/upload", { method: "POST", body: fd });
  const json = (await r.json().catch(() => ({}))) as { filePath?: string; message?: string };
  if (!r.ok || !json.filePath) throw new Error(json.message || "Upload failed. Please try again.");
  return json.filePath.replace(/^\/+/, "");
}

export function ReviewForm({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoMsg, setPhotoMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState<ReviewState, FormData>(submitReview, null);
  const e = state?.errors ?? {};

  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  if (state?.ok) return <p className="notice ok" role="status">{state.message}</p>;

  if (!open)
    return (
      <button type="button" className="btn ghost" onClick={() => setOpen(true)}>
        <Icon name="edit" size={16} /> Write a review
      </button>
    );

  const uploading = photos.some((p) => !p.path && !p.error);

  const onFiles = async (list: FileList | null) => {
    setPhotoMsg("");
    const files = [...(list ?? [])].filter((f) => f.type.startsWith("image/"));
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) setPhotoMsg(`You can add up to ${MAX_PHOTOS} photos.`);
    for (const f of files.slice(0, Math.max(0, room))) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (f.size > MAX_BYTES) {
        setPhotoMsg(`${f.name} is over 8 MB. Please choose a smaller photo.`);
        continue;
      }
      const preview = URL.createObjectURL(f);
      previews.current.push(preview);
      setPhotos((ps) => [...ps, { id, preview }]);
      uploadPhoto(f)
        .then((path) => setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, path } : p))))
        .catch((err: Error) => setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, error: err.message } : p))));
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const shown = hover || rating;
  return (
    <form className="rv-form" action={action} noValidate>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="rating" value={rating || ""} />
      {photos.filter((p) => p.path).map((p) => <input key={p.id} type="hidden" name="images" value={p.path} />)}
      <div className="field">
        <label id="rv-stars-l">Your rating</label>
        <div className="stars-in" role="radiogroup" aria-labelledby="rv-stars-l" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              className={n <= shown ? "on" : ""}
              onMouseEnter={() => setHover(n)}
              onClick={() => setRating(n)}
            >
              <Icon name="star" size={24} />
            </button>
          ))}
          <span className="muted">{WORDS[shown]}</span>
        </div>
        {e.rating && <span className="err">{e.rating}</span>}
      </div>
      <div className="form-grid two">
        <div className="field">
          <label htmlFor="rv-title">Title</label>
          <input id="rv-title" name="title" maxLength={80} placeholder="e.g. Beautiful drape, true colour" aria-invalid={!!e.title || undefined} />
          {e.title && <span className="err">{e.title}</span>}
        </div>
        <div className="field">
          <label htmlFor="rv-city">City (optional)</label>
          <input id="rv-city" name="city" maxLength={40} placeholder="e.g. Hyderabad or Leicester" />
          {e.city && <span className="err">{e.city}</span>}
        </div>
        <div className="field full">
          <label htmlFor="rv-body">Your review</label>
          <textarea id="rv-body" name="body" maxLength={1500} placeholder="How was the fabric, fit and colour? Where did you wear it?" aria-invalid={!!e.body || undefined} />
          {e.body && <span className="err">{e.body}</span>}
        </div>
      </div>

      <div className="field">
        <label htmlFor="rv-photos">Photos (optional, up to {MAX_PHOTOS})</label>
        <div className="rv-photos">
          {photos.map((p) => (
            <div key={p.id} className={`rv-ph${p.error ? " bad" : ""}`}>
              <Image src={p.preview} alt="Your photo" fill sizes="80px" unoptimized />
              {!p.path && !p.error && <span className="rv-ph-state">Uploading…</span>}
              {p.error && <span className="rv-ph-state">Failed</span>}
              <button type="button" aria-label="Remove photo" onClick={() => setPhotos((ps) => ps.filter((x) => x.id !== p.id))}>
                <Icon name="x" size={12} />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className="rv-add" htmlFor="rv-photos">
              <Icon name="upload" size={18} />
              <span>Add photo</span>
            </label>
          )}
          <input ref={fileRef} id="rv-photos" type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple className="sr-only" onChange={(ev) => onFiles(ev.target.files)} />
        </div>
        {photos.find((p) => p.error) && <span className="err">{photos.find((p) => p.error)!.error}</span>}
        {photoMsg && <span className="err">{photoMsg}</span>}
        {e.images && <span className="err">{e.images}</span>}
        <small className="muted">Show us how you styled it. Photos appear with your review once it has been checked.</small>
      </div>

      {state && !state.ok && <p className="notice err" role="alert">{state.message}</p>}
      <div className="rv-actions">
        <button type="submit" className="btn" disabled={pending || uploading}>{pending ? "Posting…" : uploading ? "Uploading photos…" : "Post review"}</button>
        <button type="button" className="link" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
