"use client";
import { useState } from "react";

export function CopyLink({ value, label = "Copy link" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const el = document.createElement("textarea");
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  }
  return (
    <button type="button" className="btn ghost h-11 px-4" onClick={copy} aria-live="polite">
      {done ? "Copied" : label}
    </button>
  );
}
