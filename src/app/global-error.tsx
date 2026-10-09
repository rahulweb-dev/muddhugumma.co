"use client";
import { useEffect } from "react";
import "./globals.css";

/*
 * Last-resort error page, shown only when the root layout itself fails (for example the database is unreachable
 * while loading the session). It replaces the whole document, so it can't use the store header, fonts or providers.
 * Plain <a> links on purpose: a full page load gives the app a clean start.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <html lang="en">
      <head>
        <title>Something went wrong · House of Muddhugumma</title>
        <meta name="robots" content="noindex" />
      </head>
      <body className="bg-paper text-ink">
        <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-4 py-16 text-center">
          <div className="flex flex-col items-center leading-none" aria-label="House of Muddhugumma">
            <small className="text-[9.5px] tracking-[.38em] text-muted">HOUSE OF</small>
            <span className="mt-1 font-serif text-[34px] italic text-cocoa">Muddhugumma</span>
          </div>
          <h1 className="h1">
            We&apos;ll be <i>right back</i>
          </h1>
          <div className="max-w-[44ch] text-[15px] text-muted">
            <p className="m-0">
              The shop hit a problem loading this page. Please try again in a moment. Your bag is saved on this device, so nothing is lost.
            </p>
            <p className="mt-3">
              Need help with an order? Email <a className="underline underline-offset-2" href="mailto:care@muddhugumma.com">care@muddhugumma.com</a>.
            </p>
            {error.digest && <p className="mt-3 text-xs">Reference: {error.digest}</p>}
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" className="btn" onClick={() => reset()}>
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="btn ghost" href="/">
              Go to home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
