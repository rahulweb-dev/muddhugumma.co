// Video consult dates and times. Pure functions, shared by the booking page, the server action and the tests.
// Stylists work from Hyderabad, so slots are fixed in IST and shown in UK time for UK shoppers.

export const CONSULT_KINDS = [
  { id: "bridal", label: "Bridal", note: "Your wedding lehenga or silk saree, with blouse and drape planning." },
  { id: "trousseau", label: "Trousseau", note: "Sarees and sets for every function after the wedding." },
  { id: "festive", label: "Festive", note: "Diwali, Eid, Onam or a family occasion: one look or several." },
  { id: "styling", label: "Styling", note: "Help choosing a size, colour or fabric for anything in the shop." },
] as const;
export type ConsultKind = (typeof CONSULT_KINDS)[number]["id"];
export const KIND_IDS = CONSULT_KINDS.map((k) => k.id) as [ConsultKind, ...ConsultKind[]];
export const kindLabel = (id: string) => CONSULT_KINDS.find((k) => k.id === id)?.label ?? id;

export const CONSULT_SLOTS = ["11:00", "13:00", "15:00", "17:00"] as const;
export type ConsultSlot = (typeof CONSULT_SLOTS)[number];
export const CONSULT_DAYS = 30;

const IST = "Asia/Kolkata";
const LONDON = "Europe/London";

/** Calendar date (YYYY-MM-DD) in India for an instant. */
export const istDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();

/** Bookable days: tomorrow (India time) up to 30 days ahead, without Sundays. */
export function consultDates(now = new Date()): string[] {
  const today = istDate(now);
  const out: string[] = [];
  for (let i = 1; i <= CONSULT_DAYS; i++) {
    const d = addDays(today, i);
    if (weekday(d) !== 0) out.push(d);
  }
  return out;
}

export const isConsultSlot = (s: string): s is ConsultSlot => (CONSULT_SLOTS as readonly string[]).includes(s);

/** The exact moment a slot starts. */
export const slotInstant = (date: string, slot: string) => new Date(`${date}T${slot}:00+05:30`);

// Labels are built by hand rather than with toLocaleString, so server and browser render exactly the same text
// (ICU builds differ in spacing and "pm"/"PM"), which avoids hydration mismatches.
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WD_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const clock = (h: number, m: number) => `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;

/** "11:00 am IST" */
export function istLabel(_date: string, slot: string) {
  const [h, m] = slot.split(":").map(Number);
  return `${clock(h, m)} IST`;
}

/** London's offset from UTC in hours (0 in winter, 1 in summer) at an instant. */
export function londonOffset(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, hour: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? at.getUTCHours());
  return (h - at.getUTCHours() + 24) % 24;
}

/** "6:30 am BST" or "5:30 am GMT", depending on the date. */
export function ukLabel(date: string, slot: string) {
  const at = slotInstant(date, slot);
  const off = londonOffset(at);
  const mins = at.getUTCHours() * 60 + at.getUTCMinutes() + off * 60;
  return `${clock(Math.floor(mins / 60) % 24, mins % 60)} ${off ? "BST" : "GMT"}`;
}

const parts = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  return { wd: d.getUTCDay(), day: d.getUTCDate(), mon: d.getUTCMonth() };
};
/** "Sat 10 Oct" */
export const dayLabel = (date: string) => {
  const p = parts(date);
  return `${WD[p.wd]} ${p.day} ${MON[p.mon]}`;
};
/** "Saturday 10 October" */
export const longDayLabel = (date: string) => {
  const p = parts(date);
  return `${WD_LONG[p.wd]} ${p.day} ${MON_LONG[p.mon]}`;
};

/** One line for emails and the confirmation: "Saturday 10 October, 3:00 pm IST (10:30 am BST in the UK)". */
export function whenLabel(date: string, slot: string, region: "in" | "uk") {
  const base = `${longDayLabel(date)}, ${istLabel(date, slot)}`;
  return region === "uk" ? `${base} (${ukLabel(date, slot)} in the UK)` : base;
}
