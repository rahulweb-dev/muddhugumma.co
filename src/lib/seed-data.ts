// Starter catalogue. Images are ImageKit paths; the same files live in public/img for local fallback.
type Seed = {
  slug: string; name: string; category: "sarees" | "kurta-sets" | "lehengas"; collections: string[];
  fabric: string; occasions: string[]; colour: string; hex: string; images: string[];
  price: { in: { now: number; mrp: number }; uk: { now: number; mrp: number } };
  freeSize?: boolean; tag?: string; origin: string; craft: string; description: string; details: string[]; care: string;
  rating: number; ratingCount: number;
};

const saree = (extra: string[] = []) => [
  "Saree length 5.5 m plus 0.8 m unstitched blouse piece",
  "Width 47 inches",
  ...extra,
];
// Stock is kept against the canonical (India) size; UK sizes map onto it via canonicalSize().
const sizesStock = (n = 8) => ({ XS: n, S: n, M: n, L: n, XL: n, XXL: n });

export const SEED_PRODUCTS: (Seed & { stock: Record<string, number> })[] = ([
  {
    slug: "magenta-raw-silk-temple-border-saree", name: "Magenta Raw Silk Temple-Border Saree", category: "sarees", collections: ["festive", "new"],
    fabric: "Raw silk", occasions: ["festive", "wedding"], colour: "pink", hex: "#C3168B", images: ["products/saree-magenta-silk.webp"],
    price: { in: { now: 6450, mrp: 8600 }, uk: { now: 72, mrp: 96 } }, freeSize: true, tag: "New",
    origin: "Kanchipuram, Tamil Nadu", craft: "Woven temple border with tissue pallu",
    description: "A jewel-bright raw silk drape with a black temple border and antique-gold tissue stripe. Light enough for an all-day puja, rich enough for a reception.",
    details: saree(["Black running blouse with zari border"]), care: "Dry clean only. Store folded in muslin.", rating: 4.8, ratingCount: 128,
  },
  {
    slug: "blush-block-print-cotton-kurta-set", name: "Blush Block-Print Cotton Kurta Set", category: "kurta-sets", collections: [],
    fabric: "Cotton", occasions: ["everyday", "office"], colour: "pink", hex: "#E9A9A3", images: ["products/kurta-pink-floral.webp"],
    price: { in: { now: 2199, mrp: 2999 }, uk: { now: 27, mrp: 36 } }, tag: "Bestseller",
    origin: "Bagru, Rajasthan", craft: "Hand block print with mirror buttons",
    description: "Straight-cut kurta with princess panels and a matching printed pant. Breathable cotton for long office days and summer weekends.",
    details: ["Kurta length 46 inches", "Three-quarter sleeves", "Pant with elasticated waist and side pocket"], care: "Gentle hand wash cold. Dry in shade.", rating: 4.6, ratingCount: 412,
  },
  {
    slug: "bottle-green-banarasi-silk-saree", name: "Bottle Green Banarasi Silk Saree", category: "sarees", collections: ["festive"],
    fabric: "Silk", occasions: ["wedding", "festive"], colour: "green", hex: "#1D5A3A", images: ["products/hero-banarasi-green.webp", "products/green-banarasi-2.webp"],
    price: { in: { now: 12499, mrp: 0 }, uk: { now: 139, mrp: 0 } }, freeSize: true, tag: "Handloom",
    origin: "Varanasi, Uttar Pradesh", craft: "Kadhua handloom zari brocade",
    description: "Woven on a pit loom over three weeks, with bandhani-style buttis across the body and a heavy floral zari pallu.",
    details: saree(["Silk Mark certified", "Contrast green blouse with zari sleeves"]), care: "Dry clean only. Refold every three months.", rating: 4.9, ratingCount: 86,
  },
  {
    slug: "mint-chikankari-georgette-kurta", name: "Mint Chikankari Georgette Kurta", category: "kurta-sets", collections: [],
    fabric: "Georgette", occasions: ["office", "everyday"], colour: "green", hex: "#DDEBDD", images: ["products/kurta-mint-chikankari.webp"],
    price: { in: { now: 3299, mrp: 0 }, uk: { now: 39, mrp: 0 } },
    origin: "Lucknow, Uttar Pradesh", craft: "Hand chikankari with matching dupatta",
    description: "All-over phool chikankari on soft georgette, with a slip and a chiffon dupatta. Easy elegance from office to dinner.",
    details: ["Includes kurta, slip and dupatta", "Sleeveless with square neck", "Kurta length 44 inches"], care: "Dry clean recommended.", rating: 4.7, ratingCount: 203,
  },
  {
    slug: "rani-pink-bagru-block-print-saree", name: "Rani Pink Bagru Block-Print Saree", category: "sarees", collections: [],
    fabric: "Cotton", occasions: ["everyday", "office"], colour: "pink", hex: "#D8457F", images: ["products/saree-pink-cotton.webp", "products/saree-pink-cotton-2.webp"],
    price: { in: { now: 1899, mrp: 2499 }, uk: { now: 24, mrp: 31 } }, freeSize: true,
    origin: "Bagru, Rajasthan", craft: "Natural-dye hand block print",
    description: "Soft mulmul printed by hand with carved teak blocks and natural dyes. The everyday saree you will reach for first.",
    details: saree(["Unstitched blouse piece in matching print"]), care: "Hand wash separately in cold water.", rating: 4.5, ratingCount: 318,
  },
  {
    slug: "plum-tissue-kurta-set-zari-dupatta", name: "Plum Tissue Kurta Set with Zari Dupatta", category: "kurta-sets", collections: ["festive"],
    fabric: "Tissue silk", occasions: ["festive", "wedding"], colour: "purple", hex: "#6E2450", images: ["products/hero-tissue-kurta.webp"],
    price: { in: { now: 7899, mrp: 0 }, uk: { now: 89, mrp: 0 } }, tag: "Festive",
    origin: "Varanasi, Uttar Pradesh", craft: "Gota and sequin border, tissue dupatta",
    description: "A-line tissue kurta with a gota-work hem, dhoti-style salwar and a woven Banarasi tissue dupatta finished with tassels.",
    details: ["Includes kurta, salwar and dupatta", "V-neck with embroidered yoke", "Kurta length 42 inches"], care: "Dry clean only.", rating: 4.8, ratingCount: 57,
  },
  {
    slug: "ivory-gota-embroidered-lehenga", name: "Ivory Gota Embroidered Lehenga", category: "lehengas", collections: ["bridal"],
    fabric: "Silk", occasions: ["wedding"], colour: "ivory", hex: "#F4EEE4", images: ["products/hero-ivory-lehenga.webp"],
    price: { in: { now: 24500, mrp: 0 }, uk: { now: 259, mrp: 0 } }, tag: "Limited",
    origin: "Jaipur, Rajasthan", craft: "Hand gota patti and resham embroidery",
    description: "Ivory silk lehenga with architectural gota motifs and a rani-pink bordered dupatta. Made for mehendi and sangeet.",
    details: ["Includes lehenga, blouse and dupatta", "Lehenga flare 4.5 m", "Blouse can be customised to measurements"], care: "Dry clean only.", rating: 4.9, ratingCount: 41,
  },
  {
    slug: "maroon-velvet-bridal-lehenga", name: "Maroon Velvet Bridal Lehenga", category: "lehengas", collections: ["bridal"],
    fabric: "Velvet", occasions: ["wedding"], colour: "red", hex: "#6B1426", images: ["products/bridal-velvet-lehenga.webp", "products/craft-zari-detail.webp"],
    price: { in: { now: 38900, mrp: 44900 }, uk: { now: 415, mrp: 479 } },
    origin: "Lucknow, Uttar Pradesh", craft: "Zardozi and dabka hand embroidery",
    description: "Deep maroon velvet with all-over zardozi jaal and a scalloped border. An heirloom piece for the wedding day.",
    details: ["Includes lehenga, jacket-style choli and net dupatta", "Lehenga flare 6 m", "Made to order in 4–5 weeks"], care: "Dry clean only. Store flat.", rating: 5, ratingCount: 23,
  },
  {
    slug: "peacock-kanjeevaram-silk-saree", name: "Peacock Kanjeevaram Silk Saree", category: "sarees", collections: ["festive"],
    fabric: "Silk", occasions: ["wedding", "festive"], colour: "blue", hex: "#2E4E7A", images: ["products/kanchi-peacock.webp"],
    price: { in: { now: 18900, mrp: 0 }, uk: { now: 199, mrp: 0 } }, freeSize: true, tag: "Pure zari",
    origin: "Kanchipuram, Tamil Nadu", craft: "Korvai contrast border, pure zari",
    description: "Peacock-blue body interlocked with a magenta korvai border, woven with silver zari dipped in gold.",
    details: saree(["Silk Mark certified", "Zari test certificate included"]), care: "Dry clean only. Wrap in cotton.", rating: 4.9, ratingCount: 64,
  },
  {
    slug: "sage-dabu-mulmul-saree", name: "Sage Dabu Mulmul Saree", category: "sarees", collections: ["new"],
    fabric: "Cotton", occasions: ["everyday", "office"], colour: "green", hex: "#9FB3A4", images: ["products/sage-dabu-saree.webp"],
    price: { in: { now: 2499, mrp: 0 }, uk: { now: 29, mrp: 0 } }, freeSize: true, tag: "New",
    origin: "Akola, Rajasthan", craft: "Dabu mud-resist hand block print",
    description: "Soft sage mulmul printed with indigo leaf motifs using the centuries-old dabu mud-resist technique.",
    details: saree(["Pairs with a black or white blouse"]), care: "Hand wash cold with mild soap.", rating: 4.6, ratingCount: 142,
  },
  {
    slug: "sunset-kanchipuram-silk-saree", name: "Sunset Kanchipuram Silk Saree", category: "sarees", collections: ["festive"],
    fabric: "Silk", occasions: ["wedding", "festive"], colour: "orange", hex: "#D9532B", images: ["products/kanchi-sunset.webp"],
    price: { in: { now: 15900, mrp: 18700 }, uk: { now: 169, mrp: 199 } }, freeSize: true,
    origin: "Kanchipuram, Tamil Nadu", craft: "Gold butta body with rich pallu",
    description: "Sunset orange shot with pink, scattered with gold buttas and finished with a broad mustard-gold border.",
    details: saree(["Silk Mark certified", "Contrast magenta blouse piece"]), care: "Dry clean only.", rating: 4.8, ratingCount: 77,
  },
  {
    slug: "rani-pink-silk-bridal-lehenga", name: "Rani Pink Silk Bridal Lehenga", category: "lehengas", collections: ["bridal", "new"],
    fabric: "Silk", occasions: ["wedding"], colour: "pink", hex: "#E0186B", images: ["products/pink-lehenga.webp"],
    price: { in: { now: 32500, mrp: 0 }, uk: { now: 349, mrp: 0 } }, tag: "New",
    origin: "Jaipur, Rajasthan", craft: "Zari kalidar with net dupatta",
    description: "Rani pink raw silk kalidar lehenga with zari booti panels and a sheer embroidered net dupatta.",
    details: ["Includes lehenga, blouse and dupatta", "16 kalis, 5 m flare", "Blouse can be customised"], care: "Dry clean only.", rating: 4.9, ratingCount: 18,
  },
  {
    slug: "ivory-leaf-print-linen-saree", name: "Ivory Leaf-Print Linen Saree", category: "sarees", collections: [],
    fabric: "Linen", occasions: ["everyday", "office"], colour: "ivory", hex: "#F2E9D2", images: ["products/ivory-leaf-saree.webp"],
    price: { in: { now: 2899, mrp: 3499 }, uk: { now: 34, mrp: 41 } }, freeSize: true,
    origin: "Bhagalpur, Bihar", craft: "Hand-painted leaf motifs",
    description: "Crisp ivory linen with hand-painted leaves in rose, saffron and green. Cool, light and made for summer.",
    details: saree(["Printed blouse piece"]), care: "Hand wash cold. Iron while damp.", rating: 4.5, ratingCount: 96,
  },
  {
    slug: "rose-garden-cotton-suit-dupatta", name: "Rose Garden Cotton Suit with Dupatta", category: "kurta-sets", collections: ["new"],
    fabric: "Cotton", occasions: ["everyday", "festive"], colour: "pink", hex: "#C94468", images: ["products/rose-floral-suit.webp"],
    price: { in: { now: 2799, mrp: 0 }, uk: { now: 33, mrp: 0 } }, tag: "New",
    origin: "Jaipur, Rajasthan", craft: "Floral print with lace-edged mulmul dupatta",
    description: "Pure cotton suit in a rose-garden print, with a lace-trimmed mulmul dupatta and straight pants.",
    details: ["Includes kurta, pant and dupatta", "V-neck with thread-work placket", "Kurta length 45 inches"], care: "Machine wash gentle, cold.", rating: 4.7, ratingCount: 156,
  },
  {
    slug: "royal-blue-velvet-border-saree", name: "Royal Blue Velvet-Border Saree", category: "sarees", collections: ["festive"],
    fabric: "Georgette", occasions: ["festive"], colour: "blue", hex: "#1E2C8C", images: ["products/blue-velvet-saree.webp"],
    price: { in: { now: 4999, mrp: 6499 }, uk: { now: 56, mrp: 72 } }, freeSize: true,
    origin: "Surat, Gujarat", craft: "Gold embroidered velvet border",
    description: "Fluid royal blue georgette with a wide velvet border embroidered in gold leaves. Drapes beautifully for parties.",
    details: saree(["Velvet blouse piece with embroidered sleeves"]), care: "Dry clean only.", rating: 4.4, ratingCount: 61,
  },
  {
    slug: "crimson-bridal-lehenga-set", name: "Crimson Bridal Lehenga Set", category: "lehengas", collections: ["bridal"],
    fabric: "Velvet", occasions: ["wedding"], colour: "red", hex: "#A3162C", images: ["products/bridal-red-portrait.webp"],
    price: { in: { now: 42900, mrp: 0 }, uk: { now: 459, mrp: 0 } }, tag: "Made to order",
    origin: "Amritsar, Punjab", craft: "Dabka, zardozi and stone work",
    description: "Classic crimson bridal lehenga with dense dabka floral work and a double dupatta. Made to your measurements.",
    details: ["Includes lehenga, blouse and two dupattas", "Made to measure in 5–6 weeks", "Free video fitting consult"], care: "Dry clean only. Store flat in a garment bag.", rating: 5, ratingCount: 12,
  },
] satisfies Seed[]).map((p) => ({ ...p, stock: p.freeSize ? { "Free size": 12 } : sizesStock() }));

export const SEED_COUPONS = [
  { code: "MUDDHU10", description: "10% off your first order", type: "percent", value: 10, regions: ["in", "uk"], minOrder: { in: 999, uk: 15 }, firstOrderOnly: true, active: true },
  { code: "FESTIVE15", description: "15% off festive orders above ₹7,999 / £90", type: "percent", value: 15, regions: ["in", "uk"], minOrder: { in: 7999, uk: 90 }, firstOrderOnly: false, active: true },
  { code: "WELCOMEUK", description: "£10 off UK orders over £60", type: "flat", value: 10, regions: ["uk"], minOrder: { in: 0, uk: 60 }, firstOrderOnly: false, active: true },
] as const;

export const SEED_REVIEWS = [
  { productSlug: "bottle-green-banarasi-silk-saree", name: "Ananya R.", city: "Bengaluru", rating: 5, title: "Heirloom quality", body: "The zari is soft and doesn't scratch. Wore it to my cousin's wedding and got asked about it all evening.", verified: true },
  { productSlug: "bottle-green-banarasi-silk-saree", name: "Priya S.", city: "Leicester", rating: 5, title: "Arrived in 6 days to the UK", body: "No customs charges as promised. Colour is exactly like the photos.", verified: true },
  { productSlug: "peacock-kanjeevaram-silk-saree", name: "Lakshmi V.", city: "Chennai", rating: 5, title: "Proper Kanchi silk", body: "Heavy, crisp and the korvai border is perfectly joined. Silk Mark tag was included.", verified: true },
  { productSlug: "blush-block-print-cotton-kurta-set", name: "Meera K.", city: "Pune", rating: 4, title: "Comfortable for work", body: "Fabric is lovely. Size M fits true; pant is slightly long for me at 5'2\".", verified: true },
  { productSlug: "rani-pink-bagru-block-print-saree", name: "Shreya D.", city: "London", rating: 5, title: "Everyday favourite", body: "Soft mulmul, colour stayed after three washes.", verified: true },
  { productSlug: "maroon-velvet-bridal-lehenga", name: "Fatima A.", city: "Hyderabad", rating: 5, title: "Dream bridal lehenga", body: "The video fitting call made it so easy. Embroidery is stunning in person.", verified: true },
];
