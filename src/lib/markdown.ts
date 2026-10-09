/*
 * Small, safe Markdown → HTML renderer for journal posts. Owner: catalogue & discovery.
 * Supports headings, paragraphs, **bold**, *italic*, `code`, links (https or same-site paths, rel="noopener"),
 * ordered and unordered lists, images (ImageKit path or https URL), blockquotes and --- rules.
 * All raw HTML in the source is escaped, never passed through.
 */

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const unescape = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** Allowed link targets: https URLs, same-site paths ("/c/sarees") and in-page anchors. */
function safeHref(raw: string): string | null {
  const u = unescape(raw).trim();
  if (/^https:\/\/[^\s"'<>]+$/i.test(u)) return u;
  if (/^\/(?!\/)[^\s"'<>]*$/.test(u)) return u;
  if (/^#[\w-]+$/.test(u)) return u;
  return null;
}

/** Image source: https URL, or an ImageKit path such as "journal/drape.webp". */
function safeImage(raw: string): string | null {
  const u = unescape(raw).trim();
  if (/^https:\/\/[^\s"'<>]+$/i.test(u)) return u;
  const path = u.replace(/^\/+/, "");
  if (!/^[\w\-./]+$/.test(path) || path.includes("..")) return null;
  const ep = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT?.replace(/\/$/, "");
  return ep ? `${ep}/${path}?tr=w-1200,q-80,f-auto` : `/img/${path}`;
}

/** Inline formatting on already-escaped text. Links, images and code are swapped out first so emphasis never touches URLs. */
function inline(text: string): string {
  const slots: string[] = [];
  const hold = (html: string) => `\u0000${slots.push(html) - 1}\u0000`;
  let s = text.replace(/`([^`]+)`/g, (_, code: string) => hold(`<code>${code}</code>`));
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^)]*?)&quot;)?\)/g, (m, alt: string, src: string, title?: string) => {
    const url = safeImage(src);
    if (!url) return alt;
    return hold(`<img src="${escapeHtml(url)}" alt="${alt}" loading="lazy"${title ? ` title="${title}"` : ""}>`);
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label: string, href: string) => {
    const url = safeHref(href);
    if (!url) return label;
    const external = url.startsWith("https://");
    return hold(`<a href="${escapeHtml(url)}"${external ? ' rel="noopener noreferrer" target="_blank"' : ""}>${emphasis(label)}</a>`);
  });
  s = emphasis(s);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => slots[Number(i)]);
}

function emphasis(s: string): string {
  return s
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>")
    .replace(/__(?=\S)([\s\S]*?\S)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_(?!\w)/g, "$1<em>$2</em>");
}

type Block = { kind: "p" | "ul" | "ol" | "quote" | "h" | "hr" | "img"; lines: string[]; level?: number };

export function renderMarkdown(md: string): string {
  const lines = escapeHtml(String(md ?? "").replace(/\r\n?/g, "\n")).split("\n");
  const blocks: Block[] = [];
  let cur: Block | null = null;
  const flush = () => {
    if (cur) blocks.push(cur);
    cur = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) {
      flush();
      continue;
    }
    const h = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*$/);
    if (h) {
      flush();
      blocks.push({ kind: "h", level: Math.min(4, Math.max(2, h[1].length === 1 ? 2 : h[1].length)), lines: [h[2]] });
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      blocks.push({ kind: "hr", lines: [] });
      continue;
    }
    if (/^\s*!\[[^\]]*\]\([^)]+\)\s*$/.test(line)) {
      flush();
      blocks.push({ kind: "img", lines: [line.trim()] });
      continue;
    }
    const q = line.match(/^\s{0,3}&gt;\s?(.*)$/);
    if (q) {
      if (cur?.kind !== "quote") {
        flush();
        cur = { kind: "quote", lines: [] };
      }
      cur.lines.push(q[1]);
      continue;
    }
    const ul = line.match(/^\s{0,3}[-*+]\s+(.*)$/);
    if (ul) {
      if (cur?.kind !== "ul") {
        flush();
        cur = { kind: "ul", lines: [] };
      }
      cur.lines.push(ul[1]);
      continue;
    }
    const ol = line.match(/^\s{0,3}\d{1,3}[.)]\s+(.*)$/);
    if (ol) {
      if (cur?.kind !== "ol") {
        flush();
        cur = { kind: "ol", lines: [] };
      }
      cur.lines.push(ol[1]);
      continue;
    }
    // Indented continuation of a list item.
    if ((cur?.kind === "ul" || cur?.kind === "ol") && /^\s{2,}\S/.test(line)) {
      cur.lines[cur.lines.length - 1] += ` ${line.trim()}`;
      continue;
    }
    if (cur?.kind !== "p") {
      flush();
      cur = { kind: "p", lines: [] };
    }
    cur.lines.push(line.trim());
  }
  flush();

  return blocks
    .map((b) => {
      switch (b.kind) {
        case "h":
          return `<h${b.level}>${inline(b.lines[0])}</h${b.level}>`;
        case "hr":
          return "<hr>";
        case "img": {
          const html = inline(b.lines[0]);
          const alt = b.lines[0].match(/^!\[([^\]]*)\]/)?.[1] ?? "";
          return html.startsWith("<img") ? `<figure>${html}${alt ? `<figcaption>${alt}</figcaption>` : ""}</figure>` : `<p>${html}</p>`;
        }
        case "ul":
          return `<ul>${b.lines.map((l) => `<li>${inline(l)}</li>`).join("")}</ul>`;
        case "ol":
          return `<ol>${b.lines.map((l) => `<li>${inline(l)}</li>`).join("")}</ol>`;
        case "quote":
          return `<blockquote>${b.lines
            .join("\n")
            .split(/\n\s*\n/)
            .map((p) => `<p>${inline(p.replace(/\n/g, " ").trim())}</p>`)
            .join("")}</blockquote>`;
        default:
          return `<p>${inline(b.lines.join(" "))}</p>`;
      }
    })
    .join("\n");
}
