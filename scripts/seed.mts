// Seeds a real MongoDB (Atlas or local) with the starter catalogue, coupons, reviews and the admin user.
// Usage: npm run seed            (only fills an empty database)
//        npm run seed -- --force (replaces products, coupons and reviews)
import dns from "node:dns";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Product, Coupon, Review, User } from "../src/lib/models.ts";
import { SEED_PRODUCTS, SEED_COUPONS, SEED_REVIEWS } from "../src/lib/seed-data.ts";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set. Add it to .env.local first.");
  process.exit(1);
}
if (process.env.MONGODB_DNS_SERVERS) dns.setServers(process.env.MONGODB_DNS_SERVERS.split(","));
const force = process.argv.includes("--force");

await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || "muddhugumma" });
await Promise.all([Product.syncIndexes(), User.syncIndexes(), Coupon.syncIndexes(), Review.syncIndexes()]);

if (force || (await Product.estimatedDocumentCount()) === 0) {
  if (force) await Promise.all([Product.deleteMany({}), Coupon.deleteMany({}), Review.deleteMany({})]);
  await Product.insertMany(SEED_PRODUCTS);
  await Coupon.insertMany(SEED_COUPONS.map((c) => ({ ...c, regions: [...c.regions] })));
  await Review.insertMany(SEED_REVIEWS);
  console.log(`Seeded ${SEED_PRODUCTS.length} products, ${SEED_COUPONS.length} coupons, ${SEED_REVIEWS.length} reviews.`);
} else {
  console.log("Products already exist; skipping catalogue (use --force to replace).");
}

const email = (process.env.ADMIN_EMAIL || "admin@muddhugumma.com").toLowerCase();
if (!(await User.exists({ email }))) {
  await User.create({ name: "Store Admin", email, role: "admin", passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD || "ChangeMe!2026", 10) });
  console.log(`Created admin ${email}.`);
}
await mongoose.disconnect();
