import type { Metadata } from "next";
import Link from "next/link";
import mongoose from "mongoose";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { Order, Product } from "@/lib/models";
import { formatMoney, REGION_CONFIG } from "@/lib/region";
import { MEASUREMENT_FIELDS, STITCH_LABEL, codToCollect, first, fmtDate, isStitchingItem, type LeanOrder, type StitchStatusKey } from "@/lib/admin-data";
import { PrintButton } from "@/components/admin/PrintButton";
import { canSeeRegion } from "@/lib/admin-scope";

export const metadata: Metadata = { title: "Packing slip" };

const asRecord = (m: unknown): Record<string, string> => (m instanceof Map ? Object.fromEntries(m) : ((m as Record<string, string>) ?? {}));

export default async function PackingSlip({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("orders.ship");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!mongoose.isValidObjectId(id)) notFound();
  await db();
  const [o, settings] = await Promise.all([Order.findById(id).lean<LeanOrder>(), getSettings()]);
  if (!o || !(await canSeeRegion(o.region))) notFound();
  const mto = new Set<string>(await Product.distinct("slug", { slug: { $in: o.items.map((i) => i.slug).filter(Boolean) }, madeToOrder: true }));

  const r = o.region;
  const a = o.address ?? {};
  const collect = codToCollect(o);
  const money = (n?: number) => formatMoney(n ?? 0, r);
  const units = o.items.reduce((n, i) => n + (i.qty ?? 1), 0);

  return (
    <div className="adm-page narrow print:p-0 print:max-w-none">
      <div className="adm-row justify-between print:hidden">
        <p className="kick"><Link href={`/admin/orders/${id}`}>Order {o.number}</Link> / Packing slip</p>
        <div className="adm-row">
          <Link className="adm-more" href="/admin/packing">Packing queue</Link>
          <PrintButton label="Print packing slip" auto={first(sp.print) === "1"} />
        </div>
      </div>

      <article className="bg-white border border-line p-5 md:p-8 flex flex-col gap-6 text-ink print:border-0 print:p-0 print:gap-4 print:text-[12px]">
        <header className="flex flex-wrap justify-between items-start gap-4 border-b border-ink pb-4">
          <div>
            <p className="font-display uppercase tracking-[.3em] text-[10px] text-muted m-0">House of</p>
            <p className="font-script text-[30px] leading-none text-cocoa m-0">Muddhugumma</p>
            <p className="text-muted text-xs mt-2 mb-0">Packing slip · {fmtDate(o.createdAt)} · {REGION_CONFIG[r].label}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold tracking-[.2em] uppercase text-muted m-0">Order</p>
            <p className="font-display text-[34px] md:text-[44px] leading-none tracking-wider m-0 print:text-[40px]">{o.number}</p>
            <p className="text-xs text-muted mt-1 mb-0">{units} piece{units === 1 ? "" : "s"} · {o.items.length} line{o.items.length === 1 ? "" : "s"}</p>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-[1.4fr_1fr] print:grid-cols-[1.4fr_1fr]" aria-label="Address label">
          <div className="border-2 border-ink p-4 md:p-5 break-inside-avoid">
            <p className="text-[10px] font-bold tracking-[.2em] uppercase m-0 mb-2">Ship to</p>
            <address className="not-italic text-[20px] md:text-[22px] leading-snug print:text-[20px]">
              <b className="block text-[24px] md:text-[26px] print:text-[24px]">{a.name}</b>
              {a.line1}
              {a.line2 ? <><br />{a.line2}</> : null}
              <br />{[a.city, a.state].filter(Boolean).join(", ")}
              <br /><b className="tracking-wider">{a.postcode}</b> · {REGION_CONFIG[r].country}
              {a.phone ? <><br />Phone {a.phone}</> : null}
            </address>
            <p className="font-display text-[22px] tracking-wider mt-3 mb-0 border-t border-ink pt-2">{o.number}</p>
          </div>
          <div className="flex flex-col gap-3">
            <div className={`border-2 p-4 break-inside-avoid ${collect ? "border-sale text-sale" : "border-ok text-ok"}`}>
              {collect ? (
                <>
                  <p className="text-[10px] font-bold tracking-[.2em] uppercase m-0">Cash on delivery</p>
                  <p className="font-display text-[30px] leading-tight m-0">Collect {money(collect)}</p>
                  {o.partialCod?.paidOnline ? <p className="text-xs m-0">Part COD: {money(o.partialCod.paidOnline)} already paid online.</p> : null}
                </>
              ) : (
                <>
                  <p className="text-[10px] font-bold tracking-[.2em] uppercase m-0">Prepaid</p>
                  <p className="font-display text-[22px] leading-tight m-0">Nothing to collect</p>
                </>
              )}
            </div>
            <div className="border border-line p-3 text-xs break-inside-avoid">
              <p className="text-[10px] font-bold tracking-[.2em] uppercase text-muted m-0 mb-1">Return address</p>
              {settings.legalName}
              <br />
              {settings.address}
            </div>
            {o.gift?.wrap ? (
              <div className="border-2 border-bronze p-3 break-inside-avoid">
                <p className="text-[10px] font-bold tracking-[.2em] uppercase text-bronze m-0">Gift wrap · no prices in the parcel</p>
                {o.gift.message ? <p className="font-serif italic text-[18px] leading-snug mt-1 mb-0">“{o.gift.message}”</p> : <p className="text-xs m-0 mt-1">No card message.</p>}
              </div>
            ) : null}
          </div>
        </section>

        <section aria-label="Items">
          <table className="t w-full">
            <thead>
              <tr>
                <th className="w-8 print:w-6" aria-label="Packed" />
                <th>Item</th>
                <th>Size</th>
                <th className="num">Qty</th>
                <th>Options and notes</th>
              </tr>
            </thead>
            <tbody>
              {o.items.map((it, i) => {
                const stitched = isStitchingItem(it, mto);
                const st = (it.stitching?.status as StitchStatusKey | undefined) ?? (stitched ? "measurements_needed" : undefined);
                const m = asRecord(it.stitching?.measurements);
                const ms = MEASUREMENT_FIELDS.filter((f) => m[f.key]).map((f) => `${f.label} ${m[f.key]}"`);
                return (
                  <tr key={i} className="break-inside-avoid align-top">
                    <td><span className="inline-block w-5 h-5 border-2 border-ink" aria-hidden="true" /></td>
                    <td>
                      <b>{it.name}</b>
                      <br />
                      <small className="text-muted">{it.slug}</small>
                    </td>
                    <td className="font-bold text-[16px]">{it.size}</td>
                    <td className="num font-bold text-[16px]">{it.qty}</td>
                    <td className="text-[12.5px]">
                      {it.options?.blouse ? <div>Blouse: {it.options.blouse === "stitched" ? "stitched to measure" : "unstitched piece"}</div> : null}
                      {it.options?.fallPico ? <div>Fall and pico done</div> : null}
                      {it.slug && mto.has(it.slug) ? <div>Made to order</div> : null}
                      {stitched && st ? (
                        <div className={st === "ready" ? "text-ok" : "text-sale font-bold"}>
                          Stitching: {STITCH_LABEL[st]}
                          {st !== "ready" ? " — check before packing" : ""}
                        </div>
                      ) : null}
                      {it.stitching?.tailor ? <div>Tailor: {it.stitching.tailor}</div> : null}
                      {ms.length ? <div className="text-muted">{ms.join(" · ")}</div> : null}
                      {it.stitching?.notes ? <div>Note: {it.stitching.notes}</div> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <footer className="grid grid-cols-2 gap-6 text-xs text-muted pt-2">
          <p className="m-0 border-t border-ink pt-2">Packed by</p>
          <p className="m-0 border-t border-ink pt-2">Date and time</p>
        </footer>
      </article>
    </div>
  );
}
