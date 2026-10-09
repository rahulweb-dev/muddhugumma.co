// Checks that only customers with a delivered order can review a product. Creates TEST data and removes it.
// Usage: node --env-file=.env.local --conditions=react-server --import tsx scripts/test-reviews.mts
import mongoose from "mongoose";
import { db } from "../src/lib/db.ts";
import { Order, Product, Review } from "../src/lib/models.ts";
import { reviewEligibility } from "../src/lib/reviews.ts";

await db();
const p = await Product.findOne({ active: true }, { slug: 1, name: 1 }).lean<{ slug: string; name: string }>();
if (!p) throw new Error("No live product to test with.");
const uid = new mongoose.Types.ObjectId().toString();
const email = "test-reviewer@example.com";
const me = { uid, email };
const base = {
  email, region: "in", currency: "INR", subtotal: 100, discount: 0, shipping: 0, codFee: 0, total: 100,
  address: { name: "TEST Reviewer", phone: "9999999999", line1: "1 Test St", city: "Hyderabad", state: "Telangana", postcode: "500001", region: "in" },
  payment: { method: "test", status: "paid" }, history: [],
  items: [{ slug: p.slug, name: p.name, image: "", size: "M", qty: 1, unitPrice: 100, optionsPrice: 0 }],
};
let pass = 0;
let fail = 0;
const check = (label: string, got: string, want: string) => {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${got}${ok ? "" : ` (expected ${want})`}`);
};

try {
  check("signed out", await reviewEligibility(null, p.slug), "signed-out");
  check("never ordered", await reviewEligibility(me, p.slug), "not-bought");

  await Order.create({ ...base, number: "MGTEST-RV1", userId: uid, status: "shipped" });
  check("ordered, still on its way", await reviewEligibility(me, p.slug), "not-bought");

  await Order.updateOne({ number: "MGTEST-RV1" }, { $set: { status: "delivered" } });
  check("delivered (signed-in order)", await reviewEligibility(me, p.slug), "ok");

  await Order.deleteOne({ number: "MGTEST-RV1" });
  await Order.create({ ...base, number: "MGTEST-RV2", email: "Test-Reviewer@Example.com", status: "delivered" });
  check("delivered guest order, same email", await reviewEligibility(me, p.slug), "ok");
  check("delivered, but a different product", await reviewEligibility(me, "some-other-product"), "not-bought");

  await Review.create({ productSlug: p.slug, userId: uid, name: "TEST", rating: 5, title: "Test", body: "Test review body text.", status: "pending" });
  check("already reviewed", await reviewEligibility(me, p.slug), "reviewed");
} finally {
  await Order.deleteMany({ number: /^MGTEST-RV/ });
  await Review.deleteMany({ userId: uid });
  console.log(`\n${pass} passed, ${fail} failed. Test data removed.`);
  await mongoose.disconnect();
}
