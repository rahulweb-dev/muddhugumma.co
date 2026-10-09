// Size finder rules: body measurements or a size from a familiar brand → our size (SIZE_CHART in src/lib/region.ts).
import { SIZE_CHART, type Region } from "@/lib/region";

export type Body = { bust?: number; waist?: number; hip?: number };
export type Fit = { index: number; beyond: boolean; reasons: string[]; decidedBy: string };

/** Half an inch of ease: a body measurement up to 0.5 in over the chart still sits comfortably. */
export const EASE = 0.5;
const KEYS = [
  ["bust", "Bust"],
  ["waist", "Waist"],
  ["hip", "Hip"],
] as const;

export const sizeLabel = (index: number, region: Region) => {
  const row = SIZE_CHART[Math.min(index, SIZE_CHART.length - 1)];
  return region === "uk" ? row.uk : row.in;
};
export const bothLabels = (index: number, region: Region) => {
  const row = SIZE_CHART[Math.min(index, SIZE_CHART.length - 1)];
  return region === "uk" ? `${row.uk} (our ${row.in})` : `${row.in} (UK ${row.uk.replace("UK ", "")})`;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Smallest size that fits every measurement given; the tightest measurement decides. */
export function fitFromBody(b: Body, region: Region): Fit | null {
  const given = KEYS.filter(([k]) => (b[k] ?? 0) > 0);
  if (!given.length) return null;
  let index = 0;
  let decidedBy = "";
  const reasons: string[] = [];
  for (const [k, label] of given) {
    const v = b[k]!;
    let i = SIZE_CHART.findIndex((row) => row[k] + EASE >= v);
    if (i === -1) i = SIZE_CHART.length;
    const chartV = i < SIZE_CHART.length ? SIZE_CHART[i][k] : SIZE_CHART[SIZE_CHART.length - 1][k];
    reasons.push(
      i < SIZE_CHART.length
        ? `${label} ${r1(v)} in → ${sizeLabel(i, region)} (made for ${chartV} in${v > chartV ? ", with a little ease" : ""})`
        : `${label} ${r1(v)} in is above our largest size (${chartV} in)`
    );
    if (!decidedBy || i > index) {
      index = i;
      decidedBy = label.toLowerCase();
    }
  }
  const beyond = index >= SIZE_CHART.length;
  return { index: Math.min(index, SIZE_CHART.length - 1), beyond, reasons, decidedBy };
}

/* Familiar brands. Index = row in SIZE_CHART (0 = XS / UK 6); 6 means larger than our chart. */
type Brand = { name: string; sizes: { label: string; index: number }[]; note: string };
const letters = (extra: { label: string; index: number }[] = []) => [
  { label: "XS", index: 0 },
  { label: "S", index: 1 },
  { label: "M", index: 2 },
  { label: "L", index: 3 },
  { label: "XL", index: 4 },
  { label: "XXL", index: 5 },
  ...extra,
];
const ukNumbers = [6, 8, 10, 12, 14, 16, 18, 20].map((n, i) => ({ label: `UK ${n}`, index: Math.min(i, 6) }));

export const BRANDS: Brand[] = [
  { name: "Biba", sizes: letters([{ label: "3XL", index: 6 }]), note: "Biba kurtas follow much the same chart as ours." },
  { name: "W", sizes: letters([{ label: "3XL", index: 6 }]), note: "W sizes line up with ours: a W M is our M." },
  { name: "FabIndia", sizes: letters([{ label: "3XL", index: 6 }]), note: "FabIndia cuts kurtas relaxed. If you like a closer fit there, you may prefer one size down with us." },
  { name: "Libas", sizes: letters([{ label: "3XL", index: 6 }]), note: "Libas sizing matches ours closely." },
  { name: "Global Desi", sizes: letters([{ label: "3XL", index: 6 }]), note: "Global Desi runs slim. If you are snug in it, take one size up with us." },
  { name: "Marks & Spencer", sizes: ukNumbers, note: "M&S UK sizes map straight across: UK 10 is our M." },
  { name: "Next", sizes: ukNumbers, note: "Next UK sizes map straight across: UK 12 is our L." },
  {
    name: "Zara",
    sizes: letters(),
    note: "Zara runs small. If you usually size up in Zara, start from your normal UK size instead.",
  },
  {
    name: "H&M",
    sizes: [...letters(), ...[34, 36, 38, 40, 42, 44, 46].map((n, i) => ({ label: `EU ${n}`, index: Math.min(i, 6) }))],
    note: "H&M EU 38 is a UK 10, which is our M.",
  },
];

export function fitFromBrand(brand: string, label: string, region: Region): Fit | null {
  const b = BRANDS.find((x) => x.name === brand);
  const s = b?.sizes.find((x) => x.label === label);
  if (!b || !s) return null;
  const beyond = s.index >= SIZE_CHART.length;
  const index = Math.min(s.index, SIZE_CHART.length - 1);
  return {
    index,
    beyond,
    decidedBy: brand,
    reasons: [beyond ? `${brand} ${label} is larger than our biggest ready size.` : `${brand} ${label} → ${sizeLabel(index, region)}.`, b.note],
  };
}

export const toInches = (v: number, unit: "in" | "cm") => (unit === "cm" ? v / 2.54 : v);
