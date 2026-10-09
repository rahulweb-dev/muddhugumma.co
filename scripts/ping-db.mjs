// Checks the MongoDB connection in .env.local. Usage: node --env-file=.env.local scripts/ping-db.mjs
import dns from "node:dns";
import mongoose from "mongoose";
if (process.env.MONGODB_DNS_SERVERS) dns.setServers(process.env.MONGODB_DNS_SERVERS.split(","));
const t = Date.now();
try {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB || "muddhugumma", serverSelectionTimeoutMS: 15000 });
  await mongoose.connection.db.admin().ping();
  const cols = await mongoose.connection.db.listCollections().toArray();
  console.log(`Connected in ${Date.now() - t} ms to "${mongoose.connection.name}". Collections: ${cols.map((c) => c.name).join(", ") || "(empty database)"}`);
} catch (e) {
  console.error("Connection failed:", e.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
