import "server-only";
import dns from "node:dns";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Product, Coupon, Review, User } from "./models";
import { SEED_PRODUCTS, SEED_COUPONS, SEED_REVIEWS } from "./seed-data";

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null; memUri?: string };
const g = globalThis as unknown as { __mongo?: Cache };
const cache: Cache = (g.__mongo ??= { conn: null, promise: null });

// Some ISP/router DNS servers refuse the SRV lookup that mongodb+srv:// needs; MONGODB_DNS_SERVERS=8.8.8.8,1.1.1.1 works around it.
// Applied as soon as this module loads so the very first connection already uses it.
function applyDnsServers() {
  const servers = process.env.MONGODB_DNS_SERVERS?.split(",").map((x) => x.trim()).filter(Boolean);
  if (servers?.length) {
    dns.setServers(servers);
    dns.promises.setServers(servers);
  }
}
applyDnsServers();

const isSrvLookupError = (e: unknown) => (e as { syscall?: string })?.syscall === "querySrv";

async function resolveUri(): Promise<string> {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  if (process.env.NODE_ENV === "production") throw new Error("MONGODB_URI is not set.");
  // Local development without a database: start an in-memory MongoDB once per process.
  if (!cache.memUri) {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const server = await MongoMemoryServer.create();
    cache.memUri = server.getUri("muddhugumma");
    console.info("[db] MONGODB_URI not set, using in-memory MongoDB (data resets on restart).");
  }
  return cache.memUri;
}

export async function db() {
  if (cache.conn) return cache.conn;
  cache.promise ??= (async () => {
    const uri = await resolveUri();
    const opts = { dbName: process.env.MONGODB_DB || "muddhugumma", bufferCommands: false };
    let m: typeof mongoose;
    try {
      m = await mongoose.connect(uri, opts);
    } catch (e) {
      if (!isSrvLookupError(e)) throw e;
      // A refused SRV lookup is usually transient or a resolver that wasn't ready yet: re-apply and retry once.
      applyDnsServers();
      m = await mongoose.connect(uri, opts);
    }
    if (process.env.SEED_ON_EMPTY !== "false") await seedIfEmpty();
    return m;
  })();
  try {
    cache.conn = await cache.promise;
  } catch (e) {
    cache.promise = null;
    throw e;
  }
  return cache.conn;
}

export async function seedIfEmpty(force = false) {
  if (force || (await Product.estimatedDocumentCount()) === 0) {
    if (force) await Promise.all([Product.deleteMany({}), Coupon.deleteMany({}), Review.deleteMany({})]);
    await Product.insertMany(SEED_PRODUCTS);
    await Coupon.insertMany(SEED_COUPONS.map((c) => ({ ...c, regions: [...c.regions] })));
    await Review.insertMany(SEED_REVIEWS);
    console.info(`[db] Seeded ${SEED_PRODUCTS.length} products, ${SEED_COUPONS.length} coupons.`);
  }
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@muddhugumma.com").toLowerCase();
  if (!(await User.exists({ email: adminEmail }))) {
    await User.create({
      name: "Store Admin",
      email: adminEmail,
      passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD || "ChangeMe!2026", 10),
      role: "admin",
    });
    console.info(`[db] Created admin user ${adminEmail}.`);
  }
}
