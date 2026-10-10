// Admin charts drawn as plain SVG on the server (no chart library, no client JS). Hover shows native tooltips.
// Colours come from the validated categorical palette (.viz-* in admin.css): slot order is fixed, never cycled, and
// every chart prints its values as text too (three slots sit below 3:1 contrast, so colour never carries meaning alone).
// One axis per chart: rupees and pounds never share a scale, so money trends are drawn one chart per country.

export const VIZ = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)", "var(--viz-5)", "var(--viz-6)"] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (day: string) => {
  const [, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[(m || 1) - 1]}`;
};

/** Rounds a max up to a clean axis top with 4 steps. */
function niceTop(max: number) {
  if (max <= 0) return 4;
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  return step * 4;
}

/** One series over time (e.g. revenue per day for one country): line + soft area, 2px line, markers on hover. */
export function TrendChart({ points, color, format, label }: { points: { day: string; value: number }[]; color: string; format: (n: number) => string; label: string }) {
  const W = 720, H = 220, L = 64, R = 12, T = 14, B = 30;
  const iw = W - L - R, ih = H - T - B;
  const top = niceTop(Math.max(...points.map((p) => p.value), 0));
  const x = (i: number) => L + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => T + ih - (v / top) * ih;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = points.length ? `${line} L${x(points.length - 1).toFixed(1)},${T + ih} L${x(0).toFixed(1)},${T + ih} Z` : "";
  const every = Math.max(1, Math.ceil(points.length / 7));
  const total = points.reduce((a, p) => a + p.value, 0);
  const best = points.reduce((a, p) => (p.value > a.value ? p : a), points[0] ?? { day: "", value: 0 });
  return (
    <figure className="viz">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${format(total)} in total; best day ${best.day ? short(best.day) : "none"} at ${format(best.value)}.`}>
        {[0, 1, 2, 3, 4].map((i) => {
          const v = (top / 4) * i;
          return (
            <g key={i}>
              <line className="viz-grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
              <text className="viz-ax" x={L - 8} y={y(v) + 4} textAnchor="end">{format(v)}</text>
            </g>
          );
        })}
        <path d={area} fill={color} opacity=".12" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={p.day} className="viz-pt">
            <rect x={x(i) - iw / points.length / 2} y={T} width={Math.max(iw / points.length, 6)} height={ih} fill="transparent" />
            <circle cx={x(i)} cy={y(p.value)} r="4.5" fill={color} stroke="var(--viz-surface)" strokeWidth="2" />
            <title>{`${short(p.day)}: ${format(p.value)}`}</title>
            {i % every === 0 && <text className="viz-ax" x={x(i)} y={H - 8} textAnchor="middle">{short(p.day)}</text>}
          </g>
        ))}
        <line className="viz-base" x1={L} x2={W - R} y1={T + ih} y2={T + ih} />
      </svg>
    </figure>
  );
}

/** Share of a whole (≤6 slices; the rest folds into "Other"). Legend lists every value and percent. */
export function DonutChart({ slices, format, center, label }: { slices: { label: string; value: number }[]; format: (n: number) => string; center: string; label: string }) {
  const sorted = [...slices].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  const shown = sorted.length > 6 ? [...sorted.slice(0, 5), { label: "Other", value: sorted.slice(5).reduce((a, s) => a + s.value, 0) }] : sorted;
  const total = shown.reduce((a, s) => a + s.value, 0);
  const R = 70, r = 46, C = 90;
  const before = (i: number) => shown.slice(0, i).reduce((a, s) => a + s.value, 0);
  const arcs = shown.map((s, i) => {
    const frac = total ? s.value / total : 0;
    const a0 = -Math.PI / 2 + (total ? before(i) / total : 0) * Math.PI * 2;
    const a1 = a0 + frac * Math.PI * 2;
    const big = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad: number, a: number) => `${(C + rad * Math.cos(a)).toFixed(2)},${(C + rad * Math.sin(a)).toFixed(2)}`;
    // A full circle can't be one arc: draw two halves.
    const d =
      frac >= 0.9999
        ? `M${p(R, -Math.PI / 2)} A${R},${R} 0 1 1 ${p(R, Math.PI / 2)} A${R},${R} 0 1 1 ${p(R, -Math.PI / 2)} M${p(r, -Math.PI / 2)} A${r},${r} 0 1 0 ${p(r, Math.PI / 2)} A${r},${r} 0 1 0 ${p(r, -Math.PI / 2)} Z`
        : `M${p(R, a0)} A${R},${R} 0 ${big} 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 ${big} 0 ${p(r, a0)} Z`;
    return { ...s, d, color: VIZ[i % VIZ.length], pct: total ? Math.round(frac * 100) : 0 };
  });
  if (!total) return <p className="muted adm-empty">No data for this period yet.</p>;
  return (
    <figure className="viz viz-donut">
      <svg viewBox="0 0 180 180" role="img" aria-label={`${label}: ${arcs.map((a) => `${a.label} ${a.pct}%`).join(", ")}.`}>
        {arcs.map((a) => (
          <path key={a.label} className="viz-slice" d={a.d} fill={a.color} stroke="var(--viz-surface)" strokeWidth="2" fillRule="evenodd">
            <title>{`${a.label}: ${format(a.value)} (${a.pct}%)`}</title>
          </path>
        ))}
        <text x="90" y="86" textAnchor="middle" className="viz-center">{center}</text>
        <text x="90" y="104" textAnchor="middle" className="viz-ax">total</text>
      </svg>
      <ul className="viz-legend">
        {arcs.map((a) => (
          <li key={a.label}>
            <span className="viz-key" style={{ background: a.color }} aria-hidden="true" />
            <span className="viz-legend-label">{a.label}</span>
            <b>{format(a.value)}</b>
            <small>{a.pct}%</small>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Ranked list as horizontal bars, values printed at the end of each bar. */
export function BarList({ rows, format, color = VIZ[0] }: { rows: { label: string; value: number; note?: string }[]; format: (n: number) => string; color?: string }) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  if (!rows.length) return <p className="muted adm-empty">No sales in this period yet.</p>;
  return (
    <ol className="viz-bars">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${format(r.value)}`}>
          <div className="viz-bar-label"><span>{r.label}</span><b>{format(r.value)}</b></div>
          <div className="viz-bar-track"><span style={{ width: `${max ? Math.max(2, (r.value / max) * 100) : 0}%`, background: color }} /></div>
          {r.note ? <small className="muted">{r.note}</small> : null}
        </li>
      ))}
    </ol>
  );
}
