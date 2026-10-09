// End-to-end check of order tracking against the configured database.
// Usage: node --env-file=.env.local --conditions=react-server --import tsx scripts/test-tracking.mts [create|ship|deliver|cleanup]
import { db } from "../src/lib/db.ts";
import { Order, Product } from "../src/lib/models.ts";
import { findTrackableOrder, recordShipment, recordTrackingEvent } from "../src/lib/tracking.ts";
import mongoose from "mongoose";

const NUMBER = "MGTEST0001";
const step = process.argv[2] ?? "create";
await db();

if (step === "create") {
  await Order.deleteOne({ number: NUMBER });
  const p = await Product.findOne({ slug: "bottle-green-banarasi-silk-saree" }).lean();
  const o = await Order.create({
    number: NUMBER, email: "tracking-test@example.com", region: "in", currency: "INR",
    items: [{ slug: p!.slug, name: p!.name, image: p!.images[0], size: "Free size", qty: 1, unitPrice: p!.price.in.now, optionsPrice: 0 }],
    address: { name: "Test Customer", phone: "+91 98765 43210", line1: "1 Test Street", city: "Bengaluru", state: "Karnataka", postcode: "560001", region: "in" },
    subtotal: p!.price.in.now, discount: 0, shipping: 0, codFee: 0, total: p!.price.in.now,
    payment: { method: "test", status: "paid", ref: "TEST" }, status: "confirmed",
    history: [{ status: "placed", at: new Date(Date.now() - 864e5), note: "test" }, { status: "confirmed", at: new Date(), note: "test" }],
  });
  console.log("created", NUMBER, String(o._id));
}

if (step === "ship") {
  console.log("ship:", await recordShipment({ number: NUMBER }, { courier: "delhivery", awb: "TEST1234567890" }, "test"));
  console.log("scan:", await recordTrackingEvent({ number: NUMBER }, { code: "in_transit", location: "Hyderabad hub", at: new Date(Date.now() - 36e5 * 5) }, "test"));
  console.log("scan:", await recordTrackingEvent({ awb: "TEST1234567890" }, { code: "reached_hub", location: "Bengaluru hub", at: new Date(Date.now() - 36e5) }, "test"));
  console.log("dupe:", await recordTrackingEvent({ awb: "TEST1234567890" }, { code: "reached_hub", location: "Bengaluru hub", at: new Date(Date.now() - 36e5) }, "test"));
  const o = await Order.findOne({ number: NUMBER }).lean();
  console.log("status now:", o?.status, "| events:", o?.shipment?.events?.length);
  console.log("guest lookup by phone:", (await findTrackableOrder("mgtest0001", "9876543210"))?.shipment?.courierName ?? null);
  console.log("guest lookup by email:", (await findTrackableOrder(NUMBER, "Tracking-Test@example.com"))?.status ?? null);
  console.log("guest lookup wrong contact:", await findTrackableOrder(NUMBER, "someone@else.com"));
}

if (step === "deliver") {
  console.log("ofd:", await recordTrackingEvent({ awb: "TEST1234567890" }, { code: "out_for_delivery", location: "Bengaluru", at: new Date(Date.now() - 6e5) }, "test"));
  console.log("delivered:", await recordTrackingEvent({ awb: "TEST1234567890" }, { code: "delivered", location: "Bengaluru" }, "test"));
  const o = await Order.findOne({ number: NUMBER }).lean();
  console.log("status now:", o?.status, "| deliveredAt set:", !!o?.shipment?.deliveredAt);
}

if (step === "cleanup") console.log("deleted:", (await Order.deleteOne({ number: NUMBER })).deletedCount);

await mongoose.disconnect();
