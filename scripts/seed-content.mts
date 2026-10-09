// Seeds editorial content: 3 lookbooks, 2 shop-the-look bundles, 2 journal posts and one example Sale (inactive).
// Inserts only what is missing (matched by slug, or by name for the sale); never changes or deletes existing documents.
// Usage: node --env-file=.env.local --conditions=react-server --import tsx scripts/seed-content.mts
import mongoose from "mongoose";
import { db } from "../src/lib/db.ts";
import { Bundle, Lookbook, Post, Product, Sale } from "../src/lib/models.ts";

await db();

const existing = new Set((await Product.find({}, { slug: 1 }).lean()).map((p) => p.slug));
const only = (slugs: string[]) => slugs.filter((s) => existing.has(s));

const LOOKBOOKS = [
  {
    slug: "diwali-2026",
    title: "Diwali, at home and away",
    festival: "Diwali 2026",
    hero: "products/hero-tissue-kurta.webp",
    sort: 1,
    intro:
      "Lakshmi puja in the morning, cards and mithai with the cousins at night, and a Diwali party in Leicester or Wembley the weekend after. This edit covers all of it: tissue and zari that catch diya light, silks that feel like an occasion, and one easy cotton set for the long day of cooking before.\nOrdering for the UK? Our Diwali delivery cut-off is 20 October. In India, order by 25 October for delivery before the festival.",
    productSlugs: [
      "plum-tissue-kurta-set-zari-dupatta",
      "magenta-raw-silk-temple-border-saree",
      "sunset-kanchipuram-silk-saree",
      "royal-blue-velvet-border-saree",
      "bottle-green-banarasi-silk-saree",
      "rose-garden-cotton-suit-dupatta",
    ],
  },
  {
    slug: "onam-ivory-and-gold",
    title: "Onam: ivory, gold and one bright border",
    festival: "Onam",
    hero: "products/ivory-leaf-saree.webp",
    sort: 2,
    intro:
      "Onam dressing starts with cream and gold, so we began there: hand-painted linen for the pookalam morning and a Kanchipuram silk with a gold butta body for the sadya. If you want colour, let it come from the border, the blouse or a string of jasmine.\nWe do not stock kasavu yet. These are the pieces from our looms that sit closest to it.",
    productSlugs: ["ivory-leaf-print-linen-saree", "sunset-kanchipuram-silk-saree", "magenta-raw-silk-temple-border-saree", "ivory-gota-embroidered-lehenga", "sage-dabu-mulmul-saree"],
  },
  {
    slug: "wedding-guest",
    title: "The wedding guest edit",
    festival: "Wedding season",
    hero: "products/kanchi-peacock.webp",
    sort: 3,
    intro:
      "Dressing for someone else's wedding means looking like you made an effort without competing with the bride. Rich jewel tones for the ceremony, something you can dance in for the sangeet, and a lighter option for the mehendi.\nWe have left out the reds and maroons on purpose: at most Indian weddings those belong to the bride.",
    productSlugs: [
      "peacock-kanjeevaram-silk-saree",
      "bottle-green-banarasi-silk-saree",
      "plum-tissue-kurta-set-zari-dupatta",
      "royal-blue-velvet-border-saree",
      "ivory-gota-embroidered-lehenga",
      "rani-pink-silk-bridal-lehenga",
    ],
  },
];

const BUNDLES = [
  {
    slug: "two-festive-evenings",
    name: "Two festive evenings, sorted",
    description:
      "A plum tissue kurta set with a zari dupatta for Lakshmi puja, and a magenta raw-silk saree with a temple border for the family dinner. Different enough that nobody sees you in the same thing twice, close enough in tone to share one set of jewellery.",
    image: "products/hero-tissue-kurta.webp",
    productSlugs: ["plum-tissue-kurta-set-zari-dupatta", "magenta-raw-silk-temple-border-saree"],
  },
  {
    slug: "cotton-office-week",
    name: "The cotton office week",
    description:
      "Three breathable pieces that cover a working week: a block-print kurta set for Monday, chikankari for the client meeting, and a dabu mulmul saree for Friday. All machine-washable on a gentle cycle, all fine on a crowded commute.",
    image: "products/kurta-mint-chikankari.webp",
    productSlugs: ["blush-block-print-cotton-kurta-set", "mint-chikankari-georgette-kurta", "sage-dabu-mulmul-saree"],
  },
];

const POSTS = [
  {
    slug: "how-to-drape-a-kanjeevaram-saree",
    title: "How to drape a Kanjeevaram saree",
    excerpt: "Heavy silk behaves differently from cotton. Here is the step-by-step nivi drape we teach in our studio, with the tricks that keep pleats crisp all evening.",
    cover: "products/kanchi-sunset.webp",
    tags: ["Drape guide", "Kanjeevaram", "Saree care"],
    author: "The styling team",
    publishedAt: new Date("2026-10-01T09:00:00+05:30"),
    body: `A Kanjeevaram is woven from mulberry silk with a heavy zari border, so it is stiffer and heavier than a cotton or georgette saree. That works in your favour: pleats hold their shape once they are set. The trick is setting them properly.

## Before you start

- **Wear the petticoat and blouse first.** Match the petticoat to the body colour of the saree, not the border, and tie it firmly at your natural waist.
- **Put your shoes on.** The hem should just skim the floor in the heels you will wear. Drape in flats and you will trip over it later.
- **Have 4 to 6 safety pins ready**, plus one small brooch if you like a neat shoulder.
- **Pre-pleat the pallu the night before** if you are short on time. Fold it into 5 or 6 pleats, pin at the top, and lay it flat under something heavy.

## The nivi drape, step by step

1. Start with the plain end (the end without the pallu). Tuck the top edge into the petticoat at your right hip and wrap it once around your waist, right to left, keeping the bottom edge level with the floor.
2. Bring the saree round to the front again and make the pleats: 5 to 7 pleats, each about 5 inches (12 to 13 cm) wide. With silk, fewer and wider pleats sit better than many narrow ones.
3. Hold the pleats together, check the bottom edges line up, and tuck them in just left of your navel, facing left. Pin them at the top on the inside so they cannot slip.
4. Take the remaining length round your back once more, bring it up under your right arm and over your left shoulder. This is the pallu.
5. Pleat the pallu (or use your pre-pleated one) and let it fall to about the back of your knee. Pin it to the blouse at the shoulder from underneath.
6. Gently pull the fall of the saree at the back so it hugs your hips, then smooth the front pleats downwards with your palm.

> If the pleats keep opening, run a cool iron over them through a cotton cloth before you tuck them in. Never iron zari directly.

## Keeping it looking new

- **Dry clean only for the first wash.** After that, a gentle hand wash in cold water with a mild shampoo is fine for most of our silks; see the care note on each product.
- **No perfume on the zari.** Spray before you dress. Alcohol tarnishes metallic thread.
- **Store it in muslin, not plastic,** and refold along different lines every few months so the zari does not crack at the creases.
- **Air it after wearing** for an hour before folding, especially after a long, warm evening.

Want one already finished? Choose *Fall & pico done for you* on any saree page and we will edge it before it ships. Browse our [Kanjeevaram and Banarasi silks](/c/sarees?fabric=Silk), or book a free video styling call through our [contact page](/help/contact) and we will drape it with you on camera.`,
  },
  {
    slug: "what-to-wear-as-a-wedding-guest-in-the-uk",
    title: "What to wear as a wedding guest in the UK",
    excerpt: "From a Leicester sangeet to a registry-office reception in October drizzle: how to choose colours, fabrics and shoes, and when to order so it arrives in time.",
    cover: "products/kanchi-peacock.webp",
    tags: ["Wedding guest", "UK", "Styling"],
    author: "The styling team",
    publishedAt: new Date("2026-10-06T09:00:00+01:00"),
    body: `An Indian wedding in the UK is usually three or four events over a weekend, in venues that range from a temple hall to a hotel ballroom to a marquee in a field. Here is how we would plan an outfit for each.

## Read the invitation first

Most families list the events. As a rough guide:

- **Mehendi and haldi:** daytime, relaxed, often messy. Cotton, linen or a light kurta set. Yellows, greens and pastels are traditional.
- **Sangeet or garba:** evening, lots of dancing. Choose something that moves: georgette, tissue, a lehenga with a skirt you can spin in.
- **Ceremony:** the dressiest daytime look. A silk saree or a heavier kurta set with a zari dupatta.
- **Reception:** evening glamour. Velvet borders, jewel tones, your best jewellery.

## Colours to think twice about

- **Red and maroon** are usually the bride's colours. Unless the family has said otherwise, pick something else.
- **All black or all white** are avoided at many Hindu and Sikh weddings, though customs vary by community. If in doubt, ask the person who invited you.
- **Jewel tones are always safe:** peacock blue, bottle green, plum and rani pink all photograph beautifully.

## Dress for British weather

An October wedding in the Midlands can be 12°C and raining between the car park and the door.

- Bring a **pashmina or a dupatta you can wrap** over your shoulders. A velvet-bordered saree is warmer than it looks.
- Marquees on grass mean **block heels or embellished flats**, not stilettos.
- Venues are often heated to tropical levels inside, so layers you can take off beat a thick fabric you are stuck in all night.

## Order early

- **UK delivery takes 5 to 7 working days** from our studio in Hyderabad, tracked, with duties and VAT already paid. Nothing to pay at the door.
- A **blouse stitched to your measurements** adds about a week, so for a stitched blouse, order at least three weeks before the first event.
- Check your size with our [size guide](/help/size-guide) or the *Find my size* button on any kurta set or lehenga.

Not sure where to start? Our [wedding guest lookbook](/lookbook/wedding-guest) has the pieces our stylists would wear, and the [festive edit](/c/festive) has the rest.`,
  },
];

const SALE = {
  name: "Diwali Sale",
  banner: "20% off festive silks",
  percentOff: 20,
  categories: [] as string[],
  collections: ["festive"],
  slugs: [] as string[],
  regions: ["in", "uk"],
  startsAt: new Date("2026-10-30T00:00:00+05:30"),
  endsAt: new Date("2026-11-09T00:00:00+05:30"),
  active: false,
};

const report: string[] = [];
for (const l of LOOKBOOKS) {
  if (await Lookbook.exists({ slug: l.slug })) report.push(`lookbook ${l.slug}: exists, skipped`);
  else {
    await Lookbook.create({ ...l, productSlugs: only(l.productSlugs), active: true });
    report.push(`lookbook ${l.slug}: inserted (${only(l.productSlugs).length} products)`);
  }
}
for (const b of BUNDLES) {
  if (await Bundle.exists({ slug: b.slug })) report.push(`bundle ${b.slug}: exists, skipped`);
  else {
    // Bundle discounts are not applied at checkout yet, so the curated looks carry no discount.
    await Bundle.create({ ...b, productSlugs: only(b.productSlugs), discountPct: 0, active: true });
    report.push(`bundle ${b.slug}: inserted (${only(b.productSlugs).length} products)`);
  }
}
for (const p of POSTS) {
  if (await Post.exists({ slug: p.slug })) report.push(`post ${p.slug}: exists, skipped`);
  else {
    await Post.create({ ...p, status: "published" });
    report.push(`post ${p.slug}: inserted`);
  }
}
if (await Sale.exists({ name: SALE.name })) report.push(`sale "${SALE.name}": exists, skipped`);
else {
  await Sale.create(SALE);
  report.push(`sale "${SALE.name}": inserted (inactive example; switch on in the admin)`);
}

console.log(report.join("\n"));
await mongoose.disconnect();
