"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewMarkdown } from "@/lib/actions/content";
import { resetPage, savePage } from "@/lib/actions/site";
import { Msg, fieldErr } from "../content/ui";
import type { Result } from "../content/shared";

const PROSE =
  "text-[15px] leading-relaxed text-[#3E3A35] [&_h2]:font-display [&_h2]:uppercase [&_h2]:tracking-wider [&_h2]:text-lg [&_h2]:mt-6 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1 [&_p]:my-3 [&_a]:text-bronze [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1";

type Fields = { title: string; intro: string; body: string; published: boolean };

export function PageEditor({ slug, saved, initial }: { slug: string; saved: boolean; initial: Fields }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [res, setRes] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const [html, setHtml] = useState("");
  const [view, setView] = useState<"write" | "preview">("write");
  const [confirm, setConfirm] = useState(false);
  const seq = useRef(0);
  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const out = await previewMarkdown(f.body);
      if (n === seq.current) setHtml(out);
    }, 300);
    return () => clearTimeout(t);
  }, [f.body]);

  const save = () => {
    setRes(null);
    start(async () => {
      const r = await savePage({ slug, ...f });
      setRes(r);
      if (r.ok) router.refresh();
    });
  };
  const reset = () =>
    start(async () => {
      const r = await resetPage(slug);
      setRes(r);
      setConfirm(false);
      if (r.ok) router.refresh();
    });

  return (
    <form className="adm-form" noValidate onSubmit={(e) => { e.preventDefault(); save(); }}>
      {!saved ? <p className="notice">This page shows the store&apos;s built-in text until you save your own.</p> : null}
      <section className="adm-card">
        <div className="field">
          <label htmlFor="pg-title">Title</label>
          <input id="pg-title" value={f.title} maxLength={120} aria-invalid={!!(res && !res.ok && res.fields?.title)} onChange={(e) => set("title", e.target.value)} />
          {fieldErr(res, "title")}
        </div>
        <div className="field">
          <label htmlFor="pg-intro">Intro ({f.intro.length}/400)</label>
          <textarea id="pg-intro" rows={2} maxLength={400} value={f.intro} placeholder="One or two sentences under the title (optional)." onChange={(e) => set("intro", e.target.value)} />
          {fieldErr(res, "intro")}
        </div>
      </section>

      <section className="adm-card">
        <div className="adm-card-head">
          <h2 className="h3">
            Text <span className="muted normal-case tracking-normal font-body text-xs">Markdown</span>
          </h2>
          <div className="adm-row lg:hidden" role="tablist">
            <button type="button" role="tab" aria-selected={view === "write"} className={`adm-more ${view === "write" ? "text-ink!" : ""}`} onClick={() => setView("write")}>Write</button>
            <button type="button" role="tab" aria-selected={view === "preview"} className={`adm-more ${view === "preview" ? "text-ink!" : ""}`} onClick={() => setView("preview")}>Preview</button>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={`field ${view === "write" ? "" : "hidden lg:flex"}`}>
            <label htmlFor="pg-body" className="sr-only">Page text in Markdown</label>
            <textarea id="pg-body" value={f.body} onChange={(e) => set("body", e.target.value)} className="min-h-[480px]! font-mono text-[13px]!" placeholder={"## A section heading\n\nA paragraph.\n\n- A list item"} />
            {fieldErr(res, "body")}
            <small className="muted">## section heading · ### question · **bold** · [text](link) · - list · blank line between paragraphs</small>
          </div>
          <div className={`border border-line bg-paper p-4 min-h-[480px] overflow-auto ${view === "preview" ? "" : "hidden lg:block"}`} aria-label="Preview">
            {f.body.trim() ? <article className={PROSE} dangerouslySetInnerHTML={{ __html: html }} /> : <p className="muted">The preview appears here as you write.</p>}
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={f.published} onChange={(e) => set("published", e.target.checked)} /> Live on the website
        </label>
      </section>

      <Msg res={res} />
      <div className="adm-savebar">
        <span className="adm-small">
          {saved ? (
            confirm ? (
              <span className="adm-row">
                Delete your text and show the built-in page?
                <button type="button" className="adm-more text-sale!" onClick={reset} disabled={pending}>Yes</button>
                <button type="button" className="adm-more" onClick={() => setConfirm(false)}>Cancel</button>
              </span>
            ) : (
              <button type="button" className="adm-more" onClick={() => setConfirm(true)}>Use built-in text</button>
            )
          ) : (
            "Changes go live when you save."
          )}
        </span>
        <button className="btn adm-btn" disabled={pending}>{pending ? "Saving…" : "Save page"}</button>
      </div>
    </form>
  );
}
