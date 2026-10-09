import "server-only";

// Branded email shell with inline styles (email clients ignore stylesheets). Studio Stone colours.
const C = { paper: "#FBFAF7", stone: "#F2EEE8", ink: "#1B1A18", muted: "#6E6962", line: "#E3DDD3", bronze: "#9A744A", cocoa: "#5B3A22" };

export const siteUrl = (path = "") => `${(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3100").replace(/\/$/, "")}${path}`;

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type EmailParts = {
  preheader: string;
  kicker?: string;
  heading: string;
  /** Trusted HTML (build it with esc() for any user-supplied text). */
  body: string;
  cta?: { label: string; url: string };
  footnote?: string;
};

export function renderEmail(p: EmailParts): { html: string; text: string } {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.heading)}</title></head>
<body style="margin:0;background:${C.stone};font-family:Georgia,'Times New Roman',serif;color:${C.ink}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(p.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.stone};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.paper};border:1px solid ${C.line}">
<tr><td style="padding:28px 32px 8px;text-align:center">
<div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:4px;color:${C.muted}">HOUSE OF</div>
<div style="font-size:30px;color:${C.cocoa};font-style:italic">Muddhugumma</div>
</td></tr>
<tr><td style="padding:16px 32px 8px">
${p.kicker ? `<div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${C.bronze};font-weight:bold">${esc(p.kicker)}</div>` : ""}
<h1 style="margin:8px 0 12px;font-family:Arial,sans-serif;font-weight:normal;font-size:22px;letter-spacing:2px;text-transform:uppercase">${esc(p.heading)}</h1>
<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#3E3A35">${p.body}</div>
</td></tr>
${p.cta ? `<tr><td style="padding:12px 32px 8px"><a href="${esc(p.cta.url)}" style="display:inline-block;background:${C.ink};color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;padding:14px 26px">${esc(p.cta.label)}</a></td></tr>` : ""}
<tr><td style="padding:24px 32px 28px;font-family:Arial,sans-serif;font-size:12px;color:${C.muted};border-top:1px solid ${C.line}">
${p.footnote ? `${esc(p.footnote)}<br><br>` : ""}Questions? Reply to this email or visit <a href="${siteUrl("/contact")}" style="color:${C.bronze}">our help centre</a>.<br>
House of Muddhugumma · Hyderabad, India
</td></tr></table></td></tr></table></body></html>`;
  const plain = p.body
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<\/(p|li|tr|div)>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(lt|gt|quot|#39|amp);/g, (_, e: string) => ({ lt: "<", gt: ">", quot: '"', "#39": "'", amp: "&" })[e]!)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const text = [p.kicker, p.heading, plain, p.cta ? `${p.cta.label}: ${p.cta.url}` : "", p.footnote]
    .filter(Boolean)
    .join("\n\n");
  return { html, text };
}
