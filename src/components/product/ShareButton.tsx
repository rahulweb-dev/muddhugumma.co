"use client";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../StoreProvider";
import { track } from "@/lib/analytics";

type Method = "native" | "whatsapp" | "facebook" | "instagram" | "pinterest" | "x" | "email" | "copy";

/** Brand marks (simple, single-colour) for the share menu. */
const Mark = ({ m }: { m: Method }) => {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", "aria-hidden": true as const };
  switch (m) {
    case "whatsapp":
      return <svg {...common} fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4a.5.5 0 0 0 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.7-1.2 2.2 2.2 0 0 0 .2-1.2c-.1-.1-.3-.2-.5-.3Z" /></svg>;
    case "facebook":
      return <svg {...common} fill="currentColor"><path d="M13.5 22v-8.1h2.7l.4-3.2h-3.1V8.7c0-.9.3-1.5 1.6-1.5h1.7V4.3a22 22 0 0 0-2.5-.1c-2.4 0-4.1 1.5-4.1 4.2v2.3H7.5v3.2h2.7V22h3.3Z" /></svg>;
    case "instagram":
      return <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>;
    case "pinterest":
      return <svg {...common} fill="currentColor"><path d="M12 2a10 10 0 0 0-3.6 19.3c-.1-.8-.2-2 0-2.9l1.2-5s-.3-.6-.3-1.5c0-1.4.8-2.4 1.8-2.4.9 0 1.3.6 1.3 1.4 0 .9-.5 2.1-.8 3.3-.2 1 .5 1.8 1.5 1.8 1.8 0 3.1-1.9 3.1-4.6 0-2.4-1.7-4.1-4.2-4.1-2.9 0-4.5 2.1-4.5 4.4 0 .9.3 1.8.8 2.3l.1.4-.3 1.1c0 .2-.2.3-.4.2-1.3-.6-2.1-2.5-2.1-4 0-3.3 2.4-6.3 6.9-6.3 3.6 0 6.4 2.6 6.4 6 0 3.6-2.3 6.5-5.4 6.5-1.1 0-2.1-.6-2.4-1.2l-.7 2.5c-.2.9-.9 2.1-1.3 2.8A10 10 0 1 0 12 2Z" /></svg>;
    case "x":
      return <svg {...common} fill="currentColor"><path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z" /></svg>;
    case "email":
      return <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>;
    case "copy":
      return <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>;
    default:
      return <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>;
  }
};

/**
 * Share a product: WhatsApp, Facebook, Instagram, Pinterest, X, email or copy link, plus the phone's own share sheet
 * (which reaches Instagram, Telegram, Messages…). Links carry utm tags so Analytics shows which channel brings visits,
 * and ?region=uk when shared from the UK store so the price matches.
 */
export function ShareButton({ slug, name, price, image, compact = false }: { slug: string; name: string; price: string; image?: string; compact?: boolean }) {
  const { region, toast } = useStore();
  const [open, setOpen] = useState(false);
  const [canNative, setCanNative] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setCanNative(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const link = (source: string) => {
    const u = new URL(`/p/${slug}`, window.location.origin);
    if (region === "uk") u.searchParams.set("region", "uk");
    u.searchParams.set("utm_source", source);
    u.searchParams.set("utm_medium", "share");
    return u.toString();
  };
  const text = `${name} · ${price} at House of Muddhugumma`;
  const copy = async (url: string, note: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ text: note });
    } catch {
      window.prompt("Copy this link", url);
    }
  };

  const go = async (m: Method) => {
    track("share", { method: m, content_type: "product", item_id: slug });
    const open = (url: string) => window.open(url, "_blank", "noopener,noreferrer,width=640,height=640");
    switch (m) {
      case "native":
        try {
          await navigator.share({ title: name, text, url: link("native") });
        } catch {
          /* the shopper closed the sheet */
        }
        break;
      case "whatsapp":
        open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${link("whatsapp")}`)}`);
        break;
      case "facebook":
        open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link("facebook"))}`);
        break;
      case "pinterest":
        open(`https://pinterest.com/pin/create/button/?url=${encodeURIComponent(link("pinterest"))}&description=${encodeURIComponent(text)}${image ? `&media=${encodeURIComponent(image)}` : ""}`);
        break;
      case "x":
        open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link("x"))}`);
        break;
      case "email":
        window.location.href = `mailto:?subject=${encodeURIComponent(name)}&body=${encodeURIComponent(`${text}\n\n${link("email")}`)}`;
        break;
      case "instagram":
        // Instagram has no web share link: use the phone's share sheet (it lists Instagram), else copy the link.
        if (canNative) {
          try {
            await navigator.share({ title: name, text, url: link("instagram") });
          } catch {
            /* closed */
          }
        } else await copy(link("instagram"), "Link copied. Paste it in your Instagram story or DM.");
        break;
      case "copy":
        await copy(link("copy"), "Link copied");
        break;
    }
    setOpen(false);
  };

  const options: { m: Method; label: string }[] = [
    { m: "whatsapp", label: "WhatsApp" },
    { m: "instagram", label: "Instagram" },
    { m: "facebook", label: "Facebook" },
    { m: "pinterest", label: "Pinterest" },
    { m: "x", label: "X" },
    { m: "email", label: "Email" },
    { m: "copy", label: "Copy link" },
  ];

  return (
    <div className={`share${compact ? " compact" : ""}`} ref={box}>
      {compact ? (
        // On product cards: phones go straight to their share sheet; computers get the menu as a bottom panel.
        <button type="button" className="share-ic-btn" aria-label={`Share ${name}`} aria-expanded={open} onClick={() => (canNative ? go("native") : setOpen((o) => !o))}>
          <Mark m="native" />
        </button>
      ) : (
        <button type="button" className="share-btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
          <Mark m="native" /> Share
        </button>
      )}
      {open && (
        <div className={`share-menu${compact ? " sheet" : ""}`} role="menu" aria-label={`Share ${name}`}>
          {canNative && (
            <button type="button" role="menuitem" className="share-native" onClick={() => go("native")}>
              <Mark m="native" /> Share via…
            </button>
          )}
          <div className="share-grid">
            {options.map((o) => (
              <button key={o.m} type="button" role="menuitem" className={`share-opt ${o.m}`} onClick={() => go(o.m)}>
                <span className="share-ic"><Mark m={o.m} /></span>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
