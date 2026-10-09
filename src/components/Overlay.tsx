"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Slide-in drawer / bottom sheet with scrim. Accessible modal: focus moves to the close button on open, Tab stays
 * inside the panel, Escape closes, and focus returns to whatever opened it.
 */
export function Overlay({
  open,
  onClose,
  side = "right",
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right" | "bottom";
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Callers often pass an inline onClose; keep the latest in a ref so the effect below only runs on open/close.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => closeRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      // Give focus back to the button that opened the overlay (if it is still on the page).
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open]);
  // Render at the end of <body>: drawers opened from the sticky header would otherwise be trapped inside it,
  // because the header's backdrop blur makes it the containing block for position:fixed children.
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  if (!host) return null;
  return createPortal(
    <div className={`ov ${side}${open ? " open" : ""}`} aria-hidden={!open} inert={!open}>
      <div className="scrim" onClick={onClose} />
      <div ref={panelRef} className="panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="panel-head">
          <b id={titleId}>{title}</b>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}>
            <Icon name="x" />
          </button>
        </div>
        <div className="panel-body">{children}</div>
        {footer && <div className="panel-foot">{footer}</div>}
      </div>
    </div>,
    host
  );
}
