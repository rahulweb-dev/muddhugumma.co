import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Enquiry, type EnquiryDoc } from "@/lib/models";
import { escapeRx, first, fmtDateTime } from "@/lib/admin-data";
import { EnquiryActions } from "@/components/admin/EnquiryActions";

export const metadata: Metadata = { title: "Messages from customers" };

const TABS = [
  { key: "open", label: "Waiting" },
  { key: "replied", label: "Replied" },
  { key: "closed", label: "Done" },
  { key: "all", label: "All" },
] as const;

export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("enquiries.manage");
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === first(sp.status))?.key ?? "open") as (typeof TABS)[number]["key"];
  const q = first(sp.q).trim().slice(0, 80);

  await db();
  const filter: Record<string, unknown> = tab === "all" ? {} : { status: tab };
  if (q) {
    const rx = new RegExp(escapeRx(q), "i");
    filter.$or = [{ number: rx }, { email: rx }, { name: rx }, { orderNumber: rx }, { message: rx }];
  }
  const [items, counts] = await Promise.all([
    Enquiry.find(filter).sort({ createdAt: -1 }).limit(60).lean<EnquiryDoc[]>(),
    Enquiry.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);
  const count = (k: string) => (k === "all" ? counts.reduce((s, c) => s + c.n, 0) : counts.find((c) => c._id === k)?.n ?? 0);

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">Customers</p>
          <h1 className="adm-title">Customer messages</h1>
          <p className="muted adm-small">From the Contact us form. Replies are emailed from the store address and kept here.</p>
        </div>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <nav className="flex flex-wrap gap-2" aria-label="Message status">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/admin/enquiries?status=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              aria-current={tab === t.key ? "page" : undefined}
              className="chip aria-[current=page]:border-ink aria-[current=page]:bg-ink aria-[current=page]:text-paper"
            >
              {t.label} <span className="tabular-nums opacity-70">{count(t.key)}</span>
            </Link>
          ))}
        </nav>
        <form method="get" className="flex w-full gap-2 sm:w-auto">
          <input type="hidden" name="status" value={tab} />
          <label htmlFor="eq-q" className="sr-only">Search messages</label>
          <input id="eq-q" name="q" type="search" defaultValue={q} placeholder="Name, email, order or reference" className="h-10 min-w-0 flex-1 border border-line bg-paper px-3 text-sm sm:w-72" />
          <button className="btn adm-btn h-10">Search</button>
        </form>
      </div>

      {items.length === 0 ? (
        <p className="adm-card muted m-0">{q ? "No messages match that search." : tab === "open" ? "No messages waiting. Nice work." : "Nothing here yet."}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {items.map((e) => (
            <li key={String(e._id)} className="adm-card">
              <details open={e.status === "open"}>
                <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-2">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <b className="text-[15px]">{e.topic}</b>
                    <span className="adm-small muted break-words">
                      {e.name} · {e.email}
                      {e.phone ? ` · ${e.phone}` : ""} · {e.region === "uk" ? "UK" : "India"}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`status ${e.status === "open" ? "placed" : e.status === "replied" ? "shipped" : "delivered"}`}>
                      {e.status === "open" ? "Waiting" : e.status === "replied" ? "Replied" : "Done"}
                    </span>
                    <span className="adm-small muted">{e.number} · {fmtDateTime(e.createdAt)}</span>
                  </span>
                </summary>
                <div className="mt-4 flex flex-col gap-4">
                  {e.orderNumber ? (
                    <p className="m-0 adm-small">
                      About order <Link className="adm-a" href={`/admin/orders?q=${encodeURIComponent(e.orderNumber)}`}>{e.orderNumber}</Link>
                    </p>
                  ) : null}
                  <p className="m-0 whitespace-pre-wrap border-l-2 border-line pl-3">{e.message}</p>
                  {e.replies?.length ? (
                    <ol className="m-0 flex list-none flex-col gap-2 p-0">
                      {e.replies.map((r, i) => (
                        <li key={i} className="bg-stone p-3">
                          <small className="muted">{r.by} replied · {fmtDateTime(r.at)}</small>
                          <p className="m-0 mt-1 whitespace-pre-wrap">{r.body}</p>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  <EnquiryActions id={String(e._id)} status={e.status} name={e.name ?? ""} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
