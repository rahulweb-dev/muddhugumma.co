// Logic checks for the content & merchandising admin helpers against the configured database.
// Creates TEST-prefixed sales / lookbook / booking / review, checks the helpers, then deletes them.
// Usage: node --env-file=.env.local --conditions=react-server --import tsx scripts/test-content-admin.mts
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { db } from "../src/lib/db.ts";
import { Booking, Lookbook, Product, Review, Sale } from "../src/lib/models.ts";
import { pickedProducts, saleOverlaps, saleState, type SaleLike } from "../src/components/admin/content/data.ts";
import { bookingInstant, fmtBookingTime, istInputToIso, isoToIstInput, meetingPlatform, slugify } from "../src/components/admin/content/shared.ts";

await db();
const created: { model: string; id: mongoose.Types.ObjectId }[] = [];
let failed = false;

try {
  /* pure helpers */
  assert.equal(slugify("Diwali at Home: Silks & Jewel Tones!"), "diwali-at-home-silks-and-jewel-tones");
  assert.equal(istInputToIso("2026-10-20T09:00"), "2026-10-20T03:30:00.000Z");
  assert.equal(isoToIstInput("2026-10-20T03:30:00.000Z"), "2026-10-20T09:00");
  assert.equal(istInputToIso("bad"), "");
  const at = bookingInstant("2026-10-24", "11:00");
  assert.equal(at?.toISOString(), "2026-10-24T05:30:00.000Z");
  assert.equal(bookingInstant("2026-10-24", "4:30 pm")?.toISOString(), "2026-10-24T11:00:00.000Z");
  assert.match(fmtBookingTime(at, "in"), /11:00\s?am IST/i);
  assert.match(fmtBookingTime(at, "uk"), /6:30\s?am UK time/i); // BST on 24 Oct
  assert.match(fmtBookingTime(bookingInstant("2026-11-10", "11:00"), "uk"), /5:30\s?am UK time/i); // GMT after 25 Oct
  assert.equal(meetingPlatform("https://meet.google.com/abc-defg-hij"), "Google Meet");
  assert.equal(meetingPlatform("https://wa.me/919876543210"), "WhatsApp video");
  console.log("ok  pure helpers");

  /* sale state + overlaps against the real catalogue */
  const now = Date.now();
  assert.equal(saleState({ active: true, startsAt: new Date(now - 1e6), endsAt: new Date(now + 1e6) }, now), "running");
  assert.equal(saleState({ active: true, startsAt: new Date(now + 1e6), endsAt: new Date(now + 2e6) }, now), "scheduled");
  assert.equal(saleState({ active: true, startsAt: new Date(now - 2e6), endsAt: new Date(now - 1e6) }, now), "ended");
  assert.equal(saleState({ active: false, startsAt: new Date(now - 1e6), endsAt: new Date(now + 1e6) }, now), "off");

  const sample = await Product.findOne({ category: "sarees" }, { slug: 1, name: 1 }).lean<{ slug: string; name: string }>();
  assert.ok(sample, "need at least one saree in the catalogue");
  const day = 864e5;
  const a = await Sale.create({ name: "TEST sale A sarees", banner: "TEST", percentOff: 20, categories: ["sarees"], regions: ["in"], startsAt: new Date(now + day), endsAt: new Date(now + 5 * day), active: true });
  const b = await Sale.create({ name: "TEST sale B one saree", banner: "TEST", percentOff: 30, slugs: [sample.slug], regions: ["in", "uk"], startsAt: new Date(now + 3 * day), endsAt: new Date(now + 8 * day), active: true });
  const c = await Sale.create({ name: "TEST sale C UK lehengas", banner: "TEST", percentOff: 10, categories: ["lehengas"], regions: ["uk"], startsAt: new Date(now + day), endsAt: new Date(now + 5 * day), active: true });
  created.push({ model: "Sale", id: a._id }, { model: "Sale", id: b._id }, { model: "Sale", id: c._id });
  const like = (s: typeof a): SaleLike => ({ id: String(s._id), name: s.name, categories: s.categories, collections: s.collections, slugs: s.slugs, regions: s.regions, startsAt: s.startsAt, endsAt: s.endsAt, active: s.active });
  const ov = await saleOverlaps([like(a), like(b), like(c)], now);
  assert.equal(ov.get(String(a._id))?.length, 1, "A overlaps B");
  assert.match(ov.get(String(a._id))![0], /TEST sale B/);
  assert.equal(ov.get(String(b._id))?.length, 1, "B overlaps A");
  assert.equal(ov.get(String(c._id)), undefined, "C (UK lehengas) overlaps nothing");
  console.log("ok  sale overlaps:", ov.get(String(a._id))![0]);

  /* picked products keep order and flag missing */
  const picked = await pickedProducts(["TEST-missing-slug", sample.slug]);
  assert.equal(picked[0].missing, true);
  assert.equal(picked[1].slug, sample.slug);
  assert.equal(picked[1].name, sample.name);
  console.log("ok  pickedProducts");

  /* models accept what the admin writes */
  const lb = await Lookbook.create({ slug: "test-lookbook-admin", title: "TEST lookbook", festival: "Diwali", productSlugs: [sample.slug], active: false, sort: 99 });
  created.push({ model: "Lookbook", id: lb._id });
  const bk = await Booking.create({ name: "TEST Customer", email: "test-booking@example.com", phone: "07700900123", region: "uk", kind: "bridal", date: "2026-10-24", slot: "11:00", status: "requested" });
  created.push({ model: "Booking", id: bk._id });
  const rv = await Review.create({ productSlug: sample.slug, name: "TEST reviewer", rating: 4, title: "TEST", body: "TEST review body", status: "pending" });
  created.push({ model: "Review", id: rv._id });
  await Review.updateMany({ _id: { $in: [rv._id] } }, { $set: { status: "rejected" } });
  assert.equal((await Review.findById(rv._id).lean<{ status: string }>())?.status, "rejected");
  console.log("ok  lookbook / booking / review writes");
} catch (e) {
  failed = true;
  console.error("FAIL", e);
} finally {
  const models = { Sale, Lookbook, Booking, Review } as const;
  for (const { model, id } of created) await (models[model as keyof typeof models] as mongoose.Model<unknown>).deleteOne({ _id: id });
  console.log(`cleaned up ${created.length} TEST documents`);
  await mongoose.disconnect();
  process.exit(failed ? 1 : 0);
}
