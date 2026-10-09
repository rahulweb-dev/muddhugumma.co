"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { saveHome } from "@/lib/actions/site";
import { ImageField, Msg, fieldErr } from "../content/ui";
import type { Result } from "../content/shared";

type Slide = { kicker: string; title: string; accent: string; text: string; ctaLabel: string; ctaHref: string; linkLabel: string; linkHref: string; image: string; alt: string };
type Story = { kicker: string; title: string; accent: string; text: string; image: string };

const BLANK: Slide = { kicker: "", title: "", accent: "", text: "", ctaLabel: "Shop now", ctaHref: "/c/new", linkLabel: "", linkHref: "", image: "", alt: "" };

export function HomeEditor({ initial, saved, uploadsEnabled }: { initial: { slides: Slide[]; story: Story }; saved: boolean; uploadsEnabled: boolean }) {
  const router = useRouter();
  const [slides, setSlides] = useState(initial.slides);
  const [story, setStory] = useState(initial.story);
  const [res, setRes] = useState<Result | null>(null);
  const [pending, start] = useTransition();

  const edit = (i: number, k: keyof Slide, v: string) => setSlides((all) => all.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const move = (i: number, d: -1 | 1) =>
    setSlides((all) => {
      const next = [...all];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
  const err = (key: string) => fieldErr(res, key);

  const save = () => {
    setRes(null);
    start(async () => {
      const r = await saveHome({ slides, story });
      setRes(r);
      if (r.ok) router.refresh();
    });
  };

  const T = ({ id, label, value, onChange, max, hint, wide }: { id: string; label: string; value: string; onChange: (v: string) => void; max: number; hint?: string; wide?: boolean }) => (
    <div className={`field ${wide ? "full" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
      {err(id.replace(/^h-/, "").replace(/-/g, ".")) ?? (hint ? <small className="muted">{hint}</small> : null)}
    </div>
  );

  return (
    <form className="adm-form" noValidate onSubmit={(e) => { e.preventDefault(); save(); }}>
      {!saved ? <p className="notice">The homepage is showing a built-in example slide. Save to use your own.</p> : null}

      {slides.map((s, i) => (
        <section className="adm-card" key={i}>
          <div className="adm-card-head">
            <h2 className="h3">Slide {i + 1}</h2>
            <div className="adm-row">
              <button type="button" className="adm-icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move slide ${i + 1} up`}><Icon name="chevL" size={16} className="ic rotate-90" /></button>
              <button type="button" className="adm-icon-btn" disabled={i === slides.length - 1} onClick={() => move(i, 1)} aria-label={`Move slide ${i + 1} down`}><Icon name="chevR" size={16} className="ic rotate-90" /></button>
              <button type="button" className="adm-icon-btn" onClick={() => setSlides((all) => all.filter((_, j) => j !== i))} aria-label={`Remove slide ${i + 1}`}><Icon name="trash" size={16} /></button>
            </div>
          </div>
          <ImageField id={`h-slides-${i}-image`} label="Image" value={s.image} onChange={(v) => edit(i, "image", v)} folder="/home" uploadsEnabled={uploadsEnabled} placeholder="home/banner.jpg" aspect="aspect-[3/4]" />
          {err(`slides.${i}.image`)}
          <div className="form-grid two">
            {T({ id: `h-slides-${i}-kicker`, label: "Small heading", value: s.kicker, onChange: (v) => edit(i, "kicker", v), max: 60, hint: "e.g. New arrivals" })}
            {T({ id: `h-slides-${i}-alt`, label: "Image description", value: s.alt, onChange: (v) => edit(i, "alt", v), max: 160, hint: "For screen readers and Google" })}
            {T({ id: `h-slides-${i}-title`, label: "Heading", value: s.title, onChange: (v) => edit(i, "title", v), max: 60 })}
            {T({ id: `h-slides-${i}-accent`, label: "Heading, italic part", value: s.accent, onChange: (v) => edit(i, "accent", v), max: 40, hint: "Shown in bronze italics after the heading" })}
            <div className="field full">
              <label htmlFor={`h-slides-${i}-text`}>Text</label>
              <textarea id={`h-slides-${i}-text`} rows={2} maxLength={240} value={s.text} onChange={(e) => edit(i, "text", e.target.value)} />
            </div>
            {T({ id: `h-slides-${i}-ctaLabel`, label: "Button label", value: s.ctaLabel, onChange: (v) => edit(i, "ctaLabel", v), max: 30 })}
            {T({ id: `h-slides-${i}-ctaHref`, label: "Button link", value: s.ctaHref, onChange: (v) => edit(i, "ctaHref", v), max: 300, hint: "e.g. /c/sarees" })}
            {T({ id: `h-slides-${i}-linkLabel`, label: "Second link label (optional)", value: s.linkLabel, onChange: (v) => edit(i, "linkLabel", v), max: 30 })}
            {T({ id: `h-slides-${i}-linkHref`, label: "Second link", value: s.linkHref, onChange: (v) => edit(i, "linkHref", v), max: 300 })}
          </div>
        </section>
      ))}
      {slides.length < 6 ? (
        <button type="button" className="btn ghost adm-btn self-start" onClick={() => setSlides((all) => [...all, BLANK])}>
          <Icon name="plus" size={16} /> Add a slide
        </button>
      ) : null}

      <section className="adm-card">
        <h2 className="h3">Story section</h2>
        <ImageField id="h-story-image" label="Image" value={story.image} onChange={(v) => setStory((x) => ({ ...x, image: v }))} folder="/home" uploadsEnabled={uploadsEnabled} placeholder="home/story.jpg" aspect="aspect-[3/4]" />
        <div className="form-grid two">
          {T({ id: "h-story-kicker", label: "Small heading", value: story.kicker, onChange: (v) => setStory((x) => ({ ...x, kicker: v })), max: 60 })}
          {T({ id: "h-story-title", label: "Heading", value: story.title, onChange: (v) => setStory((x) => ({ ...x, title: v })), max: 80 })}
          {T({ id: "h-story-accent", label: "Heading, italic part", value: story.accent, onChange: (v) => setStory((x) => ({ ...x, accent: v })), max: 60 })}
          <div className="field full">
            <label htmlFor="h-story-text">Text</label>
            <textarea id="h-story-text" rows={5} maxLength={1200} value={story.text} onChange={(e) => setStory((x) => ({ ...x, text: e.target.value }))} />
            <small className="muted">Leave a blank line between paragraphs.</small>
          </div>
        </div>
      </section>

      <Msg res={res} />
      <div className="adm-savebar">
        <span className="adm-small">Changes go live when you save.</span>
        <button className="btn adm-btn" disabled={pending}>{pending ? "Saving…" : "Save homepage"}</button>
      </div>
    </form>
  );
}
