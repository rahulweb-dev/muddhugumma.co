import "server-only";
import { cache } from "react";
import { db } from "./db";
import { Page, type PageDoc } from "./models";

export type PageDTO = { slug: string; title: string; intro: string; body: string; updatedAt: string };

/** Pages edited in Admin → Pages. Built-in pages (help/policies) fall back to their coded text when there is no saved page. */
export const PAGE_SLOTS: { slug: string; label: string; href: string }[] = [
  { slug: "about", label: "Our story", href: "/about" },
  { slug: "faq", label: "FAQ", href: "/help/faq" },
  { slug: "shipping", label: "Shipping policy", href: "/help/shipping" },
  { slug: "returns", label: "Returns & refunds", href: "/help/returns" },
  { slug: "size-guide", label: "Size guide", href: "/help/size-guide" },
  { slug: "privacy", label: "Privacy policy", href: "/help/privacy" },
  { slug: "terms", label: "Terms & conditions", href: "/help/terms" },
  { slug: "cookies", label: "Cookie policy", href: "/help/cookies" },
];

export const getPage = cache(async (slug: string): Promise<PageDTO | null> => {
  await db();
  const p = await Page.findOne({ slug, published: true }).lean<PageDoc>();
  return p ? { slug: p.slug, title: p.title, intro: p.intro ?? "", body: p.body ?? "", updatedAt: p.updatedAt?.toISOString() ?? "" } : null;
});
