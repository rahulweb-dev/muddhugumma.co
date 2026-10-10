import "server-only";
import { cache } from "react";
import { db } from "./db";
import { Category, type CategoryDoc } from "./models";

export type CategoryDTO = { slug: string; name: string; kicker: string; blurb: string; image: string; imageFocus: string; sort: number; active: boolean; inNav: boolean };

// Used only until the first category is saved in Admin → Categories (or imported), so a fresh database still has a menu.
const STARTER: CategoryDTO[] = [
  { slug: "sarees", name: "Sarees", kicker: "Six yards of craft", blurb: "", image: "", imageFocus: "top", sort: 0, active: true, inNav: true },
  { slug: "kurta-sets", name: "Kurta Sets", kicker: "Office to evening", blurb: "", image: "", imageFocus: "top", sort: 1, active: true, inNav: true },
  { slug: "lehengas", name: "Lehengas", kicker: "Bridal & occasion", blurb: "", image: "", imageFocus: "top", sort: 2, active: true, inNav: true },
];

const toDTO = (c: CategoryDoc): CategoryDTO => ({
  slug: c.slug,
  name: c.name,
  kicker: c.kicker ?? "",
  blurb: c.blurb ?? "",
  image: c.image ?? "",
  imageFocus: c.imageFocus ?? "top",
  sort: c.sort ?? 0,
  active: c.active !== false,
  inNav: c.inNav !== false,
});

/** Every category, including hidden ones (admin). Cached per request. */
export const allCategories = cache(async (): Promise<CategoryDTO[]> => {
  await db();
  const docs = await Category.find().sort({ sort: 1, name: 1 }).lean<CategoryDoc[]>();
  return docs.length ? docs.map(toDTO) : STARTER;
});

/** Categories shoppers can see, in menu order. */
export const activeCategories = cache(async (): Promise<CategoryDTO[]> => (await allCategories()).filter((c) => c.active));

export async function getCategory(slug: string): Promise<CategoryDTO | undefined> {
  return (await activeCategories()).find((c) => c.slug === slug);
}
