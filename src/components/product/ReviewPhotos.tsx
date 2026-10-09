"use client";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";

export type ReviewPhoto = { src: string; caption: string };

/** Customer photo thumbnails with a keyboard-friendly lightbox (Escape closes, arrows move). */
export function ReviewPhotos({ photos, size = "sm", label }: { photos: ReviewPhoto[]; size?: "sm" | "lg"; label: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const n = photos.length;
  const close = useCallback(() => {
    setOpen(null);
    lastFocus.current?.focus();
  }, []);
  const move = useCallback((d: number) => setOpen((i) => (i === null ? i : (i + d + n) % n)), [n]);

  useEffect(() => {
    if (open === null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") move(1);
      if (e.key === "ArrowLeft") move(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close, move]);

  if (!n) return null;
  const cur = open !== null ? photos[open] : null;
  return (
    <>
      <ul className={`rv-pics ${size}`} aria-label={label}>
        {photos.map((p, i) => (
          <li key={p.src + i}>
            <button
              type="button"
              onClick={(e) => {
                lastFocus.current = e.currentTarget;
                setOpen(i);
              }}
              aria-label={`Open photo ${i + 1} of ${n}: ${p.caption}`}
            >
              <Image src={p.src} alt="" fill sizes={size === "lg" ? "(min-width:720px) 120px, 25vw" : "72px"} />
            </button>
          </li>
        ))}
      </ul>
      {cur && (
        <div className="lbox" role="dialog" aria-modal="true" aria-label="Customer photo">
          <div className="lbox-scrim" onClick={close} />
          <figure>
            <div className="lbox-img">
              <Image src={cur.src} alt={cur.caption} fill sizes="(min-width:900px) 70vw, 100vw" />
            </div>
            <figcaption>
              <span>{cur.caption}</span>
              {n > 1 && <span className="muted">{open! + 1} / {n}</span>}
            </figcaption>
          </figure>
          <button ref={closeRef} type="button" className="lbox-x" onClick={close} aria-label="Close photo">
            <Icon name="x" />
          </button>
          {n > 1 && (
            <>
              <button type="button" className="lbox-nav prev" onClick={() => move(-1)} aria-label="Previous photo"><Icon name="chevL" /></button>
              <button type="button" className="lbox-nav next" onClick={() => move(1)} aria-label="Next photo"><Icon name="chevR" /></button>
            </>
          )}
        </div>
      )}
    </>
  );
}
