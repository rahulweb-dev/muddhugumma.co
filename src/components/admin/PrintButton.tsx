"use client";
import { useEffect } from "react";

/** Prints the current page. With `auto`, opens the print dialog once the page has loaded. */
export function PrintButton({ label = "Print", auto = false }: { label?: string; auto?: boolean }) {
  useEffect(() => {
    if (!auto) return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [auto]);
  return (
    <button type="button" className="btn adm-btn print:hidden" onClick={() => window.print()}>
      {label}
    </button>
  );
}
