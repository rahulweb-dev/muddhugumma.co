import type { Region } from "./region";

export type Money = { now: number; mrp: number };

export type ProductDTO = {
  id: string;
  slug: string;
  name: string;
  category: string; // Category slug
  collections: string[];
  fabric: string;
  occasions: string[];
  colour: string;
  hex: string;
  images: string[];
  price: Record<Region, Money>;
  freeSize: boolean;
  /** Stock for the region the DTO was built for (India and the UK hold separate stock). */
  stock: Record<string, number>;
  tag: string;
  origin: string;
  craft: string;
  description: string;
  details: string[];
  care: string;
  rating: number;
  ratingCount: number;
  active: boolean;
  /** Offer blouse stitching and fall/pico options (sarees with an unstitched blouse piece). */
  blouseOptions: boolean;
  createdAt: string;
};

export type ReviewDTO = { id: string; name: string; city: string; rating: number; title: string; body: string; verified: boolean; date: string };

/** Line in the bag (kept in the browser; prices are re-checked on the server at checkout). */
export type CartLine = {
  key: string; // slug|size|options
  slug: string;
  name: string;
  image: string;
  size: string;
  qty: number;
  price: Record<Region, Money>;
  options?: { blouse?: "unstitched" | "stitched"; fallPico?: boolean };
};

/** Display name for a category slug when its Category record isn't at hand: "half-sarees" → "Half Sarees". */
export const categoryLabel = (slug: string) =>
  slug
    .split("-")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

export const discountPct = (m: Money) => (m.mrp > 0 ? Math.round((1 - m.now / m.mrp) * 100) : 0);

/** Homepage hero slide and story block (Admin → Homepage). Images are ImageKit paths. */
export type HomeSlide = { kicker?: string; title: string; accent?: string; text?: string; ctaLabel?: string; ctaHref?: string; linkLabel?: string; linkHref?: string; image: string; alt?: string };
export type HomeStory = { kicker?: string; title?: string; accent?: string; text?: string; image?: string };
