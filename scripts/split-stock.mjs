// One-off: India and the UK now hold separate stock (`stock` = India, `stockUk` = UK).
// Copies each product's current counts into `stockUk` so the UK starts with the same numbers; correct them in Admin
// afterwards. Products that already have UK stock are left alone, so running it twice is safe.
// Usage: npm run stock:split            (dry run: shows what would change)
//        npm run stock:split -- --apply
import dns from "node:dns";
import mongoose from "mongoose";

if (process.env.MONGODB_DNS_SERVERS) dns.setServers(process.env.MONGODB_DNS_SERVERS.split(","));
const apply = process.argv.includes("--apply");
const missingUk = { $or: [{ stockUk: { $exists: false } }, { stockUk: {} }, { stockUk: null }] };

try {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB || "muddhugumma", serverSelectionTimeoutMS: 15000 });
  const products = mongoose.connection.db.collection("products");
  const total = await products.countDocuments();
  const todo = await products.find(missingUk, { projection: { slug: 1, stock: 1 } }).toArray();
  console.log(`${total} products, ${todo.length} without UK stock.`);
  for (const p of todo.slice(0, 10)) console.log(`  ${p.slug}: ${JSON.stringify(p.stock ?? {})}`);
  if (todo.length > 10) console.log(`  … and ${todo.length - 10} more`);

  if (!apply) {
    console.log("\nDry run, nothing changed. Run again with --apply to copy these counts into UK stock.");
  } else if (todo.length) {
    const res = await products.updateMany(missingUk, [{ $set: { stockUk: { $ifNull: ["$stock", {}] } } }]);
    console.log(`\nCopied stock into UK stock for ${res.modifiedCount} products.`);
  }
} catch (e) {
  console.error("Failed:", e.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
