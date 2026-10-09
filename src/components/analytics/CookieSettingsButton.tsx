"use client";

export const OPEN_COOKIE_SETTINGS = "mg:cookie-settings";

/** Re-opens the cookie banner with the "Manage" choices showing. Used in the footer and on /help/cookies. */
export function CookieSettingsButton({ className, children = "Cookie settings" }: { className?: string; children?: React.ReactNode }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS))}>
      {children}
    </button>
  );
}
