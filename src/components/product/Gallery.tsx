"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";

const SIZES = "(min-width:900px) 46vw, 100vw";

/** ImageKit path → URL on the configured endpoint; full https URLs pass through. */
export function videoUrl(path: string) {
  if (/^https:\/\//i.test(path)) return path;
  const ep = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT?.replace(/\/$/, "");
  const clean = path.replace(/^\/+/, "");
  return ep ? `${ep}/${clean}` : `/img/${clean}`;
}

type Media = { kind: "image"; src: string } | { kind: "video"; src: string };

/** Muted, looping drape video. Plays on its own unless the shopper prefers reduced motion (then it shows controls). */
function DrapeVideo({ src, poster, name, active }: { src: string; poster?: string; name: string; active: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    // Only the visible copy plays (desktop main frame or the mobile carousel).
    if (active && !reduced && v.offsetParent !== null) v.play().catch(() => {});
    else v.pause();
  }, [active, reduced]);
  return (
    <video
      ref={ref}
      className="gal-video"
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      preload="metadata"
      controls={reduced}
      aria-label={`${name}: drape video`}
    />
  );
}

/** Desktop: vertical thumbnails + framed main image with hover zoom. Mobile: scroll-snap carousel with dots. */
export function Gallery({ images, name, video = "" }: { images: string[]; name: string; video?: string }) {
  const pics = images.length ? images : ["brand/logo.webp"];
  const poster = images[0] ? posterUrl(images[0]) : undefined;
  const media: Media[] = pics.map((src) => ({ kind: "image", src }));
  if (video) media.splice(1, 0, { kind: "video", src: videoUrl(video) });
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const cur = media[active] ?? media[0];

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (cur.kind !== "image") return;
    const r = e.currentTarget.getBoundingClientRect();
    setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };
  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (i !== active) setActive(i);
  };
  const go = (i: number) => {
    setActive(i);
    const el = track.current;
    if (el && el.offsetParent !== null) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };
  const alt = (i: number) => `${name}${media.length > 1 ? `, view ${i + 1} of ${media.length}` : ""}`;

  return (
    <div className={`gal${media.length > 1 ? "" : " single"}`}>
      {media.length > 1 && (
        <div className="gal-thumbs" aria-label="Product images">
          {media.map((m, i) => (
            <button
              key={m.src + i}
              type="button"
              aria-label={m.kind === "video" ? "Play drape video" : `Show image ${i + 1}`}
              aria-current={i === active}
              onClick={() => go(i)}
              onMouseEnter={() => m.kind === "image" && setActive(i)}
            >
              {m.kind === "image" ? (
                <Image src={m.src} alt="" fill sizes="80px" />
              ) : (
                <>
                  {pics[0] && <Image src={pics[0]} alt="" fill sizes="80px" />}
                  <span className="gal-play" aria-hidden="true"><Icon name="video" size={18} /></span>
                </>
              )}
            </button>
          ))}
        </div>
      )}

      <div
        className={`gal-main mount${zoom && cur.kind === "image" ? " zoom" : ""}`}
        onMouseMove={onMove}
        onMouseLeave={() => setZoom(null)}
        style={zoom ? ({ "--zx": `${zoom.x}%`, "--zy": `${zoom.y}%` } as React.CSSProperties) : undefined}
      >
        {cur.kind === "image" ? (
          <>
            <Image src={cur.src} alt={alt(active)} fill sizes={SIZES} priority />
            <span className="gal-hint" aria-hidden="true">Hover to zoom</span>
          </>
        ) : (
          <DrapeVideo src={cur.src} poster={poster} name={name} active />
        )}
      </div>

      <div className="gal-track" ref={track} onScroll={onScroll} aria-label="Product images, swipe for more" tabIndex={0}>
        {media.map((m, i) => (
          <div className="gal-slide mount" key={m.src + i}>
            {m.kind === "image" ? (
              <Image src={m.src} alt={alt(i)} fill sizes={SIZES} priority={i === 0} />
            ) : (
              <DrapeVideo src={m.src} poster={poster} name={name} active={i === active} />
            )}
          </div>
        ))}
      </div>
      {media.length > 1 && (
        <div className="gal-dots">
          {media.map((m, i) => (
            <button key={i} type="button" aria-label={m.kind === "video" ? "Drape video" : `Image ${i + 1}`} aria-current={i === active} onClick={() => go(i)} />
          ))}
        </div>
      )}
    </div>
  );
}

function posterUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  const ep = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT?.replace(/\/$/, "");
  return ep ? `${ep}/${path}?tr=w-900,q-75,f-auto` : `/img/${path}`;
}
