import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Page, type PageDoc } from "@/lib/models";
import { PAGE_SLOTS } from "@/lib/pages";
import { fmtDate } from "@/lib/admin-data";
import { Icon } from "@/components/Icon";

export const metadata: Metadata = { title: "Pages" };

export default async function AdminPages() {
  await requireAdmin("content.manage");
  await db();
  const saved = await Page.find({}, { slug: 1, title: 1, published: 1, updatedAt: 1 }).lean<PageDoc[]>();
  const bySlug = new Map(saved.map((p) => [p.slug, p]));

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">Website</p>
          <h1 className="adm-title">Pages</h1>
        </div>
      </header>
      <p className="muted adm-small m-0">Your story, FAQ and policies. A page you haven&apos;t written yet shows the store&apos;s built-in text.</p>
      <ul className="list-none m-0 p-0 adm-card flush">
        {PAGE_SLOTS.map((slot) => {
          const p = bySlug.get(slot.slug);
          const state = !p ? "Built-in text" : p.published ? "Your text, live" : "Your text, hidden";
          return (
            <li key={slot.slug} className="border-b border-line last:border-b-0">
              <Link href={`/admin/pages/${slot.slug}`} className="flex gap-3 items-center p-3 hover:bg-[#FAF7F2]">
                <Icon name="edit" size={18} />
                <span className="flex flex-col gap-1 min-w-0 flex-1">
                  <b className="font-semibold truncate">{p?.title || slot.label}</b>
                  <small className="muted">
                    {slot.href}
                    {p?.updatedAt ? ` · edited ${fmtDate(p.updatedAt)}` : ""}
                  </small>
                </span>
                <span className={`status shrink-0 ${p?.published ? "text-ok" : "text-muted"}`}>{state}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
