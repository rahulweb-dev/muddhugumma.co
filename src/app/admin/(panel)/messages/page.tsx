import type { Metadata } from "next";
import Link from "next/link";
import mongoose, { type Types } from "mongoose";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { messagingMode } from "@/lib/notify";
import { Outbox, type OutboxDoc } from "@/lib/models";
import { escapeRx, first, fmtDateTime, qs } from "@/lib/admin-data";

export const metadata: Metadata = { title: "Messages" };

const PER_PAGE = 40;
const CHANNELS = ["email", "whatsapp", "sms"] as const;
const STATUSES = ["sent", "logged", "failed"] as const;
const CHANNEL_LABEL: Record<string, string> = { email: "Email", whatsapp: "WhatsApp", sms: "SMS" };
type SP = Promise<Record<string, string | string[] | undefined>>;
type Row = OutboxDoc & { _id: Types.ObjectId };

export default async function MessagesPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin("messages.view");
  const sp = await searchParams;
  const channel = (CHANNELS as readonly string[]).includes(first(sp.channel)) ? first(sp.channel) : "";
  const status = (STATUSES as readonly string[]).includes(first(sp.status)) ? first(sp.status) : "";
  const template = first(sp.template).replace(/[^\w.-]/g, "").slice(0, 60);
  const q = first(sp.q).trim().slice(0, 80);
  const id = first(sp.id);
  const page = Math.max(1, Math.floor(Number(first(sp.page)) || 1));

  const filter: Record<string, unknown> = {};
  if (channel) filter.channel = channel;
  if (status) filter.status = status;
  if (template) filter.template = template;
  if (q) {
    const rx = new RegExp(escapeRx(q), "i");
    filter.$or = [{ to: rx }, { ref: rx }, { subject: rx }];
  }

  await db();
  const [total, rows, templates, selected] = await Promise.all([
    Outbox.countDocuments(filter),
    Outbox.find(filter, { body: 0 }).sort({ createdAt: -1 }).skip((page - 1) * PER_PAGE).limit(PER_PAGE).lean<Row[]>(),
    Outbox.distinct("template"),
    id && mongoose.isValidObjectId(id) ? Outbox.findById(id).lean<Row>() : Promise.resolve(null),
  ]);
  const mode = messagingMode();
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const base = { channel, status, template, q, page: page > 1 ? String(page) : undefined };

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">Admin</p>
          <h1 className="adm-title">Messages <span className="muted">({total})</span></h1>
          <p className="muted adm-small">
            Every email, WhatsApp and SMS the store sends. Email is {mode.email === "live" ? "live" : "in test mode"}, WhatsApp {mode.whatsapp === "live" ? "live" : "in test mode"}, SMS{" "}
            {mode.sms === "live" ? "live" : "in test mode"}. In test mode messages are logged here but not delivered.
          </p>
        </div>
      </header>

      <form className="adm-filters" method="get">
        <div className="field">
          <label htmlFor="channel">Channel</label>
          <select id="channel" name="channel" defaultValue={channel}>
            <option value="">All channels</option>
            {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="template">Template</label>
          <select id="template" name="template" defaultValue={template}>
            <option value="">All templates</option>
            {(templates as string[]).filter(Boolean).sort().map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status}>
            <option value="">Any status</option>
            <option value="sent">Sent</option>
            <option value="logged">Logged (test mode)</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div className="field grow">
          <label htmlFor="q">Recipient, order or subject</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="name@example.com or MG-2610…" />
        </div>
        <button className="btn ghost adm-btn">Filter</button>
        {(channel || status || template || q) && <Link className="adm-more" href="/admin/messages">Clear</Link>}
      </form>

      <div className={selected ? "adm-cols wide-left" : ""}>
        <div className="adm-stack">
          {rows.length ? (
            <div className="table-wrap adm-card flush">
              <table className="t adm-t">
                <thead>
                  <tr><th>When</th><th>Channel</th><th>To</th><th>Template / subject</th><th>Ref</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const href = `/admin/messages${qs(base, { id: String(r._id) })}`;
                    return (
                      <tr key={String(r._id)} className={selected && String(selected._id) === String(r._id) ? "adm-row-on" : ""}>
                        <td className="nowrap"><Link className="adm-a" href={href} scroll={false}>{fmtDateTime(r.createdAt)}</Link></td>
                        <td>{CHANNEL_LABEL[r.channel] ?? r.channel}</td>
                        <td className="break-all">{r.to}</td>
                        <td>
                          <code>{r.template || "—"}</code>
                          {r.subject ? <><br /><small className="muted">{r.subject}</small></> : null}
                        </td>
                        <td>{r.ref ? <Link className="adm-a" href={`/admin/orders?q=${encodeURIComponent(r.ref)}`}>{r.ref}</Link> : <span className="muted">—</span>}</td>
                        <td><span className={`status msg-${r.status}`}>{r.status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty"><p>{total === 0 && !channel && !status && !template && !q ? "No messages yet." : "No messages match these filters."}</p></div>
          )}
          {pages > 1 && (
            <nav className="adm-pager" aria-label="Pages">
              {page > 1 ? <Link href={`/admin/messages${qs(base, { page: page - 1 })}`}>← Newer</Link> : <span />}
              <span className="muted">Page {page} of {pages}</span>
              {page < pages ? <Link href={`/admin/messages${qs(base, { page: page + 1 })}`}>Older →</Link> : <span />}
            </nav>
          )}
        </div>

        {selected ? (
          <section className="adm-card lg:sticky lg:top-4" aria-label="Message preview">
            <div className="adm-card-head">
              <h2 className="h3">{CHANNEL_LABEL[selected.channel] ?? selected.channel} preview</h2>
              <Link className="adm-more" href={`/admin/messages${qs(base)}`} scroll={false}>Close</Link>
            </div>
            <dl className="adm-dl">
              <div><dt>To</dt><dd className="break-all">{selected.to}</dd></div>
              {selected.subject ? <div><dt>Subject</dt><dd>{selected.subject}</dd></div> : null}
              <div><dt>Template</dt><dd><code>{selected.template || "—"}</code></dd></div>
              <div><dt>Sent</dt><dd>{fmtDateTime(selected.createdAt)}</dd></div>
              <div><dt>Provider</dt><dd>{selected.provider || "—"} · <span className={`status msg-${selected.status}`}>{selected.status}</span></dd></div>
            </dl>
            {selected.error ? <p className="notice err">{selected.error}</p> : null}
            {selected.channel === "email" ? (
              <iframe
                title="Email preview"
                sandbox=""
                srcDoc={selected.body ?? ""}
                className="w-full h-[640px] border border-line bg-white"
              />
            ) : (
              <pre className="adm-msg-text">{selected.body || "(empty)"}</pre>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
