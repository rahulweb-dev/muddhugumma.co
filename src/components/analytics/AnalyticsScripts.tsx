"use client";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { GA_ID, PIXEL_ID, ensureFbq, ensureGtag, trackPageView, type Consent } from "@/lib/analytics";

/**
 * Loads gtag.js / fbevents.js only for the categories the shopper allowed, and only when the ids are set.
 * The gtag()/fbq() queues are created in src/lib/analytics.ts, so events sent before the script finishes loading are kept.
 */
export function AnalyticsScripts({ consent }: { consent: Consent | null }) {
  const ga = !!GA_ID && !!consent?.analytics;
  const pixel = !!PIXEL_ID && !!consent?.marketing;
  if (!ga && !pixel) return null;
  return (
    <>
      {ga && (
        <Script id="mg-gtag" src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`} strategy="afterInteractive" onReady={() => void ensureGtag()} />
      )}
      {pixel && <Script id="mg-fbq" src="https://connect.facebook.net/en_US/fbevents.js" strategy="afterInteractive" onReady={() => void ensureFbq()} />}
      <Suspense fallback={null}>
        <PageViews ga={ga} pixel={pixel} />
      </Suspense>
    </>
  );
}

/** page_view / PageView on the first load and every client-side navigation, at most once per URL per tool. */
function PageViews({ ga, pixel }: { ga: boolean; pixel: boolean }) {
  const pathname = usePathname();
  const search = useSearchParams()?.toString();
  const sent = useRef<{ ga: string; pixel: string }>({ ga: "", pixel: "" });
  useEffect(() => {
    const url = search ? `${pathname}?${search}` : pathname;
    const to = { ga: ga && sent.current.ga !== url, pixel: pixel && sent.current.pixel !== url };
    if (!to.ga && !to.pixel) return;
    if (to.ga) sent.current.ga = url;
    if (to.pixel) sent.current.pixel = url;
    // Let the new page set its <title> first.
    const t = setTimeout(() => trackPageView(url, to), 0);
    return () => clearTimeout(t);
  }, [pathname, search, ga, pixel]);
  return null;
}
