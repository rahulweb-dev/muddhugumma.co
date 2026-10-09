"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewMarkdown, savePost, type PostInput } from "@/lib/actions/content";
import { DeleteButton, ImageField, Msg, fieldErr } from "./ui";
import { slugify, type Result } from "./shared";

export type PostView = { id: string; title: string; slug: string; excerpt: string; cover: string; tags: string[]; body: string; status: "draft" | "published"; publishedAt: string };

// Prose styling for the preview (no typography plugin): utilities scoped to descendants.
const PROSE =
  "text-[15px] leading-relaxed text-[#3E3A35] [&_h1]:font-display [&_h1]:uppercase [&_h1]:tracking-wider [&_h1]:text-xl [&_h1]:my-4 [&_h2]:font-display [&_h2]:uppercase [&_h2]:tracking-wider [&_h2]:text-lg [&_h2]:mt-6 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1 [&_p]:my-3 [&_a]:text-bronze [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:border-bronze [&_blockquote]:pl-4 [&_blockquote]:font-serif [&_blockquote]:italic [&_blockquote]:text-lg [&_img]:max-w-full [&_img]:h-auto [&_hr]:border-line [&_hr]:my-6 [&_code]:bg-stone [&_code]:px-1";

export function PostEditor({ post, uploadsEnabled }: { post: PostView | null; uploadsEnabled: boolean }) {
  const router = useRouter();
  const [f, setF] = useState(() => ({
    title: post?.title ?? "",
    slug: post?.slug ?? "",
    excerpt: post?.excerpt ?? "",
    cover: post?.cover ?? "",
    tags: (post?.tags ?? []).join(", "),
    body: post?.body ?? "",
  }));
  const [slugTouched, setSlugTouched] = useState(Boolean(post));
  const [res, setRes] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const [view, setView] = useState<"write" | "preview">("write");
  const [html, setHtml] = useState("");
  const seq = useRef(0);
  const status = post?.status ?? "draft";
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const out = await previewMarkdown(f.body);
      if (n === seq.current) setHtml(out);
    }, 300);
    return () => clearTimeout(t);
  }, [f.body]);

  const submit = (intent: PostInput["intent"]) => {
    setRes(null);
    const input: PostInput = {
      id: post?.id,
      title: f.title,
      slug: f.slug,
      excerpt: f.excerpt,
      cover: f.cover,
      tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
      body: f.body,
      intent,
    };
    start(async () => {
      const r = await savePost(input);
      setRes(r);
      if (r.ok) {
        if (!post && r.id) router.replace(`/admin/journal/${r.id}`);
        router.refresh();
      }
    });
  };

  const words = f.body.trim() ? f.body.trim().split(/\s+/).length : 0;

  return (
    <form className="adm-form" onSubmit={(e) => { e.preventDefault(); submit("save"); }} noValidate>
      <section className="adm-card">
        <div className="field">
          <label htmlFor="pt-title">Title</label>
          <input
            id="pt-title"
            value={f.title}
            maxLength={140}
            placeholder="How to drape a Kanjivaram for a temple wedding"
            aria-invalid={!!(res && !res.ok && res.fields?.title)}
            onChange={(e) => {
              const title = e.target.value;
              setF((x) => ({ ...x, title, slug: slugTouched ? x.slug : slugify(title) }));
            }}
          />
          {fieldErr(res, "title")}
        </div>
        <div className="adm-grid3">
          <div className="field col-span-2">
            <label htmlFor="pt-slug">Slug (web address)</label>
            <div className="adm-prefix">
              <span>/journal/</span>
              <input id="pt-slug" value={f.slug} maxLength={100} aria-invalid={!!(res && !res.ok && res.fields?.slug)} onChange={(e) => { setSlugTouched(true); set("slug", slugify(e.target.value) + (e.target.value.endsWith("-") ? "-" : "")); }} />
              {slugTouched && f.title ? <button type="button" className="adm-more" onClick={() => { setSlugTouched(false); set("slug", slugify(f.title)); }}>From title</button> : null}
            </div>
            {fieldErr(res, "slug")}
            {status === "published" ? <small className="muted">Changing the slug of a live post breaks links already shared.</small> : null}
          </div>
          <div className="field">
            <label htmlFor="pt-tags">Tags (comma separated)</label>
            <input id="pt-tags" value={f.tags} placeholder="bridal, care, kanjivaram" onChange={(e) => set("tags", e.target.value)} />
            {fieldErr(res, "tags")}
          </div>
        </div>
        <div className="field">
          <label htmlFor="pt-ex">Excerpt ({f.excerpt.length}/300)</label>
          <textarea id="pt-ex" value={f.excerpt} maxLength={300} rows={2} className="min-h-0!" placeholder="One or two sentences for the journal page and search results." aria-invalid={!!(res && !res.ok && res.fields?.excerpt)} onChange={(e) => set("excerpt", e.target.value)} />
          {fieldErr(res, "excerpt")}
        </div>
        <ImageField id="pt-cover" label="Cover image" value={f.cover} onChange={(v) => set("cover", v)} folder="/journal" uploadsEnabled={uploadsEnabled} placeholder="journal/kanjivaram-drape.webp" aspect="aspect-[3/2]" />
        {fieldErr(res, "cover")}
      </section>

      <section className="adm-card">
        <div className="adm-card-head">
          <h2 className="h3">Body <span className="muted normal-case tracking-normal font-body text-xs">Markdown · {words} words</span></h2>
          <div className="adm-row lg:hidden" role="tablist">
            <button type="button" role="tab" aria-selected={view === "write"} className={`adm-more ${view === "write" ? "text-ink!" : ""}`} onClick={() => setView("write")}>Write</button>
            <button type="button" role="tab" aria-selected={view === "preview"} className={`adm-more ${view === "preview" ? "text-ink!" : ""}`} onClick={() => setView("preview")}>Preview</button>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={`field ${view === "write" ? "" : "hidden lg:flex"}`}>
            <label htmlFor="pt-body" className="sr-only">Body in Markdown</label>
            <textarea
              id="pt-body"
              value={f.body}
              onChange={(e) => set("body", e.target.value)}
              className="min-h-[420px]! font-mono text-[13px]!"
              placeholder={"## A heading\n\nA paragraph with **bold**, *italic* and a [link](https://muddhugumma.com).\n\n- A list item\n- Another one\n\n> A pull quote"}
              aria-invalid={!!(res && !res.ok && res.fields?.body)}
            />
            {fieldErr(res, "body")}
            <small className="muted">## heading · **bold** · *italic* · [text](link) · - list · &gt; quote · blank line between paragraphs</small>
          </div>
          <div className={`border border-line bg-paper p-4 min-h-[420px] overflow-auto ${view === "preview" ? "" : "hidden lg:block"}`} aria-label="Preview">
            {f.body.trim() ? <article className={PROSE} dangerouslySetInnerHTML={{ __html: html }} /> : <p className="muted">The preview appears here as you write.</p>}
          </div>
        </div>
      </section>

      <div className="adm-savebar">
        <span className="adm-small">
          <span className={`status ${status === "published" ? "text-ok" : "text-muted"}`}>{status === "published" ? "Live" : "Draft"}</span>
          {post?.publishedAt ? <span className="muted ml-2">First published {post.publishedAt}</span> : null}
        </span>
        <div className="adm-row">
          <button className="btn ghost adm-btn" disabled={pending}>{pending ? "Saving…" : status === "published" ? "Save" : "Save draft"}</button>
          {status === "published" ? (
            <>
              <button type="button" className="btn ghost adm-btn" disabled={pending} onClick={() => submit("unpublish")}>Unpublish</button>
              <button type="button" className="btn adm-btn" disabled={pending} onClick={() => submit("publish")}>Update live post</button>
            </>
          ) : (
            <button type="button" className="btn bronze adm-btn" disabled={pending} onClick={() => submit("publish")}>Publish</button>
          )}
        </div>
      </div>
      <Msg res={res} />
      {post ? (
        <section className="adm-card adm-danger">
          <h2 className="h3">Delete post</h2>
          <p className="muted adm-small">Deleting removes the post for good. Unpublish instead if you might want it back.</p>
          <DeleteButton kind="post" id={post.id} label="Delete post" confirmText={`Delete "${post.title}"?`} after="/admin/journal" />
        </section>
      ) : null}
    </form>
  );
}
