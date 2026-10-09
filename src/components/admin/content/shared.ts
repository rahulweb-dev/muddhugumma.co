// Client-safe helpers shared by the customer-service, content and merchandising admin screens.

/** Result of every action in src/lib/actions/{service,content,merch}.ts. */
export type Result =
  | { ok: true; message: string; id?: string; warnings?: string[] }
  | { ok: false; error: string; fields?: Record<string, string> };

/** A product chosen in the ProductPicker (plain JSON). */
export type PickedProduct = { slug: string; name: string; image: string; active: boolean; missing?: boolean };

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

export const SLUG_RX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Normalises a typed or pasted image path: strips the host, leading slashes and "img/". */
export const cleanImagePath = (s: string) =>
  s.trim().replace(/^https?:\/\/[^/]+\//, "").replace(/^\/+/, "").replace(/^img\//, "");

/* ---------- IST date-time inputs (sales) ---------- */
/** "2026-10-20T09:00" typed in IST → ISO string. Returns "" for an invalid value. */
export function istInputToIso(v: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return "";
  const d = new Date(`${v}:00+05:30`);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/** ISO string → "2026-10-20T09:00" in IST for a datetime-local input. */
export function isoToIstInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const ist = new Date(d.getTime() + 330 * 60_000);
  return ist.toISOString().slice(0, 16);
}

/* ---------- consult bookings ---------- */
/*
 * Bookings store date "YYYY-MM-DD" and slot "11:00" in studio time (India, IST).
 * Customers in the UK see the same moment in UK time.
 */
export function bookingInstant(date: string, slot: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return null;
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec((slot || "").trim());
  let h = 11;
  let min = 0;
  if (m) {
    h = Number(m[1]);
    min = Number(m[2] ?? 0);
    const ap = m[3]?.toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
  }
  const d = new Date(`${date}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const TZ = { in: "Asia/Kolkata", uk: "Europe/London" } as const;

/** "Sat 24 Oct 2026, 11:00 am IST" / "… 6:30 am UK time". */
export function fmtBookingTime(d: Date | null, region: "in" | "uk", withDay = true): string {
  if (!d) return "—";
  const s = d.toLocaleString(region === "uk" ? "en-GB" : "en-IN", {
    timeZone: TZ[region],
    ...(withDay ? { weekday: "short", day: "numeric", month: "short", year: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${s} ${region === "uk" ? "UK time" : "IST"}`;
}

export function meetingPlatform(link: string): string {
  if (/meet\.google\.com/i.test(link)) return "Google Meet";
  if (/zoom\.(us|com)/i.test(link)) return "Zoom";
  if (/wa\.me|whatsapp/i.test(link)) return "WhatsApp video";
  return "video call";
}

export const FESTIVALS = [
  "Diwali", "Durga Puja", "Navratri", "Dussehra", "Karwa Chauth", "Onam", "Pongal", "Sankranti", "Ugadi", "Eid",
  "Raksha Bandhan", "Teej", "Ganesh Chaturthi", "Wedding season", "Christmas", "New Year",
];

/** Colour utility for a return status pill. */
export const returnTone = (s: string) =>
  s === "refunded" || s === "exchanged" ? "text-ok" : s === "rejected" ? "text-sale" : s === "requested" ? "text-bronze" : "text-[#2E4E7A]";
