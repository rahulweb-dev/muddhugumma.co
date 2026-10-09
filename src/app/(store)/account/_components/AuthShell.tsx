import Image from "next/image";
import type { ReactNode } from "react";

/** Only same-site relative paths survive as the post-sign-in destination. */
export function cleanNext(raw: string | string[] | undefined): string | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return undefined;
  if (["/account/login", "/account/register", "/account/forgot", "/account/reset"].some((p) => v.startsWith(p))) return undefined;
  return v;
}

/** Split layout: framed brand photograph on desktop, form column everywhere. */
export function AuthShell({ kicker, title, intro, children }: { kicker: string; title: ReactNode; intro: string; children: ReactNode }) {
  const dev = process.env.NODE_ENV !== "production";
  return (
    <div className="pad mx-auto grid max-w-[1240px] grid-cols-1 gap-10 pt-7 pb-14 lg:grid-cols-2 lg:items-center lg:gap-[72px] lg:pt-12 lg:pb-20">
      <div className="hidden lg:flex lg:flex-col lg:items-center lg:gap-4" aria-hidden="true">
        <div className="mount arch aspect-[4/5] w-full max-w-[460px]">
          <Image src="products/hero-banarasi-green.webp" alt="" fill className="object-[50%_20%]" sizes="(min-width:900px) 42vw, 100vw" />
        </div>
        <p className="m-0 text-center text-[13px] tracking-[.04em] text-muted">
          <i className="font-serif text-[1.35em] text-bronze">Handpicked weaves</i>, delivered across India and the UK.
        </p>
      </div>
      <div className="mx-auto flex w-full min-w-0 max-w-[440px] flex-col gap-[22px] lg:mx-0">
        <header className="flex flex-col gap-2.5">
          <span className="kick">{kicker}</span>
          <h1 className="h1">{title}</h1>
          <p className="muted">{intro}</p>
        </header>
        {children}
        {dev && (
          <aside className="ac-dev" aria-label="Development sign-in">
            <b>Development only</b>
            <span>
              Seeded admin: <code>admin@muddhugumma.com</code> / <code>ChangeMe!2026</code>
            </span>
            <small>Hidden in production. Change it with ADMIN_EMAIL and ADMIN_PASSWORD.</small>
          </aside>
        )}
      </div>
    </div>
  );
}
