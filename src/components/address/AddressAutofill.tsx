"use client";
// "Use my current location" for address forms, plus a pincode / postcode → city + state lookup.
import { useRef, useState } from "react";
import { Icon } from "../Icon";
import { REGION_CONFIG, type Region } from "@/lib/region";
import type { GeoFill } from "@/lib/geo";

export type { GeoFill };

const MESSAGES: Record<number, string> = {
  1: "Location access was blocked. Allow it in your browser settings, or type the address below.",
  2: "We couldn't find your location. Please type the address below.",
  3: "Finding your location took too long. Please try again or type the address below.",
};

/** Button that asks for the shopper's location and hands back an address to fill in.
 *  onFill may return a message to show instead of the usual "check it" note (e.g. location in another country). */
export function LocateButton({ onFill }: { onFill: (fill: GeoFill) => string | void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const locate = () => {
    if (!("geolocation" in navigator)) return setMsg("Your browser can't share location. Please type the address below.");
    setBusy(true);
    setMsg("");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(`/api/geo?lat=${coords.latitude}&lng=${coords.longitude}`);
          if (!res.ok) throw new Error();
          const note = onFill((await res.json()) as GeoFill);
          setMsg(note || "Address filled from your location. Please check it and add your flat or house number.");
        } catch {
          setMsg("We found you but couldn't look up the address. Please type it below.");
        } finally {
          setBusy(false);
        }
      },
      (e) => {
        setBusy(false);
        setMsg(MESSAGES[e.code] ?? MESSAGES[2]);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };

  return (
    <div className="geo-locate full">
      <button type="button" className="btn ghost" onClick={locate} disabled={busy} aria-busy={busy}>
        <Icon name="pin" size={16} /> {busy ? "Finding your location…" : "Use my current location"}
      </button>
      <span className="geo-or">or enter your address manually</span>
      {msg && <p className="ac-hint" role="status">{msg}</p>}
    </div>
  );
}

/** Returns a function to call with each postcode change; once it's a valid code, looks up city + state (latest wins). */
export function usePostcodeLookup(region: Region, onFill: (fill: GeoFill) => void) {
  const last = useRef("");
  return (code: string) => {
    const clean = code.trim().toUpperCase();
    if (!REGION_CONFIG[region].postPattern.test(clean) || clean === last.current) return;
    last.current = clean;
    fetch(`/api/geo?region=${region}&postcode=${encodeURIComponent(clean)}`)
      .then((r) => (r.ok ? (r.json() as Promise<GeoFill>) : null))
      .then((fill) => {
        if (fill && last.current === clean) onFill(fill);
      })
      .catch(() => {});
  };
}
