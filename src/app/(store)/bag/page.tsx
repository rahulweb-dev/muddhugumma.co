import type { Metadata } from "next";
import { BagClient } from "@/components/checkout/BagClient";
import { getProducts } from "@/lib/queries";
import { getActiveSales } from "@/lib/sales";
import "@/styles/checkout.css";

export const metadata: Metadata = { title: "Shopping bag", robots: { index: false } };

export default async function BagPage() {
  const [suggestions, sales] = await Promise.all([
    getProducts({}, 12, { rating: -1, ratingCount: -1 }).catch(() => []),
    getActiveSales().catch(() => []),
  ]);
  return <BagClient suggestions={suggestions} sales={sales} />;
}
