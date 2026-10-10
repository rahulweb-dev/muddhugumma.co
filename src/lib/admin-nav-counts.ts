import "server-only";
// Small counts beside sidebar links ("Ready to pack 3"), for the store picked in the top bar and only for links
// the person can open. Cheap indexed counts, run once per admin page.
import { db } from "./db";
import { Booking, Enquiry, Order, ReturnRequest, Review } from "./models";
import { can, type Permission } from "./permissions";
import { scopeFilter, type AdminScope } from "./admin-scope";

const OPEN_RETURNS = ["requested", "approved", "pickup_scheduled", "picked_up", "received"];

export async function navCounts(role: string, scope: AdminScope): Promise<Record<string, number>> {
  const s = scopeFilter(scope);
  const jobs: [string, Permission, () => Promise<number>][] = [
    ["/admin/packing", "orders.ship", () => Order.countDocuments({ ...s, status: { $in: ["confirmed", "packed"] } })],
    ["/admin/returns", "returns.manage", () => ReturnRequest.countDocuments({ ...s, status: { $in: OPEN_RETURNS } })],
    ["/admin/enquiries", "enquiries.manage", () => Enquiry.countDocuments({ ...s, status: "open" })],
    ["/admin/reviews", "reviews.manage", () => Review.countDocuments({ status: "pending" })],
    ["/admin/bookings", "bookings.manage", () => Booking.countDocuments({ ...s, status: "requested" })],
  ];
  try {
    await db();
    const allowed = jobs.filter(([, perm]) => can(role, perm));
    const values = await Promise.all(allowed.map(([, , run]) => run().catch(() => 0)));
    return Object.fromEntries(allowed.map(([href], i) => [href, values[i]]).filter(([, n]) => (n as number) > 0));
  } catch {
    return {};
  }
}
