"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { clearTrackingCookies, saveConsent, type Consent } from "@/lib/analytics";
import { AnalyticsScripts } from "./AnalyticsScripts";
import { OPEN_COOKIE_SETTINGS } from "./CookieSettingsButton";

/**
 * Cookie consent for UK GDPR / PECR and India's DPDP Act: nothing non-essential runs until the shopper says yes,
 * "Reject" is as easy as "Accept", and the choice can be changed any time from "Cookie settings" in the footer.
 * Mounted once from the root layout with the choice read from the mg_consent cookie on the server (no banner flash).
 */
export function ConsentManager({ initial }: { initial: Consent | null }) {
  const pathname = usePathname() ?? "";
  const [consent, setConsent] = useState<Consent | null>(initial);
  const [open, setOpen] = useState(initial === null);
  const [manage, setManage] = useState(false);
  const [draft, setDraft] = useState<Consent>(initial ?? { analytics: false, marketing: false });
  const boxRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const ids = useId();

  // Keep track() in step with the server-read cookie from the very first render.
  if (typeof window !== "undefined") (window as Window & { __mgConsent?: Consent | null }).__mgConsent ??= initial;

  useEffect(() => {
    const reopen = () => {
      returnTo.current = document.activeElement as HTMLElement | null;
      setDraft(consent ?? { analytics: false, marketing: false });
      setManage(true);
      setOpen(true);
      requestAnimationFrame(() => boxRef.current?.focus());
    };
    window.addEventListener(OPEN_COOKIE_SETTINGS, reopen);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS, reopen);
  }, [consent]);

  const decide = useCallback(
    (next: Consent) => {
      const withdrawn = (consent?.analytics && !next.analytics) || (consent?.marketing && !next.marketing);
      saveConsent(next);
      setConsent(next);
      setOpen(false);
      setManage(false);
      if (withdrawn) {
        // Scripts that already ran can't be unloaded: clear their cookies and reload without them.
        clearTrackingCookies();
        window.location.reload();
        return;
      }
      returnTo.current?.focus?.();
      returnTo.current = null;
    },
    [consent]
  );

  const hidden = !open || pathname.startsWith("/admin");

  return (
    <>
      <AnalyticsScripts consent={consent} />
      {!hidden && (
        <div
          ref={boxRef}
          tabIndex={-1}
          role="region"
          aria-labelledby={`${ids}-h`}
          className="fixed inset-x-2 bottom-[calc(72px+env(safe-area-inset-bottom,0px))] z-[70] mx-auto max-h-[calc(100dvh-96px)] max-w-[560px] overflow-y-auto border border-line bg-paper p-4 text-[13px] leading-normal md:p-5 md:text-[13.5px] md:leading-relaxed text-ink shadow-[0_20px_50px_-20px_rgba(27,26,24,.45)] outline-none focus-visible:outline-2 focus-visible:outline-bronze md:inset-x-auto md:bottom-5 md:left-5 md:mx-0"
        >
          <h2 id={`${ids}-h`} className="h3 mb-1.5">Cookies, with your permission</h2>
          <p className="m-0 text-muted">
            We use essential cookies for your bag, sign-in and country. With your OK we&apos;d also use analytics and marketing cookies to
            improve the shop and our Instagram ads.{" "}
            <Link className="underline underline-offset-2" href="/help/cookies">How we use cookies</Link>
          </p>

          {manage && (
            <fieldset className="mt-4 flex flex-col gap-3 border-0 border-t border-line p-0 pt-4">
              <legend className="sr-only">Choose which cookies to allow</legend>
              <label className="check items-start">
                <input type="checkbox" checked disabled aria-describedby={`${ids}-e`} />
                <span>
                  <b>Essential</b> <span className="text-muted">(always on)</span>
                  <span id={`${ids}-e`} className="block text-[12.5px] text-muted">Bag, wishlist, sign-in, country and this choice. The shop can&apos;t work without them.</span>
                </span>
              </label>
              <label className="check items-start">
                <input type="checkbox" checked={draft.analytics} onChange={(e) => setDraft((d) => ({ ...d, analytics: e.target.checked }))} aria-describedby={`${ids}-a`} />
                <span>
                  <b>Analytics</b>
                  <span id={`${ids}-a`} className="block text-[12.5px] text-muted">Google Analytics: which pages and products are viewed, so we can improve the shop.</span>
                </span>
              </label>
              <label className="check items-start">
                <input type="checkbox" checked={draft.marketing} onChange={(e) => setDraft((d) => ({ ...d, marketing: e.target.checked }))} aria-describedby={`${ids}-m`} />
                <span>
                  <b>Marketing</b>
                  <span id={`${ids}-m`} className="block text-[12.5px] text-muted">Meta Pixel: measures our Instagram and Facebook ads and shows you pieces you looked at.</span>
                </span>
              </label>
            </fieldset>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className="btn h-10 px-2 text-[11px] tracking-[.12em] md:h-11 md:px-4" onClick={() => decide({ analytics: true, marketing: true })}>Accept all</button>
            <button type="button" className="btn h-10 px-2 text-[11px] tracking-[.12em] md:h-11 md:px-4" onClick={() => decide({ analytics: false, marketing: false })}>Reject all</button>
            {manage ? (
              <button type="button" className="btn ghost col-span-2 h-10 px-2 text-[11px] tracking-[.12em] md:h-11" onClick={() => decide(draft)}>Save my choices</button>
            ) : (
              <button type="button" className="col-span-2 justify-self-center py-1 text-[12px] font-semibold text-muted underline underline-offset-2 hover:text-ink" aria-expanded={false} onClick={() => setManage(true)}>Manage choices</button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
