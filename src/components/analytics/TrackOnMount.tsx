"use client";
import { useEffect } from "react";
import { track, type AnalyticsData, type AnalyticsEvent } from "@/lib/analytics";

/**
 * Fires one analytics event when a page mounts (server pages can render this).
 * `onceKey` stops repeats across reloads in the same tab, e.g. a purchase for one order number.
 */
export function TrackOnMount({ event, data, onceKey }: { event: AnalyticsEvent; data: AnalyticsData; onceKey?: string }) {
  const sig = JSON.stringify([event, data]);
  useEffect(() => {
    if (onceKey) {
      try {
        const k = `mg_tracked_${onceKey}`;
        if (sessionStorage.getItem(k)) return;
        sessionStorage.setItem(k, "1");
      } catch {
        /* storage blocked: still send once for this mount */
      }
    }
    track(event, data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, onceKey]);
  return null;
}
