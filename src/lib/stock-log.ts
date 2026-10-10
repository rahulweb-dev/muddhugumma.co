import "server-only";
// Stock history for movements the shop makes by itself (sales, cancellations, returns, exchanges), so Admin → Stock
// can answer "where did this piece go?". Manual edits are logged in actions/stock.ts with exact before/after counts.
// Logging never blocks or fails the sale / return it records.
import { StockLog, type StockReason } from "./models";
import type { Region } from "./region";

export type StockMove = { productId?: string; slug?: string; name?: string; region: Region; size: string; change: number; reason: StockReason; note?: string; by?: { uid: string; name: string } | null };

export async function logStockMoves(moves: StockMove[]) {
  const rows = moves
    .filter((m) => m.change && m.size)
    .map((m) => ({
      productId: m.productId ?? "",
      slug: m.slug ?? "",
      name: m.name ?? m.slug ?? "",
      region: m.region,
      size: m.size,
      change: m.change,
      reason: m.reason,
      note: (m.note ?? "").slice(0, 200),
      byId: m.by?.uid ?? "",
      byName: m.by?.name ?? "Shop",
    }));
  if (!rows.length) return;
  try {
    await StockLog.insertMany(rows, { ordered: false });
  } catch (e) {
    console.error("[stock-log] failed", e);
  }
}
