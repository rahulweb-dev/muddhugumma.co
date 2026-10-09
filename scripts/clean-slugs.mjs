// One-off: shorter, cleaner product URLs. Drops the "-hom-91" style import suffix and long tails like
// "-with-fully-stitched-blouse-and-pico-falls", adding the colour (then -2, -3) to keep each URL unique:
//   soft-georgette-saree-with-checks-pattern-and-bhutis-fully-stitched-hom-91 → soft-georgette-saree-red
// The old slug is kept in product.oldSlugs so /p/<old> 301-redirects, and every stored reference moves to the new
// slug (same collections as src/lib/product-slugs.ts). Safe to re-run: clean slugs are left alone.
// Usage: npm run slugs:clean            (dry run: prints old → new)
//        npm run slugs:clean -- --apply
import dns from "node:dns";
import mongoose from "mongoose";

if (process.env.MONGODB_DNS_SERVERS) dns.setServers(process.env.MONGODB_DNS_SERVERS.split(","));
const apply = process.argv.includes("--apply");

const IMPORT_SUFFIX = /-[a-z]{2,4}-\d+$/;
const STOP_TAIL = new Set(["with", "and", "the", "of", "for", "in", "a", "fully", "stitched"]);
const slugify = (s) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function cleanBase(name, slug) {
  let words = slugify(name || slug.replace(IMPORT_SUFFIX, "")).split("-").filter(Boolean);
  // Long names: stop before the details ("…saree with fully stitched blouse and pico falls").
  if (words.length > 6) {
    const cut = words.indexOf("with", 2);
    if (cut > 0) words = words.slice(0, cut);
    words = words.slice(0, 8);
  }
  while (words.length > 2 && STOP_TAIL.has(words[words.length - 1])) words.pop();
  return words.join("-");
}

try {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB || "muddhugumma", serverSelectionTimeoutMS: 15000 });
  const d = mongoose.connection.db;
  const products = await d.collection("products").find({}, { projection: { slug: 1, name: 1, colour: 1 } }).toArray();
  const todo = products.filter((p) => IMPORT_SUFFIX.test(p.slug) || p.slug.length > 60);
  const taken = new Set(products.filter((p) => !todo.includes(p)).map((p) => p.slug));

  const plan = [];
  for (const p of todo) {
    let base = cleanBase(p.name, p.slug);
    if (p.colour && !base.split("-").includes(p.colour)) base = `${base}-${p.colour}`;
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    taken.add(slug);
    if (slug !== p.slug) plan.push({ _id: p._id, from: p.slug, to: slug });
  }

  console.log(`${products.length} products, ${plan.length} to rename.\n`);
  for (const r of plan) console.log(`  ${r.from}\n    → ${r.to}`);

  if (!apply) {
    console.log("\nDry run, nothing changed. Run again with --apply to rename (old URLs will 301-redirect).");
  } else {
    for (const { _id, from, to } of plan) {
      await d.collection("products").updateOne({ _id }, { $set: { slug: to }, $addToSet: { oldSlugs: from } });
      const af = { arrayFilters: [{ "l.slug": from }] };
      await Promise.all([
        d.collection("users").updateMany({ wishlist: from }, { $set: { "wishlist.$": to } }),
        d.collection("users").updateMany({ "cart.slug": from }, { $set: { "cart.$[l].slug": to } }, af),
        d.collection("orders").updateMany({ "items.slug": from }, { $set: { "items.$[l].slug": to } }, af),
        d.collection("returnrequests").updateMany({ "items.slug": from }, { $set: { "items.$[l].slug": to } }, af),
        d.collection("reviews").updateMany({ productSlug: from }, { $set: { productSlug: to } }),
        d.collection("stockalerts").updateMany({ productSlug: from }, { $set: { productSlug: to } }),
        d.collection("lookbooks").updateMany({ productSlugs: from }, { $set: { "productSlugs.$": to } }),
        d.collection("bundles").updateMany({ productSlugs: from }, { $set: { "productSlugs.$": to } }),
        d.collection("sales").updateMany({ slugs: from }, { $set: { "slugs.$": to } }),
      ]);
    }
    console.log(`\nRenamed ${plan.length} products. Old URLs now redirect to the new ones.`);
  }
} catch (e) {
  console.error("Failed:", e.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
