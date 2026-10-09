import type { HomeSlide, HomeStory } from "./types";

// Shown until slides and the story are saved in Admin → Homepage.
export const DEFAULT_SLIDES: HomeSlide[] = [
  {
    kicker: "The Festive Edit",
    title: "Tissue, zari",
    accent: "& candlelight",
    text: "Kurta sets and dupattas woven with gold-toned zari, made for festive evenings at home and abroad.",
    ctaLabel: "Shop new in",
    ctaHref: "/c/new",
    linkLabel: "Shop all",
    linkHref: "/c/all",
    image: "products/hero-tissue-kurta.webp",
    alt: "Model in a plum tissue kurta set with a gold zari dupatta",
  },
];

export const DEFAULT_STORY: HomeStory = {
  kicker: "Our story",
  title: "Ethnic wear that celebrates",
  accent: "heritage & grace",
  text: "Muddhugumma means a cherished, darling girl. We started this house to bring the clothes our mothers wore to women in India and across the UK.",
  image: "products/craft-zari-detail.webp",
};
