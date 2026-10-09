"use client";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import type { HomeSlide } from "@/lib/types";


export function HeroSlider({ slides: SLIDES }: { slides: HomeSlide[] }) {
  const [cur, setCur] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0); // restarts the progress bar animation
  const x0 = useRef<number | null>(null);
  const go = useCallback(
    (i: number) => {
      setCur((i + SLIDES.length) % SLIDES.length);
      setTick((t) => t + 1);
    },
    [SLIDES.length]
  );

  useEffect(() => {
    if (paused || SLIDES.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => go(cur + 1), 6000);
    return () => clearTimeout(t);
  }, [cur, paused, go, tick, SLIDES.length]);

  return (
    <section
      className={`hero${paused ? " paused" : ""}`}
      aria-roledescription="carousel"
      aria-label="Featured collections"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => (x0.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (x0.current === null) return;
        const dx = e.changedTouches[0].clientX - x0.current;
        if (Math.abs(dx) > 40) go(cur + (dx < 0 ? 1 : -1));
        x0.current = null;
      }}
    >
      <div className="slides">
        {SLIDES.map((s, i) => {
          const Heading = i === 0 ? "h1" : "h2";
          return (
            <div key={`${i}-${s.image}`} className={`slide${i === cur ? " on" : ""}`} aria-hidden={i !== cur} inert={i !== cur} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${SLIDES.length}`}>
              <div className="copy">
                {s.kicker && <span className="kick">{s.kicker}</span>}
                <Heading>{s.title} {s.accent && <i>{s.accent}</i>}</Heading>
                {s.text && <p>{s.text}</p>}
                <div className="cta">
                  {s.ctaLabel && s.ctaHref && <Link className="btn" href={s.ctaHref}>{s.ctaLabel}</Link>}
                  {s.linkLabel && s.linkHref && <Link className="link" href={s.linkHref}>{s.linkLabel}</Link>}
                </div>
              </div>
              <div className="pic">
                <div className="mount arch">
                  <Image src={s.image} alt={s.alt ?? ""} fill priority={i === 0} loading={i === 0 ? "eager" : "lazy"} sizes="(min-width:720px) 52vw, 100vw" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="badge" aria-hidden="true">
        <svg viewBox="0 0 120 120">
          <defs><path id="circ" d="M60 60 m-46 0 a46 46 0 1 1 92 0 a46 46 0 1 1 -92 0" /></defs>
          <circle cx="60" cy="60" r="59" fill="#FBFAF7" />
          <text><textPath href="#circ">HOUSE OF MUDDHUGUMMA · INDIA &amp; UK · </textPath></text>
        </svg>
        <span>M</span>
      </div>
      {SLIDES.length > 1 && (
      <div className="hctl">
        <span className="count">{String(cur + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}</span>
        <div className="bars" key={tick}>
          {SLIDES.map((_, i) => (
            <button key={i} aria-label={`Show slide ${i + 1}`} aria-current={i === cur} onClick={() => go(i)} />
          ))}
        </div>
        <div className="arrows">
          <button onClick={() => go(cur - 1)} aria-label="Previous slide"><Icon name="chevL" size={16} /></button>
          <button onClick={() => go(cur + 1)} aria-label="Next slide"><Icon name="chevR" size={16} /></button>
        </div>
      </div>
      )}
    </section>
  );
}
