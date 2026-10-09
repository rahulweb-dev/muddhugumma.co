// Logic checks for the admin operations area against the configured database.
// Usage: node --env-file=.env.local --conditions=react-server --import tsx scripts/test-admin.mts
// Creates only documents with TEST in their identifiers and deletes them at the end. Real products are only read.
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { db } from "../src/lib/db.ts";
import { Order, Product, Supplier, type ProductDoc } from "../src/lib/models.ts";
import { parseCsv, parseCsvObjects, toCsv } from "../src/lib/csv.ts";
import { IMPORT_COLUMNS } from "../src/components/admin/constants.ts";
import {
  analyseImport,
  codToCollect,
  financialYear,
  lowStockExpr,
  productCsvRow,
  stitchingItemMatch,
  zonedDayStart,
} from "../src/lib/admin-data.ts";
import { run as lowStockRun } from "../src/lib/jobs/low-stock.ts";
import { loadReport, resolveRange } from "../src/app/admin/(panel)/reports/data.ts";

let passed = 0;
const ok = (name: string, fn: () => void | Promise<void>) =>
  Promise.resolve().then(fn).then(
    () => {
      passed++;
      console.log(`  ✓ ${name}`);
    },
    (e) => {
      console.error(`  ✗ ${name}\n    ${e instanceof Error ? e.message : e}`);
      process.exitCode = 1;
    }
  );

const TEST_SLUG = "test-admin-import-saree";
const TEST_SUPPLIER = "TEST Supplier Admin Ops";
const TEST_ORDER = "MGTESTADMIN01";

console.log("csv");
await ok("parses quotes, escaped quotes, commas and newlines in fields, CRLF and BOM", () => {
  const rows = parseCsv('﻿a,b,c\r\n"x, y","he said ""hi""","line1\nline2"\r\n1,,3\n\n');
  assert.deepEqual(rows, [["a", "b", "c"], ["x, y", 'he said "hi"', "line1\nline2"], ["1", "", "3"]]);
});
await ok("throws on an unclosed quote with its line number", () => {
  assert.throws(() => parseCsv('a,b\n1,"oops\n'), /Line 2/);
});
await ok("round-trips through toCsv", () => {
  const data = [["slug", "details"], ["x", 'Has "quotes", commas\nand lines']];
  assert.deepEqual(parseCsv(toCsv(data)), data);
});
await ok("safe mode neutralises formulas but keeps numbers", () => {
  const out = toCsv([["=HYPERLINK(1)", -5, "+44 7700"]], { safe: true });
  assert.equal(out, "'=HYPERLINK(1),-5,'+44 7700\r\n");
});
await ok("header objects are lower-cased and trimmed with line numbers", () => {
  const { headers, rows } = parseCsvObjects("Slug, Stock_M \nabc, 4 \n");
  assert.deepEqual(headers, ["slug", "stock_m"]);
  assert.deepEqual(rows, [{ line: 2, values: { slug: "abc", stock_m: "4" } }]);
});

console.log("dates and money");
await ok("zonedDayStart is IST midnight", () => {
  assert.equal(zonedDayStart("2026-10-09")?.toISOString(), "2026-10-08T18:30:00.000Z");
  assert.equal(zonedDayStart("2026-13-40"), null);
});
await ok("financial year runs April to March", () => {
  assert.deepEqual(financialYear(new Date("2026-10-09T06:00:00Z")), { from: "2026-04-01", to: "2027-03-31", label: "FY 2026-27" });
  assert.equal(financialYear(new Date("2027-02-01T06:00:00Z")).from, "2026-04-01");
});
await ok("resolveRange presets and custom", () => {
  const r7 = resolveRange({ range: "7" });
  assert.equal(Math.round((r7.end.getTime() - r7.start.getTime()) / 86_400_000), 7);
  const c = resolveRange({ from: "2026-10-05", to: "2026-10-01" });
  assert.equal(c.from, "2026-10-01");
  assert.equal(c.preset, "custom");
});
await ok("codToCollect: full COD, part COD, prepaid", () => {
  assert.equal(codToCollect({ payment: { method: "cod", status: "pending" }, total: 2500 }), 2500);
  assert.equal(codToCollect({ payment: { method: "cod", status: "pending" }, total: 2500, partialCod: { paidOnline: 200, dueOnDelivery: 2300 } }), 2300);
  assert.equal(codToCollect({ payment: { method: "razorpay", status: "paid" }, total: 2500 }), 0);
});

await db();
try {
  await Product.deleteMany({ slug: TEST_SLUG });
  await Supplier.deleteMany({ name: TEST_SUPPLIER });
  await Order.deleteMany({ number: TEST_ORDER });
  const supplier = await Supplier.create({ name: TEST_SUPPLIER, cluster: "Test cluster" });

  console.log("bulk upload analysis (no writes to real products)");
  const real = await Product.findOne({ slug: { $not: /^test-/ } }).lean<ProductDoc>();
  assert.ok(real, "needs at least one real product in the database");
  const realRow = productCsvRow(real!);
  const header = [...IMPORT_COLUMNS];

  await ok("an exported real product re-imports as unchanged", async () => {
    const res = await analyseImport(toCsv([header, realRow]));
    assert.ok(res.ok);
    if (res.ok) assert.equal(res.items[0].row.action, "unchanged", JSON.stringify(res.items[0].row));
  });

  await ok("a partial file (slug + one stock column) updates only stock", async () => {
    const size = real!.freeSize ? "stock_free" : "stock_M";
    const res = await analyseImport(`slug,${size}\n${real!.slug},987\n`);
    assert.ok(res.ok);
    if (res.ok) {
      assert.equal(res.items[0].row.action, "update");
      assert.deepEqual(res.items[0].row.changes, ["stock"]);
      assert.equal(res.missingColumns.length, IMPORT_COLUMNS.length - 2);
    }
  });

  const newRow = IMPORT_COLUMNS.map((c) => (({
    slug: TEST_SLUG, name: "TEST Admin Import Saree", category: "Sarees", fabric: "Silk", colour: "green", hex: "",
    collections: "festive|new", occasions: "wedding", price_in: "₹4,999", mrp_in: "5999", price_uk: "60", mrp_uk: "",
    free_size: "yes", stock_free: "2", details: "Line one|Line two", images: "products/test-a.webp|products/test-b.webp",
    supplier: TEST_SUPPLIER.toLowerCase(), cost_price: "2000", active: "false", made_to_order: "true",
  }) as Record<string, string>)[c] ?? "");
  const bad = (over: Record<string, string>, slug: string) => IMPORT_COLUMNS.map((c, i) => (c === "slug" ? slug : over[c] ?? newRow[i]));

  await ok("validates new, error and duplicate rows", async () => {
    const csv = toCsv([
      header,
      newRow,
      bad({ category: "dupattas" }, "test-admin-bad-cat"),
      bad({ mrp_in: "100" }, "test-admin-bad-mrp"),
      bad({ supplier: "Nobody Weaves" }, "test-admin-bad-sup"),
      bad({ price_uk: "abc" }, "test-admin-bad-num"),
      newRow,
      bad({ name: "" }, "test-admin-missing-name"),
    ]);
    const res = await analyseImport(csv);
    assert.ok(res.ok);
    if (!res.ok) return;
    const [c, cat, mrp, sup, num, dup, missing] = res.items.map((i) => i.row);
    assert.equal(c.action, "create", JSON.stringify(c));
    const doc = res.items[0].doc!;
    assert.equal(doc.price.in.now, 4999);
    assert.equal(doc.hex, "#1D5A3A");
    assert.equal(doc.category, "sarees");
    assert.deepEqual(doc.stock, { "Free size": 2 });
    assert.equal(doc.supplierId, String(supplier._id));
    assert.equal(doc.madeToOrder, true);
    assert.equal(doc.active, false);
    assert.match(cat.errors.join(), /category/);
    assert.match(mrp.errors.join(), /MRP/);
    assert.match(sup.errors.join(), /supplier/);
    assert.match(num.errors.join(), /price_uk/);
    assert.match(dup.errors.join(), /already used on line 2/);
    assert.match(missing.errors.join(), /name is required/);
  });

  await ok("apply creates the TEST product, then the same file is unchanged and '-' clears a list", async () => {
    const res = await analyseImport(toCsv([header, newRow]));
    assert.ok(res.ok && res.items[0].doc);
    if (!res.ok) return;
    await Product.create(res.items[0].doc!); // what applyImport does for a "create" row
    const again = await analyseImport(toCsv([header, newRow]));
    assert.ok(again.ok);
    if (again.ok) assert.equal(again.items[0].row.action, "unchanged", JSON.stringify(again.items[0].row));
    const cleared = await analyseImport(`slug,collections,tag\n${TEST_SLUG},-,\n`);
    assert.ok(cleared.ok);
    if (cleared.ok) {
      assert.deepEqual(cleared.items[0].row.changes, ["collections"]);
      assert.deepEqual(cleared.items[0].doc!.collections, []);
    }
  });

  console.log("low stock");
  await ok("lowStockExpr finds the TEST product (2 pieces)", async () => {
    const hit = await Product.exists({ slug: TEST_SLUG, $expr: lowStockExpr(3) });
    const miss = await Product.exists({ slug: TEST_SLUG, $expr: lowStockExpr(1) });
    assert.ok(hit);
    assert.equal(miss, null);
  });
  await ok("low-stock job returns a summary", async () => {
    const saved = process.env.TEAM_EMAIL;
    delete process.env.TEAM_EMAIL; // never send real mail from a test
    const s = await lowStockRun();
    if (saved !== undefined) process.env.TEAM_EMAIL = saved;
    assert.match(s, /low on stock|No live product/);
    console.log(`    ${s}`);
  });

  console.log("stitching and reports");
  await Order.create({
    number: TEST_ORDER, email: "test-admin@example.com", region: "in", currency: "INR",
    items: [
      { slug: TEST_SLUG, name: "TEST Admin Import Saree", image: "", size: "Free size", qty: 1, unitPrice: 4999, optionsPrice: 899, options: { blouse: "stitched" } },
      { slug: "test-admin-plain", name: "TEST plain", image: "", size: "M", qty: 1, unitPrice: 1000, optionsPrice: 0 },
    ],
    address: { name: "TEST Customer", phone: "9876543210", line1: "1 Test Street", city: "Hyderabad", state: "Telangana", postcode: "500033", region: "in" },
    subtotal: 6898, discount: 0, shipping: 0, codFee: 49, total: 6947,
    payment: { method: "cod", status: "pending" }, status: "confirmed",
    partialCod: { paidOnline: 200, dueOnDelivery: 6747 },
  });
  await ok("stitchingItemMatch selects only the stitched item", async () => {
    const rows = await Order.aggregate([{ $match: { number: TEST_ORDER } }, { $unwind: "$items" }, { $match: stitchingItemMatch([], "items.") }]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].items.slug, TEST_SLUG);
  });
  await ok("stitching status write by index (as the board action does)", async () => {
    const r = await Order.updateOne({ number: TEST_ORDER, "items.0.slug": TEST_SLUG }, { $set: { "items.0.stitching.status": "cutting", "items.0.stitching.measurements": { bust: "36" } } });
    assert.equal(r.modifiedCount, 1);
    const o = await Order.findOne({ number: TEST_ORDER }).lean();
    assert.equal(o?.items[0].stitching?.status, "cutting");
  });
  await ok("report counts the TEST order, its units and India margin", async () => {
    const rep = await loadReport(resolveRange({ range: "7" }));
    assert.ok(rep.in.orders >= 1 && rep.in.units >= 2);
    assert.ok(rep.in.margin);
    const top = rep.in.bestByRevenue.find((b) => b.key === TEST_SLUG);
    assert.equal(top?.revenue, 5898);
    assert.ok(rep.in.margin!.byProduct.some((m) => m.key === TEST_SLUG && m.margin === 5898 - 2000));
    assert.ok(rep.in.cod.orders >= 1);
  });
} finally {
  const p = await Product.deleteMany({ slug: { $in: [TEST_SLUG] } });
  const s = await Supplier.deleteMany({ name: TEST_SUPPLIER });
  const o = await Order.deleteMany({ number: TEST_ORDER });
  console.log(`cleanup: ${p.deletedCount} product, ${s.deletedCount} supplier, ${o.deletedCount} order removed`);
  await mongoose.disconnect();
}
console.log(`${passed} checks passed${process.exitCode ? " (with failures)" : ""}`);
