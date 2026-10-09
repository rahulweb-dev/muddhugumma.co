import "server-only";
import mongoose, { type Types } from "mongoose";
import { z } from "zod";
import { db } from "./db";
import { Lookbook, Product, Supplier, type ProductDoc } from "./models";
import { parseCsvObjects, splitList } from "./csv";
import { allCategories } from "./categories";
import type { Region } from "./region";
import { COLOUR_HEX, IMPORT_COLUMNS, PRODUCT_COLLECTIONS, PRODUCT_COLOURS, PRODUCT_OCCASIONS, PRODUCT_SIZES } from "@/components/admin/constants";

export * from "@/components/admin/constants";

// Shapes returned by .lean() in the admin pages. Everything passed to client components is converted to plain strings first.
export type LeanAddress = { name?: string; phone?: string; line1?: string; line2?: string; city?: string; state?: string; postcode?: string; region?: Region };

export type LeanOrderItem = {
  productId?: string;
  slug?: string;
  name?: string;
  image?: string;
  size?: string;
  qty?: number;
  unitPrice?: number;
  options?: { blouse?: string; fallPico?: boolean };
  optionsPrice?: number;
  stitching?: { status?: string; measurements?: Record<string, string> | Map<string, string>; tailor?: string; notes?: string; updatedAt?: Date };
};

export type LeanOrder = {
  _id: Types.ObjectId;
  number: string;
  userId?: string;
  email: string;
  region: Region;
  currency: string;
  items: LeanOrderItem[];
  address?: LeanAddress;
  subtotal?: number;
  discount?: number;
  coupon?: string;
  shipping?: number;
  codFee?: number;
  total?: number;
  payment?: { method?: string; status?: string; ref?: string };
  status: string;
  history?: { status?: string; at?: Date; note?: string }[];
  gift?: { wrap?: boolean; message?: string; fee?: number };
  prepaidDiscount?: number;
  loyalty?: { redeemedPoints?: number; discount?: number };
  giftCard?: { code?: string; amount?: number };
  partialCod?: { paidOnline?: number; dueOnDelivery?: number };
  codVerified?: boolean;
  invoiceNumber?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export const ORDER_STATUS_LIST = ["placed", "confirmed", "packed", "shipped", "delivered", "cancelled", "returned"] as const;
export const PAYMENT_STATUS_LIST = ["pending", "paid", "failed", "refunded"] as const;

/** Amount the courier must collect at the door: the part-COD balance, or the full total for unpaid COD orders. */
export function codToCollect(o: Pick<LeanOrder, "payment" | "total" | "partialCod">): number {
  if (o.payment?.method !== "cod" || o.payment?.status === "paid" || o.payment?.status === "refunded") return 0;
  const due = o.partialCod?.dueOnDelivery ?? 0;
  return due > 0 ? due : o.total ?? 0;
}

const ADMIN_LOCALE = "en-GB";
const ADMIN_TZ = process.env.ADMIN_TIMEZONE || "Asia/Kolkata";

/** "9 Oct 2026, 14:05" in the store's operating timezone. */
export const fmtDateTime = (d?: Date | string | null) =>
  d ? new Date(d).toLocaleString(ADMIN_LOCALE, { timeZone: ADMIN_TZ, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export const fmtDate = (d?: Date | string | null) =>
  d ? new Date(d).toLocaleDateString(ADMIN_LOCALE, { timeZone: ADMIN_TZ, day: "numeric", month: "short", year: "numeric" }) : "—";

/** yyyy-mm-dd key for a date in the store's timezone. */
export const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: ADMIN_TZ });

export const adminTimezone = () => ADMIN_TZ;

/** Midnight today in the store timezone, as an absolute Date. */
export function startOfToday(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: ADMIN_TZ, hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0) % 24;
  const elapsed = (get("hour") * 3600 + get("minute") * 60 + get("second")) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - elapsed);
}

/** Midnight at the start of a yyyy-mm-dd day in the store timezone, as an absolute Date. Null for invalid input. */
export function zonedDayStart(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // Reject impossible dates such as 2026-02-30 (Date.UTC would roll them over).
  if (Number.isNaN(guess) || new Date(guess).toISOString().slice(0, 10) !== ymd) return null;
  // Offset of the store timezone at that moment (e.g. +05:30 for IST).
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ADMIN_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return new Date(guess - (asUtc - guess));
}

/** Indian financial year (1 April – 31 March) containing `now`, as yyyy-mm-dd strings. */
export function financialYear(now = new Date()): { from: string; to: string; label: string } {
  const [y, mo] = dayKey(now).split("-").map(Number);
  const start = mo >= 4 ? y : y - 1;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31`, label: `FY ${start}-${String(start + 1).slice(2)}` };
}

export const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Builds a query string from current params with overrides; empty values are dropped. */
export function qs(base: Record<string, string | undefined>, over: Record<string, string | number | undefined> = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...over })) if (v !== undefined && v !== "" && v !== null) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Plain stock record from a lean product (Map or object). */
export const stockOf = (s: unknown): Record<string, number> => (s instanceof Map ? Object.fromEntries(s) : ((s as Record<string, number>) ?? {}));

/** Mongo $expr that is true when any size of a product has `threshold` pieces or fewer, in India or the UK. */
export const lowStockExpr = (threshold: number) => ({
  $anyElementTrue: [
    { $map: { input: { $concatArrays: [{ $objectToArray: { $ifNull: ["$stock", {}] } }, { $objectToArray: { $ifNull: ["$stockUk", {}] } }] }, in: { $lte: ["$$this.v", threshold] } } },
  ],
});

/* ---------- product input (shared by the product form, bulk upload and their actions) ---------- */
const moneyIn = z.object({ now: z.number().positive("Enter a selling price above 0"), mrp: z.number().min(0, "MRP cannot be negative") });
const qtyIn = z.number().int("Whole numbers only").min(0, "Stock cannot be negative");

export const ProductInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(3, "Name is too short").max(140),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Slug is too short")
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens"),
  category: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Choose a category"),
  collections: z.array(z.enum(PRODUCT_COLLECTIONS, { message: "Collections are bridal, festive or new" })),
  fabric: z.string().trim().max(60),
  occasions: z.array(z.enum(PRODUCT_OCCASIONS, { message: "Occasions are wedding, festive, office or everyday" })),
  colour: z.union([z.enum(PRODUCT_COLOURS), z.literal("")], { message: `Colour must be one of: ${PRODUCT_COLOURS.join(", ")} (or empty)` }),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #9A744A"),
  images: z.array(z.string().trim().min(1).max(300).regex(/^[^\s]+$/, "Image paths cannot contain spaces")).max(12, "12 images at most"),
  price: z.object({ in: moneyIn, uk: moneyIn }),
  freeSize: z.boolean(),
  stock: z.record(z.string(), qtyIn), // India
  stockUk: z.record(z.string(), qtyIn).default({}),
  tag: z.string().trim().max(30),
  origin: z.string().trim().max(80),
  craft: z.string().trim().max(120),
  description: z.string().trim().max(2000),
  details: z.array(z.string().trim().max(200)).max(20),
  care: z.string().trim().max(300),
  active: z.boolean(),
  video: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https:\/\/\S+$/.test(v) || /^[^\s:]+$/.test(v), "Use an ImageKit path or a full https:// link")
    .default(""),
  madeToOrder: z.boolean().default(false),
  costPrice: z.number().min(0, "Cost cannot be negative").max(10_000_000).default(0),
  supplierId: z.string().trim().max(40).default(""),
  lookbooks: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  blouseOptions: z.boolean().default(false),
});
export type ProductInputParsed = z.output<typeof ProductInputSchema>;

/** Business rules zod doesn't express on its own. Returns an error message and its field key, or null. */
export function productRuleError(v: ProductInputParsed): { error: string; field: string } | null {
  for (const r of ["in", "uk"] as const) {
    const m = v.price[r];
    if (m.mrp > 0 && m.mrp < m.now) return { error: `${r === "in" ? "India" : "UK"} MRP must be higher than the selling price (or 0 for no MRP).`, field: `price.${r}.mrp` };
  }
  return null;
}

/** The fields written to the Product collection for a validated input. */
export function productDoc(v: ProductInputParsed) {
  const sized = (st: Record<string, number>): Record<string, number> =>
    v.freeSize ? { "Free size": st["Free size"] ?? 0 } : Object.fromEntries(PRODUCT_SIZES.map((s) => [s, st[s] ?? 0]));
  const stock = sized(v.stock);
  const stockUk = sized(v.stockUk);
  return {
    name: v.name,
    slug: v.slug,
    category: v.category,
    collections: [...new Set(v.collections)],
    fabric: v.fabric,
    occasions: [...new Set(v.occasions)],
    colour: v.colour,
    hex: v.hex,
    images: v.images.map((p) => p.replace(/^\/+/, "")),
    price: v.price,
    freeSize: v.freeSize,
    stock,
    stockUk,
    tag: v.tag,
    origin: v.origin,
    craft: v.craft,
    description: v.description,
    details: v.details.filter(Boolean),
    care: v.care,
    active: v.active,
    video: v.video.replace(/^\/+/, ""),
    madeToOrder: v.madeToOrder,
    costPrice: v.costPrice,
    supplierId: v.supplierId,
    lookbooks: [...new Set(v.lookbooks)],
    blouseOptions: v.blouseOptions,
  };
}


/* ---------- stitching ---------- */
/** Mongo match for order items that go through the stitching board. `prefix` is "items." after an $unwind. */
export const stitchingItemMatch = (mtoSlugs: string[], prefix = "") => ({
  $or: [
    { [`${prefix}options.blouse`]: "stitched" },
    { [`${prefix}stitching.status`]: { $exists: true } },
    ...(mtoSlugs.length ? [{ [`${prefix}slug`]: { $in: mtoSlugs } }] : []),
  ],
});

export const isStitchingItem = (it: LeanOrderItem, mto: Set<string>) => it.options?.blouse === "stitched" || !!it.stitching?.status || (!!it.slug && mto.has(it.slug));

/* ---------- product form options ---------- */
export type ProductExtras = { video: string; madeToOrder: boolean; costPrice: number; supplierId: string; lookbooks: string[]; stockUk: Record<string, number> };
export type ProductFormOptions = {
  suppliers: { id: string; name: string }[];
  lookbooks: { slug: string; title: string; active: boolean }[];
  categories: { slug: string; name: string; active: boolean }[];
};

export async function productFormOptions(): Promise<ProductFormOptions> {
  await db();
  const [suppliers, categories, lookbooks] = await Promise.all([
    Supplier.find({}, { name: 1 }).sort({ name: 1 }).lean<{ _id: Types.ObjectId; name: string }[]>(),
    allCategories(),
    Lookbook.find({}, { slug: 1, title: 1, active: 1 }).sort({ sort: 1, title: 1 }).lean<{ slug: string; title?: string; active?: boolean }[]>(),
  ]);
  return {
    suppliers: suppliers.map((s) => ({ id: String(s._id), name: s.name || "Unnamed supplier" })),
    lookbooks: lookbooks.map((l) => ({ slug: l.slug, title: l.title || l.slug, active: l.active !== false })),
    categories: categories.map((c) => ({ slug: c.slug, name: c.name, active: c.active })),
  };
}

/* ---------- product <-> CSV ---------- */
type ProductLike = {
  slug: string; name: string; category: string; collections?: string[]; fabric?: string; occasions?: string[]; colour?: string; hex?: string;
  images?: string[]; price?: { in?: { now?: number; mrp?: number }; uk?: { now?: number; mrp?: number } }; freeSize?: boolean; stock?: unknown; stockUk?: unknown;
  tag?: string; origin?: string; craft?: string; description?: string; details?: string[]; care?: string; active?: boolean;
  video?: string; madeToOrder?: boolean; costPrice?: number; supplierId?: string; lookbooks?: string[]; blouseOptions?: boolean;
};

/** A stored product as form input (used as the starting point when a CSV row updates it). */
export function productToInput(p: ProductLike): ProductInputParsed {
  return {
    name: p.name ?? "",
    slug: p.slug,
    category: p.category,
    collections: [...(p.collections ?? [])] as ProductInputParsed["collections"],
    fabric: p.fabric ?? "",
    occasions: [...(p.occasions ?? [])] as ProductInputParsed["occasions"],
    colour: (p.colour ?? "") as ProductInputParsed["colour"],
    hex: p.hex ?? "#cccccc",
    images: [...(p.images ?? [])],
    price: { in: { now: p.price?.in?.now ?? 0, mrp: p.price?.in?.mrp ?? 0 }, uk: { now: p.price?.uk?.now ?? 0, mrp: p.price?.uk?.mrp ?? 0 } },
    freeSize: !!p.freeSize,
    stock: stockOf(p.stock),
    stockUk: stockOf(p.stockUk),
    tag: p.tag ?? "",
    origin: p.origin ?? "",
    craft: p.craft ?? "",
    description: p.description ?? "",
    details: [...(p.details ?? [])],
    care: p.care ?? "",
    active: p.active !== false,
    video: p.video ?? "",
    madeToOrder: !!p.madeToOrder,
    costPrice: p.costPrice ?? 0,
    supplierId: p.supplierId ?? "",
    lookbooks: [...(p.lookbooks ?? [])],
    blouseOptions: p.blouseOptions ?? p.category === "sarees",
  };
}

/** One CSV row (in IMPORT_COLUMNS order) for a stored product. */
export function productCsvRow(p: ProductLike, supplierName = ""): (string | number)[] {
  const s = stockOf(p.stock);
  const u = stockOf(p.stockUk);
  const list = (a?: string[]) => (a ?? []).join("|");
  return [
    p.slug, p.name, p.category, p.fabric ?? "", p.colour ?? "", p.hex ?? "", list(p.collections), list(p.occasions),
    p.price?.in?.now ?? 0, p.price?.in?.mrp ?? 0, p.price?.uk?.now ?? 0, p.price?.uk?.mrp ?? 0, p.freeSize ? "true" : "false",
    ...PRODUCT_SIZES.map((k) => (p.freeSize ? "" : s[k] ?? 0)), p.freeSize ? s["Free size"] ?? 0 : "",
    ...PRODUCT_SIZES.map((k) => (p.freeSize ? "" : u[k] ?? 0)), p.freeSize ? u["Free size"] ?? 0 : "",
    p.tag ?? "", p.origin ?? "", p.craft ?? "", p.description ?? "", list(p.details), p.care ?? "", list(p.images), p.video ?? "",
    p.madeToOrder ? "true" : "false", p.costPrice ?? 0, supplierName, p.active === false ? "false" : "true",
  ];
}

/* ---------- bulk upload analysis ---------- */
/*
 * Rows match existing products by slug. On an update, a blank cell keeps the current value and a single "-"
 * clears an optional text or list column. Columns left out of the file are never touched.
 */
export type ImportRow = {
  line: number;
  slug: string;
  name: string;
  action: "create" | "update" | "unchanged" | "error";
  errors: string[];
  changes: string[];
};

const IMPORT_MAX_BYTES = 3 * 1024 * 1024;
const IMPORT_MAX_ROWS = 2000;
const KNOWN = new Set(IMPORT_COLUMNS.map((c) => c.toLowerCase()));
const REQUIRED_FOR_CREATE = ["name", "category", "price_in", "price_uk"];
const FIELD_LABEL: Record<string, string> = {
  name: "name", slug: "slug", category: "category", collections: "collections", fabric: "fabric", occasions: "occasions", colour: "colour", hex: "hex",
  images: "images", price: "price", freeSize: "free_size", stock: "stock", stockUk: "stock_uk", tag: "tag", origin: "origin", craft: "craft", description: "description",
  details: "details", care: "care", active: "active", video: "video", madeToOrder: "made_to_order", costPrice: "cost_price", supplierId: "supplier", lookbooks: "lookbooks",
};

export type ImportAnalysed = { row: ImportRow; doc?: ReturnType<typeof productDoc>; id?: string };

const CLEAR = "-";
const parseNum = (s: string) => {
  const n = Number(s.replace(/[₹£,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const parseBool = (s: string): boolean | null => {
  const v = s.trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(v)) return true;
  if (["false", "no", "n", "0"].includes(v)) return false;
  return null;
};

/** Validates a product CSV row by row against the database (no writes). Used by bulk-upload preview and apply. */
export async function analyseImport(csv: string): Promise<{ ok: false; error: string } | { ok: true; items: ImportAnalysed[]; unknownColumns: string[]; missingColumns: string[] }> {
  if (typeof csv !== "string" || !csv.trim()) return { ok: false, error: "The file is empty." };
  if (csv.length > IMPORT_MAX_BYTES) return { ok: false, error: "The file is larger than 3 MB. Split it into smaller files." };
  let parsed: ReturnType<typeof parseCsvObjects>;
  try {
    parsed = parseCsvObjects(csv);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read the CSV." };
  }
  const { headers, rows } = parsed;
  if (!headers.includes("slug")) return { ok: false, error: "The first line must be the column names, including “slug”. Download the template to start." };
  if (!rows.length) return { ok: false, error: "The file has column names but no product rows." };
  if (rows.length > IMPORT_MAX_ROWS) return { ok: false, error: `The file has ${rows.length} rows. Upload ${IMPORT_MAX_ROWS} or fewer at a time.` };
  const categories = new Set((await allCategories()).map((c) => c.slug));

  const has = new Set(headers);
  const unknownColumns = headers.filter((h) => h && !KNOWN.has(h));
  const missingColumns = IMPORT_COLUMNS.filter((c) => !has.has(c.toLowerCase()));

  await db();
  const slugs = [...new Set(rows.map((r) => (r.values.slug ?? "").toLowerCase()).filter(Boolean))];
  const [existing, suppliers] = await Promise.all([
    Product.find({ slug: { $in: slugs } }).lean<ProductDoc[]>(),
    Supplier.find({}, { name: 1 }).lean<{ _id: mongoose.Types.ObjectId; name?: string }[]>(),
  ]);
  const bySlug = new Map(existing.map((p) => [p.slug, p]));
  const supplierByName = new Map(suppliers.map((s) => [(s.name ?? "").trim().toLowerCase(), String(s._id)]));
  const supplierIds = new Set(suppliers.map((s) => String(s._id)));
  const seen = new Map<string, number>();

  const items: ImportAnalysed[] = rows.map(({ line, values }) => {
    const slug = (values.slug ?? "").trim().toLowerCase();
    const errors: string[] = [];
    const row: ImportRow = { line, slug, name: values.name ?? "", action: "error", errors, changes: [] };
    if (!slug) {
      errors.push("slug is empty");
      return { row };
    }
    if (seen.has(slug)) {
      errors.push(`slug already used on line ${seen.get(slug)} of this file`);
      return { row };
    }
    seen.set(slug, line);

    const current = bySlug.get(slug);
    const creating = !current;
    const cell = (col: string) => (has.has(col) ? (values[col] ?? "").trim() : "");
    const given = (col: string) => has.has(col) && (values[col] ?? "").trim() !== "";

    if (creating) for (const col of REQUIRED_FOR_CREATE) if (!given(col)) errors.push(`${col} is required for a new product`);

    const v: ProductInputParsed = current
      ? productToInput(current)
      : {
          name: "", slug, category: "sarees", collections: [], fabric: "", occasions: [], colour: "red", hex: "", images: [],
          price: { in: { now: 0, mrp: 0 }, uk: { now: 0, mrp: 0 } }, freeSize: false, stock: {}, stockUk: {}, tag: "", origin: "", craft: "",
          description: "", details: [], care: "", active: true, video: "", madeToOrder: false, costPrice: 0, supplierId: "", lookbooks: [], blouseOptions: false,
        };
    v.slug = slug;
    if (current) v.id = String(current._id);

    // Plain text columns.
    const text: [string, "name" | "fabric" | "tag" | "origin" | "craft" | "description" | "care" | "video", boolean][] = [
      ["name", "name", false], ["fabric", "fabric", false], ["tag", "tag", true], ["origin", "origin", true],
      ["craft", "craft", true], ["description", "description", true], ["care", "care", true], ["video", "video", true],
    ];
    for (const [col, key, clearable] of text) {
      if (!given(col)) continue;
      const val = cell(col);
      v[key] = clearable && val === CLEAR ? "" : val;
    }
    if (given("category")) v.category = cell("category").toLowerCase();
    if (v.category && !categories.has(v.category)) errors.push(`category: “${v.category}” is not one of the categories in Admin → Categories`);
    if (given("colour")) v.colour = cell("colour").toLowerCase() as ProductInputParsed["colour"];

    // Lists.
    if (given("collections")) v.collections = (cell("collections") === CLEAR ? [] : splitList(cell("collections").toLowerCase())) as ProductInputParsed["collections"];
    if (given("occasions")) v.occasions = (cell("occasions") === CLEAR ? [] : splitList(cell("occasions").toLowerCase())) as ProductInputParsed["occasions"];
    if (given("details")) v.details = cell("details") === CLEAR ? [] : splitList(cell("details"));
    if (given("images")) v.images = cell("images") === CLEAR ? [] : splitList(cell("images")).map((p) => p.replace(/^\/+/, ""));

    // Numbers.
    const num = (col: string, apply: (n: number) => void, opts: { int?: boolean; clearToZero?: boolean } = {}) => {
      if (!given(col)) return;
      if (opts.clearToZero && cell(col) === CLEAR) return apply(0);
      const n = parseNum(cell(col));
      if (Number.isNaN(n)) errors.push(`${col}: “${cell(col)}” is not a number`);
      else if (opts.int && !Number.isInteger(n)) errors.push(`${col}: use a whole number`);
      else apply(n);
    };
    num("price_in", (n) => (v.price.in.now = n));
    num("mrp_in", (n) => (v.price.in.mrp = n), { clearToZero: true });
    num("price_uk", (n) => (v.price.uk.now = n));
    num("mrp_uk", (n) => (v.price.uk.mrp = n), { clearToZero: true });
    num("cost_price", (n) => (v.costPrice = n), { clearToZero: true });

    // Booleans.
    const bool = (col: string, apply: (b: boolean) => void) => {
      if (!given(col)) return;
      const b = parseBool(cell(col));
      if (b === null) errors.push(`${col}: use true or false`);
      else apply(b);
    };
    if (creating && !given("free_size")) v.freeSize = v.category === "sarees";
    if (creating) v.blouseOptions = v.category === "sarees";
    bool("free_size", (b) => (v.freeSize = b));
    bool("made_to_order", (b) => (v.madeToOrder = b));
    bool("active", (b) => (v.active = b));

    // Stock: blank keeps the current count (or 0 for a new product). stock_* is India, stock_uk_* the UK.
    for (const [prefix, key] of [["stock", "stock"], ["stock_uk", "stockUk"]] as const) {
      const stock = { ...v[key] };
      for (const size of PRODUCT_SIZES) num(`${prefix}_${size.toLowerCase()}`, (n) => (stock[size] = n), { int: true });
      num(`${prefix}_free`, (n) => (stock["Free size"] = n), { int: true });
      v[key] = stock;
    }

    // Hex: blank on a new product (or an invalid stored value) falls back to the colour family's swatch.
    if (given("hex")) v.hex = cell("hex").startsWith("#") ? cell("hex") : `#${cell("hex")}`;
    else if (!/^#[0-9a-fA-F]{6}$/.test(v.hex)) v.hex = (v.colour && COLOUR_HEX[v.colour]) || "#cccccc";

    // Supplier by name (or id).
    if (given("supplier")) {
      const s = cell("supplier");
      if (s === CLEAR) v.supplierId = "";
      else {
        const id = supplierByName.get(s.toLowerCase()) ?? (supplierIds.has(s) ? s : "");
        if (!id) errors.push(`supplier “${s}” not found. Add it under Suppliers first, or leave the cell blank`);
        else v.supplierId = id;
      }
    }

    if (errors.length) return { row };

    const res = ProductInputSchema.safeParse(v);
    if (!res.success) {
      for (const issue of res.error.issues) {
        const key = String(issue.path[0] ?? "");
        const col = key === "price" ? `${issue.path[2] === "mrp" ? "mrp" : "price"}_${String(issue.path[1])}` : key === "stock" || key === "stockUk" ? `${key === "stock" ? "stock" : "stock_uk"}_${String(issue.path[1]).replace("Free size", "free")}` : FIELD_LABEL[key] ?? key;
        const msg = `${col}: ${issue.message}`;
        if (!errors.includes(msg)) errors.push(msg);
      }
      return { row };
    }
    const rule = productRuleError(res.data);
    if (rule) {
      errors.push(rule.error);
      return { row };
    }
    const doc = productDoc(res.data);
    row.name = doc.name;
    if (current) {
      const before = productDoc(productToInput(current)) as Record<string, unknown>;
      row.changes = Object.keys(doc).filter((k) => JSON.stringify((doc as Record<string, unknown>)[k]) !== JSON.stringify(before[k])).map((k) => FIELD_LABEL[k] ?? k);
      row.action = row.changes.length ? "update" : "unchanged";
      return { row, doc, id: String(current._id) };
    }
    row.action = "create";
    return { row, doc };
  });

  return { ok: true, items, unknownColumns, missingColumns };
}

