import "server-only";
import { db } from "./db";
import { Product } from "./models";
import type { Region } from "./region";
import type { ProductDTO } from "./types";

/*
 * Search understanding for the catalogue. Owner: catalogue & discovery.
 * parseSearch() turns free text such as "red kanchi saree under 15000" into structured filters
 * (category, fabric, colour, occasion, craft/origin concepts, price range) plus leftover words,
 * fixing small typos against a vocabulary built from the live catalogue.
 */

type Category = ProductDTO["category"];
export type Concept = { label: string; rx: string };

export type ParsedSearch = {
  raw: string;
  /** The query actually searched (typos fixed). Same as raw (normalised) when nothing changed. */
  query: string;
  corrected: boolean;
  /** A looser spelling fix, offered as "Did you mean …" when nothing is found. */
  suggestion: string | null;
  categories: Category[];
  fabrics: string[];
  colours: string[];
  occasions: string[];
  concepts: Concept[];
  terms: string[];
  min?: number;
  max?: number;
  priceNote?: string;
};

type Effect = { cat?: Category; fabric?: string; colour?: string; occasion?: string; concept?: Concept; stop?: true };

/* ---------- synonyms ---------- */
const SYN: [string[], Effect][] = [
  // categories
  [["saree", "sarees", "sari", "saris", "saaree", "sarée"], { cat: "sarees" }],
  [["kurta", "kurtas", "kurti", "kurtis", "kurta set", "kurta sets", "suit", "suits", "salwar", "salwar suit", "salwar kameez", "churidar", "anarkali", "kameez"], { cat: "kurta-sets" }],
  [["lehenga", "lehengas", "lehnga", "lehngas", "lehanga", "lehangas", "lengha", "lenghas", "lahenga", "lehenga choli", "ghagra", "ghagra choli", "chaniya choli"], { cat: "lehengas" }],
  // occasions
  [["wedding", "weddings", "shaadi", "shadi", "shaadi wear", "bridal", "bride", "brides", "marriage", "vivah", "sangeet", "mehendi", "mehndi", "reception", "wedding guest", "engagement"], { occasion: "wedding" }],
  [["festive", "festival", "festivals", "diwali", "deepavali", "eid", "puja", "pooja", "durga puja", "navratri", "onam", "pongal", "ugadi", "party", "party wear", "partywear", "karva chauth", "karwa chauth", "rakhi", "raksha bandhan", "celebration"], { occasion: "festive" }],
  [["office", "work", "workwear", "formal", "formals"], { occasion: "office" }],
  [["everyday", "daily", "casual", "casuals", "daywear", "day wear", "comfortable"], { occasion: "everyday" }],
  // fabrics (matched inside the fabric field, so "silk" also finds raw silk and tissue silk)
  [["silk", "silks", "pattu", "resham", "pure silk"], { fabric: "silk" }],
  [["raw silk"], { fabric: "raw silk" }],
  [["tissue", "tissue silk"], { fabric: "tissue" }],
  [["cotton", "cottons", "mulmul", "mul", "mul cotton", "khadi"], { fabric: "cotton" }],
  [["linen", "linens"], { fabric: "linen" }],
  [["georgette", "georgettes", "jorjet"], { fabric: "georgette" }],
  [["velvet", "velvets", "velour"], { fabric: "velvet" }],
  [["chiffon"], { fabric: "chiffon" }],
  [["organza"], { fabric: "organza" }],
  [["crepe"], { fabric: "crepe" }],
  [["chanderi"], { fabric: "chanderi" }],
  // colours (catalogue colours are plain names)
  [["red", "reds", "maroon", "burgundy", "crimson", "wine", "scarlet", "sindoori", "cherry", "oxblood"], { colour: "red" }],
  [["pink", "pinks", "rani", "rani pink", "magenta", "fuchsia", "rose", "blush", "peach", "baby pink", "hot pink", "onion pink"], { colour: "pink" }],
  [["green", "greens", "sage", "mint", "emerald", "olive", "bottle green", "parrot green", "pista", "pistachio"], { colour: "green" }],
  [["blue", "blues", "navy", "navy blue", "royal blue", "indigo", "sky blue", "powder blue", "cobalt"], { colour: "blue" }],
  [["teal"], { colour: "teal" }],
  [["ivory", "cream", "off white", "offwhite", "off-white", "white", "kasavu"], { colour: "ivory" }],
  [["orange", "saffron", "rust", "coral", "tangerine", "kesari"], { colour: "orange" }],
  [["purple", "plum", "violet", "lavender", "lilac", "aubergine", "jamun", "mauve"], { colour: "purple" }],
  [["yellow", "mustard", "haldi", "lemon", "turmeric"], { colour: "yellow" }],
  [["gold", "golden"], { colour: "gold" }],
  [["black"], { colour: "black" }],
  [["grey", "gray", "silver"], { colour: "grey" }],
  [["beige", "nude", "sand"], { colour: "beige" }],
  [["brown", "coffee", "chocolate"], { colour: "brown" }],
  // weaving clusters and crafts
  [["kanchi", "kanchipuram", "kancheepuram", "kanjivaram", "kanjeevaram", "kanjeevram", "kanchivaram", "kanjivaram silk", "kanjeevaram silk", "kanchi silk", "kanchipuram silk", "conjeevaram"], { fabric: "silk", concept: { label: "Kanchipuram", rx: "kanch|kanj|conjee" } }],
  [["banarasi", "benarasi", "banarsi", "benarsi", "banaras", "benaras", "varanasi", "banarasi silk"], { concept: { label: "Banarasi", rx: "banaras|benaras|varanasi" } }],
  [["chikan", "chikankari", "chikenkari", "chikan kari", "chickenkari", "lucknowi", "lucknow"], { concept: { label: "Chikankari", rx: "chikan|lucknow" } }],
  [["block print", "blockprint", "block printed", "hand block", "block", "bagru", "dabu", "ajrakh", "sanganeri", "printed"], { concept: { label: "Block print", rx: "block|bagru|dabu|ajrakh|print" } }],
  [["zari", "jari"], { concept: { label: "Zari", rx: "zari" } }],
  [["gota", "gotta", "gota patti", "gotapatti"], { concept: { label: "Gota", rx: "gota" } }],
  [["zardozi", "zardosi", "zardoshi", "aari"], { concept: { label: "Zardozi", rx: "zardozi|dabka" } }],
  [["ikat", "pochampally", "pochampalli", "patola"], { concept: { label: "Ikat", rx: "ikat|pochampal|patola" } }],
  [["handloom", "handwoven", "hand woven"], { concept: { label: "Handloom", rx: "handloom|handwoven|hand-woven|woven" } }],
  [["embroidered", "embroidery"], { concept: { label: "Embroidered", rx: "embroider" } }],
  // filler words
  [["for", "the", "a", "an", "and", "with", "in", "of", "to", "on", "women", "womens", "woman", "ladies", "lady", "girls", "girl", "online", "buy", "shop", "latest", "best", "dress", "dresses", "outfit", "outfits", "wear", "set", "sets", "piece", "pieces", "design", "designer", "pure", "new", "collection", "india", "uk", "price", "rs", "inr", "gbp", "me", "my", "look", "looks", "style", "styles"], { stop: true }],
];

const SYN_MAP = new Map<string, Effect>();
for (const [words, eff] of SYN) for (const w of words) SYN_MAP.set(w, eff);
const PHRASES = [...SYN_MAP.keys()].filter((k) => k.includes(" ") || k.includes("-")).sort((a, b) => b.length - a.length);
const SINGLE_KEYS = [...SYN_MAP.keys()].filter((k) => !k.includes(" ") && SYN_MAP.get(k)!.stop !== true);

/* ---------- vocabulary (live catalogue words) ---------- */
export type Vocab = Map<string, number>;
let vocabCache: { at: number; vocab: Vocab } | null = null;

export async function getSearchVocabulary(): Promise<Vocab> {
  if (vocabCache && Date.now() - vocabCache.at < 10 * 60 * 1000) return vocabCache.vocab;
  const vocab: Vocab = new Map();
  try {
    await db();
    const docs = await Product.find({ active: true }, { name: 1, fabric: 1, colour: 1, origin: 1, craft: 1, tag: 1, occasions: 1 }).lean();
    for (const d of docs) {
      const text = [d.name, d.fabric, d.colour, d.origin, d.craft, d.tag, ...(d.occasions ?? [])].join(" ").toLowerCase();
      for (const w of text.match(/[a-z]{3,}/g) ?? []) vocab.set(w, (vocab.get(w) ?? 0) + 1);
    }
  } catch (e) {
    console.error("[search] vocabulary unavailable", e);
  }
  vocabCache = { at: Date.now(), vocab };
  return vocab;
}

/* ---------- edit distance (optimal string alignment, with early exit) ---------- */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

function nearest(word: string, candidates: Iterable<string>, freq: Vocab, maxD: number): string | null {
  let best: string | null = null;
  let bestD = maxD + 1;
  let bestF = -1;
  for (const c of candidates) {
    if (Math.abs(c.length - word.length) > maxD || c === word) continue;
    const d = editDistance(word, c, maxD);
    const f = (freq.get(c) ?? 0) + (SYN_MAP.has(c) ? 5 : 0);
    if (d < bestD || (d === bestD && f > bestF)) {
      best = c;
      bestD = d;
      bestF = f;
    }
  }
  return bestD <= maxD ? best : null;
}

/* ---------- price phrases ---------- */
const GBP_TO_INR = 110;
const NUM = String.raw`(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakh|lac)?`;
const CUR = String.raw`([₹£])?\s*`;

function amount(n: string, mult: string | undefined, cur: string | undefined, region: Region): number {
  let v = Number(n.replace(/,/g, ""));
  if (mult === "k" || mult === "thousand") v *= 1000;
  if (mult === "lakh" || mult === "lac") v *= 100000;
  if (cur === "£" && region === "in") v *= GBP_TO_INR;
  if (cur === "₹" && region === "uk") v = Math.round(v / GBP_TO_INR);
  return v;
}

const fmt = (n: number, region: Region) =>
  new Intl.NumberFormat(region === "in" ? "en-IN" : "en-GB", { style: "currency", currency: region === "in" ? "INR" : "GBP", maximumFractionDigits: 0 }).format(n);

function takePrice(text: string, region: Region): { text: string; min?: number; max?: number; note?: string } {
  let m = text.match(new RegExp(String.raw`(?:between\s+)?${CUR}${NUM}\s*(?:-|–|to|and)\s*${CUR}${NUM}`));
  if (m && /\d/.test(m[2]) && /\d/.test(m[5])) {
    const cur = m[1] || m[4];
    let a = amount(m[2], m[3] || m[6], cur, region);
    let b = amount(m[5], m[6], cur, region);
    if (a > b) [a, b] = [b, a];
    if (b > 0) return { text: text.replace(m[0], " "), min: a, max: b, note: `${fmt(a, region)} – ${fmt(b, region)}` };
  }
  m = text.match(new RegExp(String.raw`(?:under|below|less than|lesser than|upto|up to|within|max|maximum|cheaper than|not more than|<)\s*${CUR}${NUM}`));
  if (m) {
    const v = amount(m[2], m[3], m[1], region);
    if (v > 0) return { text: text.replace(m[0], " "), max: v, note: `under ${fmt(v, region)}` };
  }
  m = text.match(new RegExp(String.raw`(?:over|above|more than|min|minimum|starting at|starting from|from|>)\s*${CUR}${NUM}`));
  if (m) {
    const v = amount(m[2], m[3], m[1], region);
    if (v > 0) return { text: text.replace(m[0], " "), min: v, note: `over ${fmt(v, region)}` };
  }
  // A bare amount with a currency sign ("₹5000 saree") reads as a budget.
  m = text.match(new RegExp(String.raw`([₹£])\s*${NUM}`));
  if (m) {
    const v = amount(m[2], m[3], m[1], region);
    if (v > 0) return { text: text.replace(m[0], " "), max: v, note: `under ${fmt(v, region)}` };
  }
  return { text };
}

/* ---------- parse ---------- */
function normalise(raw: string) {
  return ` ${raw.toLowerCase()} `
    .replace(/\brs\.?\s*(?=\d)/g, "₹")
    .replace(/\binr\s*(?=\d)/g, "₹")
    .replace(/(\d[\d,.]*)\s*(?:rs|inr|rupees)\b/g, "₹$1")
    .replace(/\bgbp\s*(?=\d)/g, "£")
    .replace(/(\d[\d,.]*)\s*(?:gbp|pounds?|quid)\b/g, "£$1")
    .replace(/[^\p{L}\p{N}₹£,.\-–<>\s]/gu, " ")
    .replace(/\s+/g, " ");
}

export function parseSearch(raw: string, vocab: Vocab, region: Region, opts: { exact?: boolean } = {}): ParsedSearch {
  const out: ParsedSearch = { raw: raw.trim(), query: raw.trim(), corrected: false, suggestion: null, categories: [], fabrics: [], colours: [], occasions: [], concepts: [], terms: [] };
  const price = takePrice(normalise(raw), region);
  out.min = price.min;
  out.max = price.max;
  out.priceNote = price.note;
  let text = ` ${price.text.replace(/[,.<>–]/g, " ").replace(/\s+/g, " ").trim()} `;

  const apply = (e: Effect) => {
    if (e.cat && !out.categories.includes(e.cat)) out.categories.push(e.cat);
    if (e.fabric && !out.fabrics.includes(e.fabric)) out.fabrics.push(e.fabric);
    if (e.colour && !out.colours.includes(e.colour)) out.colours.push(e.colour);
    if (e.occasion && !out.occasions.includes(e.occasion)) out.occasions.push(e.occasion);
    if (e.concept && !out.concepts.some((c) => c.label === e.concept!.label)) out.concepts.push(e.concept);
  };

  // Multi-word phrases first ("bottle green", "kurta set", "block print").
  for (const ph of PHRASES) {
    if (text.includes(` ${ph} `)) {
      apply(SYN_MAP.get(ph)!);
      text = text.split(` ${ph} `).join(" ");
    }
  }

  const tokens = text.replace(/-/g, " ").split(" ").filter(Boolean);
  const display: string[] = [];
  const loose: string[] = [];
  const allWords = new Set<string>([...vocab.keys(), ...SINGLE_KEYS]);
  let looseChanged = false;

  const consume = (w: string): boolean => {
    const eff = SYN_MAP.get(w) ?? (w.length > 4 && w.endsWith("s") ? SYN_MAP.get(w.slice(0, -1)) : undefined);
    if (eff) {
      if (!eff.stop) apply(eff);
      return true;
    }
    return false;
  };

  for (const tok of tokens) {
    if (/^\d+$/.test(tok)) continue; // stray numbers ("2 piece")
    if (consume(tok)) {
      display.push(tok);
      loose.push(tok);
      continue;
    }
    const known = vocab.has(tok) || (tok.length >= 3 && [...allWords].some((w) => w.startsWith(tok)));
    if (known || tok.length < 4 || opts.exact) {
      out.terms.push(tok);
      display.push(tok);
      loose.push(tok);
      continue;
    }
    const strict = nearest(tok, allWords, vocab, tok.length >= 7 ? 2 : 1);
    if (strict) {
      out.corrected = true;
      display.push(strict);
      loose.push(strict);
      if (!consume(strict)) out.terms.push(strict);
      continue;
    }
    const relaxed = nearest(tok, allWords, vocab, tok.length >= 9 ? 3 : 2);
    if (relaxed) {
      looseChanged = true;
      loose.push(relaxed);
    } else loose.push(tok);
    out.terms.push(tok);
    display.push(tok);
  }

  const withPrice = (words: string[]) => [...words, ...(price.note ? [price.note] : [])].join(" ").trim();
  if (out.corrected) out.query = withPrice(display);
  if (looseChanged) out.suggestion = withPrice(loose);
  return out;
}

export async function analyseSearch(raw: string, region: Region, opts: { exact?: boolean } = {}): Promise<ParsedSearch> {
  return parseSearch(raw.slice(0, 120), await getSearchVocabulary(), region, opts);
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** MongoDB filter for the parsed query (prices are applied separately, on the sale-adjusted price). */
export function searchMatch(s: ParsedSearch): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];
  if (s.categories.length) and.push({ category: { $in: s.categories } });
  if (s.fabrics.length) and.push({ $or: s.fabrics.map((f) => ({ fabric: new RegExp(esc(f), "i") })) });
  if (s.colours.length) and.push({ colour: { $in: s.colours.flatMap((c) => [c, c[0].toUpperCase() + c.slice(1)]) } });
  if (s.occasions.length) and.push({ occasions: { $in: s.occasions } });
  for (const c of s.concepts) {
    const rx = new RegExp(c.rx, "i");
    and.push({ $or: [{ name: rx }, { craft: rx }, { origin: rx }, { tag: rx }, { description: rx }] });
  }
  for (const t of s.terms) {
    const rx = new RegExp(`\\b${esc(t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t)}`, "i");
    and.push({ $or: [{ name: rx }, { fabric: rx }, { colour: rx }, { craft: rx }, { origin: rx }, { tag: rx }, { category: rx }, { occasions: rx }, { collections: rx }] });
  }
  return and.length ? { $and: and } : {};
}

const CAT_WORD: Record<Category, string> = { sarees: "sarees", "kurta-sets": "kurta sets", lehengas: "lehengas" };

/** Plain-English summary of what we understood, e.g. "red silk sarees from Kanchipuram under ₹15,000". */
export function describeSearch(s: ParsedSearch): string {
  const parts = [
    ...s.colours,
    ...s.fabrics,
    ...s.concepts.filter((c) => c.label !== "Kanchipuram").map((c) => c.label.toLowerCase()),
    ...(s.categories.length ? s.categories.map((c) => CAT_WORD[c]) : ["styles"]),
  ];
  let out = parts.join(" ");
  if (s.concepts.some((c) => c.label === "Kanchipuram")) out += " from Kanchipuram";
  if (s.occasions.length) out += ` for ${s.occasions.join(" or ")}`;
  if (s.terms.length) out += ` matching “${s.terms.join(" ")}”`;
  if (s.priceNote) out += ` ${s.priceNote}`;
  return out;
}

/** True when the parser recognised more than plain words (worth explaining to the shopper). */
export const understood = (s: ParsedSearch) =>
  s.categories.length + s.fabrics.length + s.colours.length + s.occasions.length + s.concepts.length > 0 || s.min !== undefined || s.max !== undefined;
