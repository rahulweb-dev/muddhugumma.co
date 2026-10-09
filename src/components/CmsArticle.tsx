import { renderMarkdown } from "@/lib/markdown";
import type { PageDTO } from "@/lib/pages";

/** Heading with the last word in the bronze italic accent, as on the coded pages. */
export function AccentTitle({ title, as: H = "h1" }: { title: string; as?: "h1" | "h2" }) {
  const words = title.trim().split(/\s+/);
  const last = words.pop();
  return (
    <H className={H === "h1" ? "h1" : "h2"}>
      {words.join(" ")} {last && <i>{last}</i>}
    </H>
  );
}

const BODY =
  "flex flex-col gap-3 text-[15px] leading-relaxed text-[#3E3A35] [&_a]:underline [&_a]:underline-offset-[3px] [&_h2]:m-0 [&_h2]:mt-5 [&_h2]:font-display [&_h2]:text-[15px] [&_h2]:font-normal [&_h2]:uppercase [&_h2]:tracking-[.14em] [&_h2]:text-ink [&_h2]:border-t [&_h2]:border-line [&_h2]:pt-5 [&_h3]:mt-2 [&_h3]:font-bold [&_h3]:text-[15px] [&_li]:max-w-[65ch] [&_p]:m-0 [&_p]:max-w-[65ch] [&_ul]:m-0 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-[18px] [&_ol]:m-0 [&_ol]:flex [&_ol]:list-decimal [&_ol]:flex-col [&_ol]:gap-1.5 [&_ol]:pl-[18px]";

/** A page written in Admin → Pages: title, intro and Markdown body. */
export function CmsArticle({ page }: { page: PageDTO }) {
  return (
    <article className="min-w-0 max-w-[760px]">
      <header className="page-head">
        <AccentTitle title={page.title} />
        {page.intro && <p className="m-0 max-w-[60ch] text-base text-muted">{page.intro}</p>}
      </header>
      <div className={BODY} dangerouslySetInnerHTML={{ __html: renderMarkdown(page.body) }} />
    </article>
  );
}
