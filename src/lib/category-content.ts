// Text under each category grid: a short guide and FAQs, written for shoppers and for search engines.
// Delivery, returns and price figures come from REGION_CONFIG so they never drift from checkout.
import { REGION_CONFIG, formatMoney, type Region } from "./region";

export type CategoryContent = { heading: string; intro: string[]; faqs: { q: string; a: string }[] };

type Copy = { heading: Record<Region, string>; intro: Record<Region, string[]>; faqs?: (region: Region) => { q: string; a: string }[] };

const COPY: Record<string, Copy> = {
  sarees: {
    heading: { in: "Buying sarees online in India", uk: "Buying Indian sarees in the UK" },
    intro: {
      in: [
        "Our sarees come from weaving clusters across India: Kanjeevaram and soft silks from the south, Banarasi from Varanasi, tissue, georgette and handloom cottons for every day. Each one is chosen for the weave, the drape and the colour in natural light.",
        "Pick a silk saree for weddings and pujas, a georgette or chiffon for parties, and a handloom cotton or linen for office and summer. Most of our sarees come with a blouse piece, and we can stitch the blouse and finish the fall and pico for you.",
      ],
      uk: [
        "Our sarees are woven in India and delivered to your door in the UK: Kanjeevaram and soft silks, Banarasi, tissue, georgette and handloom cottons. Duties and VAT are included in the price, so there is nothing to pay on arrival.",
        "Choose a silk saree for weddings, Diwali and pujas, a georgette or chiffon for parties and receptions, and a cotton or linen for summer. We can stitch the blouse to your measurements and finish the fall and pico before it ships.",
      ],
    },
    faqs: (r) => [
      { q: "Do the sarees come with a blouse?", a: `Most of our sarees include an unstitched blouse piece. You can add blouse stitching (${formatMoney(REGION_CONFIG[r].blouseStitching, r)}) and fall and pico (${formatMoney(REGION_CONFIG[r].fallPico, r)}) on the product page.` },
      { q: "Which saree is best for a wedding?", a: "Kanjeevaram and Banarasi silks are the classic choice for brides and wedding guests. For receptions and sangeet, tissue and georgette sarees are lighter and easier to dance in." },
    ],
  },
  "half-sarees": {
    heading: { in: "Half sarees for every function", uk: "Half sarees and langa voni in the UK" },
    intro: {
      in: ["Half sarees (langa voni) are the South Indian three-piece of skirt, blouse and voni drape, worn for ceremonies, festivals and family functions. Ours come in pattu silks and festive fabrics with rich zari borders."],
      uk: ["Half sarees (langa voni) are the South Indian three-piece of skirt, blouse and voni drape, loved for ceremonies, festivals and family functions. Ours are made in India and delivered across the UK with duties included."],
    },
    faqs: () => [{ q: "What is included in a half saree set?", a: "A half saree set has the langa (long skirt), the blouse and the voni (the half-saree drape). The product page lists exactly what is in each set and whether the blouse is stitched." }],
  },
  "3-piece-sets": {
    heading: { in: "Kurta sets with dupatta", uk: "Kurta sets and salwar suits in the UK" },
    intro: {
      in: ["Our 3 piece sets pair a kurta with matching pants and a dupatta, ready to wear for festive days, office and everyday. Choose silk and tissue for celebrations, cotton and linen for comfort."],
      uk: ["Our 3 piece kurta sets and salwar suits pair a kurta with matching pants and a dupatta, ready to wear for Eid, Diwali, weddings and everyday. Sizes run from UK 6 to UK 16; see the size guide on each product."],
    },
  },
  "one-piece": {
    heading: { in: "One piece ethnic dresses", uk: "Indian one piece dresses and gowns" },
    intro: {
      in: ["Anarkali gowns, long kurtis and flared ethnic dresses: one piece, easy to wear and made for parties and festivals."],
      uk: ["Anarkali gowns, long kurtis and flared ethnic dresses, delivered across the UK. One piece and easy to wear for weddings, Diwali and Eid parties."],
    },
  },
  jewellery: {
    heading: { in: "Jewellery to finish the look", uk: "Indian jewellery in the UK" },
    intro: {
      in: ["Temple jewellery, kundan sets and jhumkas chosen to sit well with silk sarees, half sarees and lehengas."],
      uk: ["Temple jewellery, kundan sets and jhumkas chosen to match silk sarees and lehengas, delivered across the UK."],
    },
  },
  bridal: {
    heading: { in: "Bridal sarees and wedding outfits", uk: "Indian bridal wear in the UK" },
    intro: {
      in: ["Kanjeevaram and Banarasi bridal silks, reception sarees and outfits for every ceremony. Book a free video consult and our stylists will show you pieces live and help plan the trousseau."],
      uk: ["Bridal silks, reception sarees and wedding guest outfits, shipped from India to the UK with duties included. Book a free video consult to see pieces live before you choose."],
    },
  },
};

/** Delivery, returns and payment questions every listing shares, with this region's real numbers. */
function commonFaqs(r: Region): { q: string; a: string }[] {
  const c = REGION_CONFIG[r];
  const f = (n: number) => formatMoney(n, r);
  if (r === "uk") {
    return [
      { q: "Do you deliver to the UK?", a: `Yes. We deliver across the UK in ${c.eta[0]}–${c.eta[1]} working days. Delivery is free on orders over ${f(c.freeShippingAt)}, otherwise ${f(c.shippingFee)}.` },
      { q: "Will I pay customs or import duty?", a: "No. Duties and VAT are included in our UK prices, so there is nothing extra to pay when your parcel arrives." },
      { q: "Can I return or exchange?", a: `Yes, within ${c.returnsDays} days of delivery for unworn pieces with tags. Start a return from your account or the order page.` },
      { q: "How do I choose my size?", a: "Each sized piece lists UK 6 to UK 16 with the matching Indian size, and the size guide gives bust, waist and hip measurements. Our stylists can help on WhatsApp." },
    ];
  }
  return [
    { q: "How long does delivery take in India?", a: `Orders reach most pincodes in ${c.eta[0]}–${c.eta[1]} working days. Delivery is free above ${f(c.freeShippingAt)}, otherwise ${f(c.shippingFee)}.` },
    { q: "Is cash on delivery available?", a: `Yes, cash on delivery is available across India (${f(c.codFee)} handling fee). You can also pay by UPI, cards or net banking.` },
    { q: "What is your return policy?", a: `You can return or exchange unworn pieces with tags within ${c.returnsDays} days of delivery. Start a return from your account or the order page.` },
    { q: "Do you ship outside India?", a: "Yes, we deliver to the UK with duties included. Switch the currency to £ at the top of the page to see UK prices." },
  ];
}

export function categoryContent(slug: string, name: string, region: Region): CategoryContent {
  const c = COPY[slug];
  const where = region === "uk" ? "in the UK" : "in India";
  return {
    heading: c?.heading[region] ?? `Shop ${name.toLowerCase()} ${where}`,
    intro: c?.intro[region] ?? [`Explore ${name.toLowerCase()} at House of Muddhugumma, chosen for fabric, finish and fit, and delivered ${where === "in the UK" ? "across the UK with duties included" : "across India"}.`],
    faqs: [...(c?.faqs?.(region) ?? []), ...commonFaqs(region)],
  };
}
