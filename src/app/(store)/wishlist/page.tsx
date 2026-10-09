import type { Metadata } from "next";
import { WishlistView } from "@/components/catalog/WishlistView";
import "@/styles/catalog.css";

export const metadata: Metadata = {
  title: "Wishlist",
  description: "Sarees, kurta sets and lehengas you have saved for later.",
  robots: { index: false, follow: false },
};

/** The list itself lives in the browser (and in the account when signed in), so the page is rendered by a client component. */
export default function WishlistPage() {
  return <WishlistView />;
}
