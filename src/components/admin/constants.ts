// Admin constants safe to import from client components and server code.

export const PRODUCT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;
export const PRODUCT_COLLECTIONS = ["bridal", "festive", "new", "bestseller"] as const;
export const PRODUCT_OCCASIONS = ["wedding", "festive", "party", "office", "everyday"] as const;
export const PRODUCT_COLOURS = ["red", "pink", "orange", "yellow", "green", "blue", "purple", "brown", "black", "ivory", "gold", "multi"] as const;
export const COLOUR_HEX: Record<(typeof PRODUCT_COLOURS)[number], string> = {
  red: "#8E1B2C",
  pink: "#D8457F",
  orange: "#D9772B",
  green: "#1D5A3A",
  blue: "#2E4E7A",
  purple: "#6E2450",
  ivory: "#F4EEE4",
  yellow: "#E2B73A",
  brown: "#7A4A2A",
  black: "#1B1A18",
  gold: "#B8913F",
  multi: "#9A744A",
};

/* ---------- blouse stitching ---------- */
export const STITCH_STATUSES = ["measurements_needed", "measurements_received", "cutting", "stitching", "qc", "ready"] as const;
export type StitchStatusKey = (typeof STITCH_STATUSES)[number];
export const STITCH_LABEL: Record<StitchStatusKey, string> = {
  measurements_needed: "Measurements needed",
  measurements_received: "Measurements in",
  cutting: "Cutting",
  stitching: "Stitching",
  qc: "Quality check",
  ready: "Ready",
};
export const nextStitchStatus = (s: StitchStatusKey): StitchStatusKey | null => {
  const i = STITCH_STATUSES.indexOf(s);
  return i >= 0 && i < STITCH_STATUSES.length - 1 ? STITCH_STATUSES[i + 1] : null;
};

/** Blouse measurements, in inches. */
export const MEASUREMENT_FIELDS = [
  { key: "bust", label: "Bust" },
  { key: "waist", label: "Waist" },
  { key: "shoulder", label: "Shoulder" },
  { key: "sleeveLength", label: "Sleeve length" },
  { key: "blouseLength", label: "Blouse length" },
  { key: "frontNeck", label: "Front neck depth" },
  { key: "backNeck", label: "Back neck depth" },
  { key: "armhole", label: "Armhole" },
] as const;
export type MeasurementKey = (typeof MEASUREMENT_FIELDS)[number]["key"];

/* ---------- bulk upload ---------- */
/** CSV columns for product bulk upload and export, in order. List cells use | between values. */
export const IMPORT_COLUMNS = [
  "slug", "name", "category", "fabric", "colour", "hex", "collections", "occasions",
  "price_in", "mrp_in", "price_uk", "mrp_uk", "free_size",
  "stock_XS", "stock_S", "stock_M", "stock_L", "stock_XL", "stock_XXL", "stock_free",
  "stock_uk_XS", "stock_uk_S", "stock_uk_M", "stock_uk_L", "stock_uk_XL", "stock_uk_XXL", "stock_uk_free",
  "tag", "origin", "craft", "description", "details", "care", "images", "video",
  "made_to_order", "cost_price", "supplier", "active",
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];
