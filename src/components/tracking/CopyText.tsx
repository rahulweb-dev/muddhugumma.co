"use client";
import { useState } from "react";

/** Selectable value with a copy button; falls back to selecting the text when the clipboard is blocked. */
export function CopyText({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "select">("idle");
  return (
    <span className="inline-flex items-center gap-2">
      <code id={`copy-${value}`} className="select-all font-body text-[15px] font-bold tracking-[.06em] tabular-nums">{value}</code>
      <button
        type="button"
        className="rounded-full border border-line px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[.1em] text-muted hover:border-ink hover:text-ink"
        aria-label={`Copy ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setState("copied");
          } catch {
            const el = document.getElementById(`copy-${value}`);
            if (el) window.getSelection()?.selectAllChildren(el);
            setState("select");
          }
          setTimeout(() => setState("idle"), 2000);
        }}
      >
        {state === "copied" ? "Copied" : state === "select" ? "Selected" : "Copy"}
      </button>
    </span>
  );
}
