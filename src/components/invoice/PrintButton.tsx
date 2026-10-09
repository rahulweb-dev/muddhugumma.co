"use client";
import { Icon } from "../Icon";

export function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn print:hidden" onClick={() => window.print()}>
      <Icon name="upload" size={16} /> {label}
    </button>
  );
}
