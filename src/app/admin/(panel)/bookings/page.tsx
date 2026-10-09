import type { Metadata } from "next";
import Link from "next/link";
import type { Types } from "mongoose";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Booking, type BookingDoc } from "@/lib/models";
import { dayKey, first, fmtDateTime, qs } from "@/lib/admin-data";
import { BookingActions } from "@/components/admin/content/BookingActions";
import { bookingInstant, fmtBookingTime, meetingPlatform } from "@/components/admin/content/shared";

export const metadata: Metadata = { title: "Consult bookings" };

const STATUSES = ["requested", "confirmed", "done", "cancelled"] as const;
const KIND: Record<string, string> = { bridal: "Bridal", trousseau: "Trousseau", festive: "Festive styling", styling: "Styling" };
const TONE: Record<string, string> = { requested: "text-bronze", confirmed: "text-[#2E4E7A]", done: "text-ok", cancelled: "text-sale" };
type SP = Promise<Record<string, string | string[] | undefined>>;
type LeanBooking = BookingDoc & { _id: Types.ObjectId };

const dayLabel = (key: string) =>
  new Date(`${key}T12:00:00+05:30`).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric" });

export default async function AdminBookings({ searchParams }: { searchParams: SP }) {
  await requireAdmin("bookings.manage");
  const sp = await searchParams;
  const raw = first(sp.status);
  const status = (STATUSES as readonly string[]).includes(raw) ? raw : "";
  const when = first(sp.when) === "past" ? "past" : "upcoming";
  const today = dayKey(new Date());

  await db();
  const filter: Record<string, unknown> = when === "past" ? { date: { $lt: today } } : { date: { $gte: today } };
  if (status) filter.status = status;
  const [rows, counts, waiting] = await Promise.all([
    Booking.find(filter).sort({ date: when === "past" ? -1 : 1, slot: 1 }).limit(300).lean<LeanBooking[]>(),
    Booking.aggregate<{ _id: string; n: number }>([{ $match: when === "past" ? { date: { $lt: today } } : { date: { $gte: today } } }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    Booking.countDocuments({ status: "requested", date: { $gte: today } }),
  ]);
  const countOf = (s: string) => counts.find((c) => c._id === s)?.n ?? 0;
  const all = counts.reduce((a, c) => a + c.n, 0);

  const groups = new Map<string, LeanBooking[]>();
  for (const b of rows) {
    const k = b.date || "No date";
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  const base = { status, when: when === "past" ? "past" : undefined };

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">Customer service</p>
          <h1 className="adm-title">Consult bookings <span className="muted">({waiting} to confirm)</span></h1>
          <p className="muted adm-small">Slots are booked in studio time (IST). UK customers are emailed the UK time.</p>
        </div>
        <nav className="adm-row" aria-label="Time range">
          <Link className={`btn adm-btn ${when === "upcoming" ? "" : "ghost"}`} href={`/admin/bookings${qs({ status })}`}>Upcoming</Link>
          <Link className={`btn adm-btn ${when === "past" ? "" : "ghost"}`} href={`/admin/bookings${qs({ status }, { when: "past" })}`}>Past</Link>
        </nav>
      </header>

      <nav className="adm-tabs" aria-label="Filter by status">
        <Link href={`/admin/bookings${qs(base, { status: undefined })}`} aria-current={!status ? "page" : undefined}>All <span>{all}</span></Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/bookings${qs(base, { status: s })}`} aria-current={status === s ? "page" : undefined}>{s} <span>{countOf(s)}</span></Link>
        ))}
      </nav>

      {groups.size ? (
        [...groups.entries()].map(([day, list]) => (
          <section key={day} className="flex flex-col gap-3">
            <h2 className="h3 flex items-baseline gap-2">
              {day === "No date" ? day : dayLabel(day)}
              {day === today ? <span className="kick">Today</span> : null}
            </h2>
            <ul className="list-none m-0 p-0 grid gap-3 lg:grid-cols-2">
              {list.map((b) => {
                const at = bookingInstant(b.date, b.slot);
                const region = b.region === "uk" ? "uk" : "in";
                return (
                  <li key={String(b._id)} className="adm-card">
                    <div className="flex justify-between gap-3 items-start flex-wrap">
                      <div className="flex flex-col gap-1 min-w-0">
                        <b className="text-[15px]">{fmtBookingTime(at, "in", false)} · {b.name || "—"}</b>
                        <small className="muted">
                          {KIND[b.kind] ?? b.kind} consult · {region === "uk" ? "UK customer" : "India customer"}
                          {region === "uk" ? ` · ${fmtBookingTime(at, "uk", false)} for them` : ""}
                        </small>
                      </div>
                      <span className={`status ${TONE[b.status] ?? ""}`}>{b.status}</span>
                    </div>
                    <dl className="adm-dl">
                      <div><dt>Email</dt><dd><a className="adm-a" href={`mailto:${b.email}`}>{b.email}</a></dd></div>
                      {b.phone ? <div><dt>Phone</dt><dd><a className="adm-a" href={`tel:${b.phone}`}>{b.phone}</a></dd></div> : null}
                      {b.meetingLink ? <div><dt>{meetingPlatform(b.meetingLink)}</dt><dd><a className="adm-a" href={b.meetingLink} target="_blank" rel="noreferrer">{b.meetingLink.replace(/^https:\/\//, "")}</a></dd></div> : null}
                      <div><dt>Requested</dt><dd>{fmtDateTime(b.createdAt)}</dd></div>
                    </dl>
                    {b.notes ? <p className="m-0 whitespace-pre-line bg-stone p-3 text-[13px]">{b.notes}</p> : null}
                    <BookingActions id={String(b._id)} status={b.status} link={b.meetingLink ?? ""} phone={b.phone ?? ""} region={region} />
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      ) : (
        <div className="empty">
          <p>{when === "past" ? "No past bookings match." : status ? `No upcoming ${status} bookings.` : "No upcoming consult bookings. Requests from the booking form appear here."}</p>
        </div>
      )}
    </div>
  );
}
