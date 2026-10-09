import type { InvoiceData } from "@/lib/invoice";
import { formatMoney } from "@/lib/region";

/** Printable tax invoice (GST for India, VAT for the UK). Tailwind print: variants keep it on one clean page. */
export function InvoiceView({ inv }: { inv: InvoiceData }) {
  const f = (n: number) => formatMoney(n, inv.region);
  const money2 = (n: number) =>
    new Intl.NumberFormat(inv.region === "in" ? "en-IN" : "en-GB", { style: "currency", currency: inv.region === "in" ? "INR" : "GBP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const date = (d: Date) => d.toLocaleDateString(inv.region === "in" ? "en-IN" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  const india = inv.region === "in";

  return (
    <article className="inv-doc mx-auto w-full max-w-[880px] border border-line bg-paper p-4 text-[13px] text-ink sm:p-6 md:p-10 print:max-w-none print:border-0 print:p-0 print:text-[11px]">
      <header className="flex flex-col gap-4 border-b border-line pb-5 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <span className="font-display text-[10px] tracking-[.38em] text-muted">HOUSE OF</span>
          <span className="font-script text-[34px] leading-none text-[var(--cocoa)]">Muddhugumma</span>
          <p className="m-0 mt-2 max-w-[36ch] text-muted">{inv.seller.name}<br />{inv.seller.address}</p>
          {inv.seller.taxId ? (
            <p className="m-0 text-muted">{inv.seller.taxLabel}: <b className="text-ink">{inv.seller.taxId}</b>{india && <> · State code {inv.seller.stateCode}</>}</p>
          ) : (
            <p className="m-0 text-sale print:hidden">{inv.seller.taxLabel} not set yet (Admin → Settings).</p>
          )}
        </div>
        <div className="flex flex-col gap-1 md:text-right">
          <h1 className="h2 !text-[22px]">{india ? "Tax invoice" : "VAT invoice"}</h1>
          <p className="m-0">Invoice <b>{inv.number}</b></p>
          <p className="m-0 text-muted">Invoice date {date(inv.date)}</p>
          <p className="m-0 text-muted">Order {inv.orderNumber} · {date(inv.orderDate)}</p>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 border-b border-line py-5 md:grid-cols-2">
        <div>
          <h2 className="h3 mb-2">Billed and shipped to</h2>
          <p className="m-0">
            <b>{inv.buyer.name}</b><br />
            {inv.buyer.address.map((l, i) => <span key={i}>{l}<br /></span>)}
            <span className="text-muted">{inv.buyer.phone} · {inv.buyer.email}</span>
          </p>
        </div>
        <div className="md:text-right">
          <h2 className="h3 mb-2">Place of supply</h2>
          <p className="m-0">{inv.placeOfSupply}</p>
          {india && <p className="m-0 text-muted">{inv.intraState ? "Same state as the seller: CGST + SGST" : "Inter-state supply: IGST"}</p>}
          <p className="m-0 mt-2 text-muted">Payment: {inv.payment.method}{inv.payment.status === "paid" ? " (paid)" : ""}</p>
        </div>
      </section>

      <div className="table-wrap mt-4">
        <table className="t min-w-[560px] print:min-w-0">
          <thead>
            <tr>
              <th>Item</th>
              {india && <th>HSN</th>}
              <th className="num">Qty</th>
              <th className="num">Taxable value</th>
              <th className="num">{india ? "GST" : "VAT"}</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i}>
                <td>
                  {l.description}
                  {l.detail && <small className="block text-muted">{l.detail}</small>}
                </td>
                {india && <td>{l.hsn}</td>}
                <td className="num">{l.qty}</td>
                <td className="num">{money2(l.taxable)}</td>
                <td className="num">{money2(l.tax)}<small className="block text-muted">{l.rate}%</small></td>
                <td className="num">{money2(l.gross)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2 print:grid-cols-2">
        <dl className="m-0 flex flex-col gap-1.5">
          <h2 className="h3 mb-1">Tax summary</h2>
          <Row k="Taxable value" v={money2(inv.totals.taxable)} />
          {india ? (
            inv.intraState ? (
              <>
                <Row k="CGST" v={money2(inv.totals.cgst)} />
                <Row k="SGST" v={money2(inv.totals.sgst)} />
              </>
            ) : (
              <Row k="IGST" v={money2(inv.totals.igst)} />
            )
          ) : (
            <Row k="VAT at 20% (included)" v={money2(inv.totals.vat)} />
          )}
          <Row k="Total incl. tax" v={money2(inv.totals.gross)} strong />
        </dl>
        <dl className="m-0 flex flex-col gap-1.5">
          <h2 className="h3 mb-1">Amounts</h2>
          {inv.money.map((m, i) => (
            <Row key={i} k={m.label} v={m.amount < 0 ? `−${f(-m.amount)}` : f(m.amount)} strong={m.label === "Invoice total"} />
          ))}
          {inv.payment.dueOnDelivery > 0 && <Row k="Due on delivery" v={f(inv.payment.dueOnDelivery)} strong />}
        </dl>
      </section>

      <footer className="mt-8 border-t border-line pt-4 text-[11.5px] text-muted">
        <p className="m-0">
          {india
            ? "All prices include GST. Tax is not payable on reverse charge. This is a computer-generated invoice and needs no signature."
            : "All prices include UK VAT at 20%. This is a computer-generated invoice and needs no signature."}
        </p>
        <p className="m-0 mt-1">Questions? Write to {inv.seller.email} quoting {inv.orderNumber}.</p>
      </footer>
    </article>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "border-t border-line pt-1.5 font-bold" : ""}`}>
      <dt className={strong ? "" : "text-muted"}>{k}</dt>
      <dd className="m-0 text-right tabular-nums">{v}</dd>
    </div>
  );
}
