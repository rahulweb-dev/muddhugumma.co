import type { Metadata } from "next";
import Link from "next/link";
import type { Types } from "mongoose";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Sale, type SaleDoc } from "@/lib/models";
import { first, fmtDateTime, qs } from "@/lib/admin-data";
import { Icon } from "@/components/Icon";
import { saleOverlaps, saleState, type SaleState } from "@/components/admin/content/data";
import { ToggleSwitch } from "@/components/admin/content/ui";
import { allCategories } from "@/lib/categories";

export const metadata: Metadata = { title: "Timed sales" };

type Row = SaleDoc & { _id: Types.ObjectId };
type SP = Promise<Record<string, string | string[] | undefined>>;
const STATE: Record<SaleState, { label: string; tone: string }> = {
  running: { label: "Running", tone: "text-ok" },
  scheduled: { label: "Scheduled", tone: "text-bronze" },
  ended: { label: "Ended", tone: "text-muted" },
  off: { label: "Switched off", tone: "text-sale" },
};
const COLLECTION_LABEL: Record<string, string> = { bridal: "Bridal", festive: "Festive", new: "New in", bestseller: "Bestseller" };

export default async function AdminSales({ searchParams }: { searchParams: SP }) {
  await requireAdmin("merch.manage");
  const sp = await searchParams;
  const raw = first(sp.state);
  const filter = (["running", "scheduled", "ended", "off"] as const).find((s) => s === raw) ?? "";

  await db();
  const CAT: Record<string, string> = { ...COLLECTION_LABEL, ...Object.fromEntries((await allCategories()).map((c) => [c.slug, c.name])) };
  const rows = await Sale.find().sort({ startsAt: -1 }).limit(300).lean<Row[]>();
  const now = Date.now();
  const withState = rows.map((s) => ({ s, state: saleState({ active: !!s.active, startsAt: s.startsAt, endsAt: s.endsAt }, now) }));
  const overlaps = await saleOverlaps(
    rows.map((s) => ({ id: String(s._id), name: s.name, categories: s.categories ?? [], collections: s.collections ?? [], slugs: s.slugs ?? [], regions: s.regions ?? [], startsAt: s.startsAt, endsAt: s.endsAt, active: !!s.active })),
    now
  );
  const order: SaleState[] = ["running", "scheduled", "off", "ended"];
  const shown = withState.filter((x) => !filter || x.state === filter).sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state));
  const count = (st: SaleState) => withState.filter((x) => x.state === st).length;
  const clashes = [...overlaps.values()].length;

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">Merchandising</p>
          <h1 className="adm-title">Timed sales <span className="muted">({count("running")} running)</span></h1>
          <p className="muted adm-small">Percentage off chosen categories, collections or products, between two dates. All times are IST.</p>
        </div>
        <Link className="btn adm-btn" href="/admin/sales/new"><Icon name="plus" size={16} /> New sale</Link>
      </header>

      {clashes ? <p className="notice err">{clashes} sale{clashes === 1 ? " overlaps" : "s overlap"} another sale on the same products. Shoppers get only one discount, so check which should win.</p> : null}

      <nav className="adm-tabs" aria-label="Filter by state">
        <Link href="/admin/sales" aria-current={!filter ? "page" : undefined}>All <span>{rows.length}</span></Link>
        {order.map((st) => (
          <Link key={st} href={`/admin/sales${qs({}, { state: st })}`} aria-current={filter === st ? "page" : undefined}>{STATE[st].label} <span>{count(st)}</span></Link>
        ))}
      </nav>

      {shown.length ? (
        <div className="table-wrap adm-card flush">
          <table className="t adm-t">
            <thead><tr><th>Sale</th><th className="num">Off</th><th>Applies to</th><th>Regions</th><th>When (IST)</th><th>Status</th><th>On</th></tr></thead>
            <tbody>
              {shown.map(({ s, state }) => {
                const id = String(s._id);
                const warn = overlaps.get(id);
                const targets = [...(s.categories ?? []), ...(s.collections ?? [])].map((c) => CAT[c] ?? c);
                if (s.slugs?.length) targets.push(`${s.slugs.length} product${s.slugs.length === 1 ? "" : "s"}`);
                return (
                  <tr key={id} className={state === "ended" || state === "off" ? "off" : ""}>
                    <td>
                      <Link className="adm-a" href={`/admin/sales/${id}`}>{s.name}</Link>
                      {s.banner ? <><br /><small className="muted">{s.banner}</small></> : null}
                      {warn?.map((w) => <small key={w} className="block text-sale">{w}</small>)}
                    </td>
                    <td className="num"><b>{s.percentOff}%</b></td>
                    <td>{targets.join(", ") || "—"}</td>
                    <td>{(s.regions ?? []).map((r) => (r === "uk" ? "UK" : "India")).join(", ")}</td>
                    <td className="nowrap">{fmtDateTime(s.startsAt)}<br /><small className="muted">to {fmtDateTime(s.endsAt)}</small></td>
                    <td><span className={`status ${STATE[state].tone}`}>{STATE[state].label}</span></td>
                    <td>{state === "ended" ? <small className="muted">—</small> : <ToggleSwitch kind="sale" id={id} active={!!s.active} label={s.name} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <p>{rows.length ? "No sales in this state." : "No timed sales yet. Schedule one ahead of the next festival so it starts and ends on its own."}</p>
          {!rows.length ? <Link className="btn adm-btn" href="/admin/sales/new">Create a sale</Link> : null}
        </div>
      )}
    </div>
  );
}
