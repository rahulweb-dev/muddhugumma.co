"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { askAssistant } from "@/lib/actions/assistant";
import { sendContactMessage, type ContactState } from "@/lib/actions/contact";
import type { BotAction, BotMessage, BotState } from "@/lib/assistant";

type Line = (BotMessage & { from: "bot" }) | { from: "you"; text: string };
const STORE_KEY = "mg_assistant_v1";

const WaIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4a.5.5 0 0 0 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.7-1.2 2.2 2.2 0 0 0 .2-1.2c-.1-.1-.3-.2-.5-.3Z" />
  </svg>
);

/** Free, rule-based shopping assistant + WhatsApp button. Hidden on checkout so nothing distracts from paying. */
export function Assistant({ whatsapp, region }: { whatsapp: string; region: "in" | "uk" }) {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [state, setState] = useState<BotState>({});
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const loaded = useRef(false);

  // Restore the conversation for this tab (it survives page changes, not new tabs).
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || "null");
      if (saved?.lines) {
        setLines(saved.lines);
        setState(saved.state ?? {});
      }
    } catch {}
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify({ lines: lines.slice(-40), state }));
    } catch {}
  }, [lines, state]);

  // Region switch: start over so prices and rules match.
  const lastRegion = useRef(region);
  useEffect(() => {
    if (lastRegion.current !== region) {
      lastRegion.current = region;
      setLines([]);
      setState({});
    }
  }, [region]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [lines, pending]);

  /** Sends a message; `shown` is what appears in the chat (the button label, or the typed text). */
  const send = (text: string, shown: string | null = text) =>
    start(async () => {
      if (shown && !shown.startsWith("#")) setLines((l) => [...l, { from: "you", text: shown }]);
      const res = await askAssistant({ text, state });
      setState(res.state);
      setLines((l) => [...l, ...res.messages.map((m) => ({ ...m, from: "bot" as const }))]);
    });

  const openPanel = () => {
    setOpen(true);
    if (!lines.length) send("", null);
    setTimeout(() => inputRef.current?.focus(), 80);
  };
  const close = () => {
    setOpen(false);
    setTimeout(() => launcherRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname.startsWith("/checkout")) return null;
  const onPdp = pathname.startsWith("/p/");
  const waHref = whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent("Hi House of Muddhugumma, I have a question: ")}` : "";
  // Phones: sit above the app bar (or the product page's add-to-bag bar). Desktop: bottom-right corner.
  const lift = onPdp ? "bottom-[calc(96px+env(safe-area-inset-bottom,0px))]" : "bottom-[calc(88px+env(safe-area-inset-bottom,0px))]";

  const actionEl = (a: BotAction, i: number) =>
    a.href ? (
      a.external ? (
        <a key={i} className="chip hover:border-ink" href={a.href} target="_blank" rel="noopener noreferrer">{a.label}</a>
      ) : (
        <Link key={i} className="chip hover:border-ink" href={a.href} onClick={() => window.matchMedia("(max-width: 719px)").matches && setOpen(false)}>{a.label}</Link>
      )
    ) : (
      <button key={i} type="button" className="chip hover:border-ink" disabled={pending} onClick={() => send(a.send ?? a.label, a.label)}>
        {a.label}
      </button>
    );

  return (
    <>
      {!open && (
        <div className={`fixed right-4 z-[60] flex flex-col items-end gap-3 ${lift} md:bottom-6 md:right-6`}>
          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Chat with us on WhatsApp"
              title="Chat with us on WhatsApp"
              className="hidden size-12 place-items-center rounded-full bg-[#1F8F4E] text-white shadow-[0_10px_24px_-10px_rgba(0,0,0,.45)] hover:brightness-110 md:grid"
            >
              <WaIcon />
            </a>
          )}
          <button
            ref={launcherRef}
            type="button"
            onClick={openPanel}
            aria-haspopup="dialog"
            className="flex h-12 items-center gap-2 rounded-full bg-ink pl-4 pr-5 text-[12px] font-bold uppercase tracking-[.14em] text-paper shadow-[0_12px_28px_-12px_rgba(0,0,0,.55)] hover:bg-cocoa"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M4 5h16v11H9l-5 4z" strokeLinejoin="round" />
            </svg>
            Need help?
          </button>
        </div>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Shopping assistant"
          className="fixed inset-0 z-[75] flex flex-col bg-paper md:inset-auto md:bottom-6 md:right-6 md:h-[min(620px,calc(100dvh-48px))] md:w-[390px] md:border md:border-line md:shadow-[0_30px_60px_-30px_rgba(27,26,24,.55)]"
        >
          <header className="flex items-center gap-3 border-b border-line bg-ink px-4 pb-3 pt-[calc(12px+env(safe-area-inset-top,0px))] text-paper md:pt-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-paper font-script text-xl text-cocoa" aria-hidden="true">M</span>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <b className="font-display text-[13px] font-normal uppercase tracking-[.14em]">Muddhugumma help</b>
              <small className="text-[11.5px] opacity-75">Instant answers · {waHref ? "a person on WhatsApp" : "our team when you need them"}</small>
            </span>
            {waHref && (
              <a href={waHref} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp" title="Chat on WhatsApp" className="grid size-9 place-items-center rounded-full bg-[#1F8F4E] text-white">
                <WaIcon />
              </a>
            )}
            <button type="button" onClick={close} aria-label="Close help" className="grid size-9 place-items-center">
              <Icon name="x" />
            </button>
          </header>

          <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite" aria-busy={pending}>
            {lines.map((l, i) =>
              l.from === "you" ? (
                <p key={i} className="m-0 max-w-[85%] self-end bg-ink px-3.5 py-2.5 text-[14px] text-paper">{l.text}</p>
              ) : (
                <div key={i} className="flex max-w-[92%] flex-col gap-2 self-start">
                  <p className="m-0 bg-stone px-3.5 py-2.5 text-[14px] leading-relaxed">{l.text}</p>
                  {l.products?.length ? (
                    <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1 [scrollbar-width:none]">
                      {l.products.map((p) => (
                        <li key={p.slug} className="w-[132px] shrink-0">
                          <Link href={`/p/${p.slug}`} className="flex flex-col gap-1.5" onClick={() => window.matchMedia("(max-width: 719px)").matches && setOpen(false)}>
                            <span className="relative block aspect-[3/4] overflow-hidden bg-stone">
                              {p.image ? <Image src={p.image} alt="" fill sizes="132px" className="object-cover object-[50%_20%]" /> : null}
                              {p.tag ? <span className="absolute left-1.5 top-1.5 bg-paper px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[.1em]">{p.tag}</span> : null}
                            </span>
                            <span className="line-clamp-2 text-[12.5px] leading-snug">{p.name}</span>
                            <span className="text-[13px] font-bold tabular-nums">
                              {p.price} {p.mrp ? <s className="font-normal text-muted">{p.mrp}</s> : null}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {l.form === "handoff" && i === lines.length - 1 ? <Handoff /> : null}
                  {l.actions?.length ? <div className="flex flex-wrap gap-1.5">{l.actions.map(actionEl)}</div> : null}
                </div>
              )
            )}
            {pending && (
              <p className="m-0 self-start bg-stone px-3.5 py-2.5 text-[14px] text-muted" aria-label="Typing">
                <span className="inline-flex gap-1"><span className="animate-pulse">●</span><span className="animate-pulse [animation-delay:150ms]">●</span><span className="animate-pulse [animation-delay:300ms]">●</span></span>
              </p>
            )}
          </div>

          <form
            className="flex items-center gap-2 border-t border-line px-3 pb-[calc(10px+env(safe-area-inset-bottom,0px))] pt-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              const t = input.trim();
              if (!t || pending) return;
              setInput("");
              send(t);
            }}
          >
            <label htmlFor="assistant-q" className="sr-only">Ask a question</label>
            <input
              ref={inputRef}
              id="assistant-q"
              value={input}
              maxLength={300}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about an order, size, delivery…"
              autoComplete="off"
              className="h-11 min-w-0 flex-1 border border-line bg-paper px-3 text-[15px] outline-none focus:border-ink"
            />
            <button type="submit" className="btn h-11 px-4" disabled={pending || !input.trim()} aria-label="Send">
              <Icon name="chevR" size={18} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

/** Leave-a-message form inside the chat; uses the same handling as the Contact us page. */
function Handoff() {
  const [res, setRes] = useState<ContactState | null>(null);
  const [pending, start] = useTransition();
  if (res?.ok) return <p className="notice ok m-0 text-[13px]" role="status">{res.message}</p>;
  return (
    <form
      className="flex flex-col gap-2 border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("topic", "Something else");
        fd.set("phone", "");
        start(async () => setRes(await sendContactMessage({ ok: false }, fd)));
      }}
    >
      <b className="text-[12px] font-bold uppercase tracking-[.12em] text-muted">Or leave a message</b>
      <input name="website" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <label className="sr-only" htmlFor="h-name">Name</label>
      <input id="h-name" name="name" required placeholder="Your name" autoComplete="name" className="h-10 border border-line bg-paper px-3 text-[14px]" />
      <label className="sr-only" htmlFor="h-email">Email</label>
      <input id="h-email" name="email" type="email" required placeholder="Email for our reply" autoComplete="email" className="h-10 border border-line bg-paper px-3 text-[14px]" />
      <input name="orderNumber" type="hidden" value="" />
      <label className="sr-only" htmlFor="h-msg">Message</label>
      <textarea id="h-msg" name="message" required rows={3} maxLength={2000} placeholder="How can we help?" className="border border-line bg-paper px-3 py-2 text-[14px]" />
      {res && !res.ok ? <p className="notice err m-0 text-[12.5px]" role="alert">{res.message ?? Object.values(res.errors ?? {})[0]}</p> : null}
      <button type="submit" className="btn h-10 text-[11px]" disabled={pending}>{pending ? "Sending…" : "Send to our team"}</button>
    </form>
  );
}
