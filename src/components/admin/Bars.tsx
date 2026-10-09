// Horizontal bar list drawn to scale (bar length = value / largest value). Server-safe: no client code.

export type BarRow = { label: string; value: number; display: string; note?: string; href?: string };

export function Bars({ rows, label, empty = "No data in this period." }: { rows: BarRow[]; label: string; empty?: string }) {
  if (!rows.length) return <p className="muted adm-empty">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 0);
  return (
    <ul className="adm-bars" aria-label={label}>
      {rows.map((r, i) => {
        const pct = max > 0 ? Math.max(0, (r.value / max) * 100) : 0;
        return (
          <li key={`${r.label}-${i}`}>
            <span className="adm-bars-label">
              {r.href ? <a className="adm-a" href={r.href}>{r.label}</a> : r.label}
              {r.note ? <small className="muted"> · {r.note}</small> : null}
            </span>
            <span className="adm-bars-track" aria-hidden="true">
              <span style={{ width: `${pct}%` }} />
            </span>
            <span className="adm-bars-val">{r.display}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Two-part share bar (e.g. COD vs prepaid), widths to scale. */
export function Split({ a, b }: { a: { label: string; value: number; display: string }; b: { label: string; value: number; display: string } }) {
  const total = a.value + b.value;
  const pa = total ? (a.value / total) * 100 : 0;
  return (
    <div className="adm-split">
      <div className="adm-split-bar" role="img" aria-label={`${a.label} ${Math.round(pa)}%, ${b.label} ${Math.round(100 - pa)}%`}>
        <span style={{ width: `${pa}%` }} />
      </div>
      <div className="adm-split-legend">
        <span><i className="a" /> {a.label}: <b>{a.display}</b> ({total ? Math.round(pa) : 0}%)</span>
        <span><i className="b" /> {b.label}: <b>{b.display}</b> ({total ? Math.round(100 - pa) : 0}%)</span>
      </div>
    </div>
  );
}
