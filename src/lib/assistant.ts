import "server-only";
import { db } from "./db";
import { Coupon } from "./models";
import { listProducts } from "./queries";
import { getActiveSales } from "./sales";
import { effectivePrice } from "./pricing";
import { getSettings } from "./settings";
import { findTrackableOrder } from "./tracking";
import { REGION_CONFIG, formatMoney, type Region } from "./region";
import { understand, ORDER_NUMBER, parseMeasurements, type Intent } from "./assistant-intents";
import { fitFromBody, bothLabels, toInches } from "@/components/product/size-fit";
import { fmtTrackDay } from "./shipping";

/*
 * Free shopping assistant: rule-based answers built from the store's own data (no AI service).
 * Multi-step flows (order tracking, size) keep a small state object that the browser sends back each turn.
 */

export type BotAction = { label: string; send?: string; href?: string; external?: boolean };
export type BotProduct = { slug: string; name: string; image: string; price: string; mrp?: string; tag?: string };
export type BotMessage = { text: string; products?: BotProduct[]; actions?: BotAction[]; form?: "handoff" };
export type BotState = { awaiting?: "order_number" | "order_contact" | "bust"; orderNumber?: string };
export type BotRequest = { text?: string; state?: BotState };
export type BotResponse = { messages: BotMessage[]; state: BotState };

const STATUS_TEXT: Record<string, string> = {
  placed: "We've received it and are checking it",
  confirmed: "Confirmed, and being prepared in our studio",
  packed: "Packed and waiting for the courier",
  shipped: "On its way",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

function menu(region: Region): BotAction[] {
  return [
    { label: "Track my order", send: "#track" },
    { label: "Find my size", send: "#size" },
    { label: region === "uk" ? "Delivery & duties" : "Delivery & COD", send: "#delivery" },
    { label: "Returns & exchanges", send: "#returns" },
    { label: "Help me find a piece", send: "#shop" },
    { label: "Talk to a person", send: "#human" },
  ];
}

async function humanHandoff(region: Region, lead = "Happy to connect you with our team."): Promise<BotMessage> {
  const s = await getSettings();
  const wa = region === "uk" ? s.whatsappUk || s.whatsappIn : s.whatsappIn || s.whatsappUk;
  const hours = s.supportHours || (region === "uk" ? "Mon–Sat, 9am–5pm UK time" : "Mon–Sat, 10am–7pm IST");
  const actions: BotAction[] = [];
  if (wa) actions.push({ label: "Chat on WhatsApp", href: `https://wa.me/${wa.replace(/\D/g, "")}?text=${encodeURIComponent("Hi House of Muddhugumma, I have a question: ")}`, external: true });
  actions.push({ label: "Book a video consult", href: "/consult" }, { label: "Contact page", href: "/contact" });
  return {
    text: `${lead} ${wa ? "WhatsApp is quickest" : "Leave us a message here"} (${hours}), or email ${s.supportEmail}. We reply within one working day.`,
    actions,
    form: "handoff",
  };
}

const COLOURS = /\b(red|maroon|pink|green|blue|ivory|white|black|yellow|orange|purple|gold|magenta|mustard|teal|peach|beige|cream)\b/g;

async function productSearch(q: string, region: Region): Promise<BotMessage | null> {
  const [first, sales] = await Promise.all([listProducts({ slug: "all", q, sort: "relevance" }, region), getActiveSales()]);
  let res = first;
  let lead = "";
  // "red silk saree" with no red ones in stock: show the closest pieces in other colours rather than nothing.
  const colour = q.toLowerCase().match(COLOURS)?.[0];
  const loose = colour ? q.toLowerCase().replace(COLOURS, " ").replace(/\s+/g, " ").trim() : "";
  if (!res.items.length && loose) {
    res = await listProducts({ slug: "all", q: loose, sort: "relevance" }, region);
    lead = `Nothing in ${colour} right now, but these are close. `;
    q = loose;
  }
  if (!res.items.length) return null;
  const products: BotProduct[] = res.items.slice(0, 4).map((p) => {
    const m = effectivePrice(p, region, sales);
    return { slug: p.slug, name: p.name, image: p.images[0] ?? "", price: formatMoney(m.now, region), mrp: m.mrp > m.now ? formatMoney(m.mrp, region) : undefined, tag: m.sale ? `${m.sale.name} −${m.sale.percentOff}%` : p.tag || undefined };
  });
  const more = res.total > products.length;
  return {
    text: lead + (res.total === 1 ? "I found one piece that matches:" : `Here ${more ? `are the top ${products.length} of ${res.total}` : `are ${products.length}`} pieces that match:`),
    products,
    actions: [{ label: more ? `See all ${res.total}` : "Open search", href: `/search?q=${encodeURIComponent(q)}` }, { label: "Something else", send: "#shop" }],
  };
}

async function answer(intent: Intent, text: string, region: Region, state: BotState): Promise<BotResponse> {
  const r = REGION_CONFIG[region];
  const s = await getSettings();
  const out = (messages: BotMessage[], next: BotState = {}): BotResponse => ({ messages, state: next });

  switch (intent) {
    case "greet":
      return out([{ text: "Hi! I'm the Muddhugumma assistant. I can track an order, help with sizes, delivery and returns, or find you a piece. What can I do for you?", actions: menu(region) }]);

    case "thanks":
      return out([{ text: "You're welcome! Anything else?", actions: menu(region).slice(0, 4) }]);

    case "track": {
      const num = text.match(ORDER_NUMBER)?.[1]?.toUpperCase() ?? state.orderNumber;
      if (!num) return out([{ text: "Sure. What's your order number? It starts with MG and is in your confirmation email (for example MG261009AB12)." }], { awaiting: "order_number" });
      return out([{ text: `Thanks. To keep your order private, what email or phone number did you use for ${num}?` }], { awaiting: "order_contact", orderNumber: num });
    }

    case "delivery": {
      const [a, b] = r.eta;
      const lines =
        region === "uk"
          ? [
              `We ship from our Hyderabad studio and deliver to the UK in ${a}–${b} working days after dispatch.`,
              `Delivery is free over ${formatMoney(r.freeShippingAt, region)}, otherwise ${formatMoney(r.shippingFee, region)}.`,
              "Duties and VAT are already included in our prices, so there's nothing to pay at the door.",
            ]
          : [
              `We deliver across India in ${a}–${b} working days after dispatch.`,
              `Delivery is free over ${formatMoney(r.freeShippingAt, region)}, otherwise ${formatMoney(r.shippingFee, region)}.`,
              `Cash on delivery is available for a ${formatMoney(r.codFee, region)} fee${s.codOtpRequired ? " (we confirm COD orders with a quick OTP)" : ""}, or pay just ${formatMoney(s.partialCodAdvance, "in")} now and the rest at the door.`,
            ];
      return out([{ text: lines.join(" "), actions: [{ label: "Track my order", send: "#track" }, { label: "Shipping details", href: "/help/shipping" }] }]);
    }

    case "returns":
      return out([
        {
          text: `You can return or exchange within ${r.returnsDays} days of delivery: ${region === "uk" ? "we email a prepaid UK returns label" : "we arrange a free pickup from your address"}. Pieces must be unworn with tags. Stitched blouses, sarees with fall & pico added, and made-to-order bridal pieces can't be returned. Start a return from My orders.`,
          actions: [{ label: "My orders", href: "/account/orders" }, { label: "Returns policy", href: "/help/returns" }, { label: "Talk to a person", send: "#human" }],
        },
      ]);

    case "size": {
      const m = parseMeasurements(text);
      if (m?.bust || m?.waist || m?.hip) {
        const conv = (v?: number) => (v ? toInches(v, m.unit) : undefined);
        const fit = fitFromBody({ bust: conv(m.bust), waist: conv(m.waist), hip: conv(m.hip) }, region);
        if (fit) {
          return out([
            {
              text: fit.beyond
                ? `Your measurements are above our largest ready size. Our tailors can make kurta sets and lehenga blouses to measure. Let's get you to a stylist.`
                : `I'd suggest ${bothLabels(fit.index, region)}, based on your ${fit.decidedBy}. Kurta sets have about 1.5 inches of seam allowance, so they can be eased out a little. Sarees are free size.`,
              actions: fit.beyond ? [{ label: "Book a video consult", href: "/consult" }] : [{ label: "Size guide", href: "/help/size-guide" }, { label: "Shop kurta sets", href: "/c/kurta-sets" }],
            },
          ]);
        }
      }
      return out(
        [
          {
            text: "Sarees are free size (5.5 m plus a blouse piece we can stitch to your measurements). For kurta sets and lehengas, tell me your bust measurement, for example \"bust 36\" or \"91 cm\", and I'll suggest a size.",
            actions: [{ label: "Size guide", href: "/help/size-guide" }],
          },
        ],
        { awaiting: "bust" }
      );
    }

    case "payment": {
      const extra =
        region === "uk"
          ? "Pay by card, Apple Pay or Google Pay, or split it into 3 interest-free payments."
          : `Pay by UPI, cards or net banking (save ${s.prepaidDiscountPct}% when you pay online), choose no-cost EMI on orders over ₹3,000, or pay cash on delivery.`;
      return out([{ text: `${extra} Gift cards can be used at checkout too.`, actions: [{ label: "Buy a gift card", href: "/gift-cards" }, { label: "Delivery & COD", send: "#delivery" }] }]);
    }

    case "offers": {
      await db();
      const now = new Date();
      const coupons = await Coupon.find({ active: true, regions: region, code: { $not: /^BDAY-/ }, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }, { code: 1, description: 1 })
        .limit(4)
        .lean<{ code: string; description?: string }[]>();
      const sales = (await getActiveSales()).filter((x) => x.regions.includes(region));
      const parts = [
        ...sales.map((x) => `${x.name}: ${x.percentOff}% off right now${x.banner ? ` (${x.banner})` : ""}.`),
        ...coupons.map((c) => `Code ${c.code}${c.description ? `: ${c.description}` : ""}.`),
      ];
      return out([
        {
          text: parts.length ? parts.join(" ") : "No codes are running at the moment, but our Sale section always has marked-down pieces.",
          actions: [{ label: "Shop the sale", href: "/c/sale" }, { label: "Join for 10% off", href: "/#newsletter" }],
        },
      ]);
    }

    case "bridal":
      return out([
        {
          text: "For bridal and trousseau shopping, book a free 30-minute video consult. A stylist will show you lehengas and silks up close, check colours in daylight and plan blouse stitching with you.",
          actions: [{ label: "Book a video consult", href: "/consult" }, { label: "Shop bridal", href: "/c/bridal" }],
        },
      ]);

    case "care":
      return out([
        {
          text: "Silks, tissue, velvet and zari work: dry clean only, and store folded in muslin, refolding every few months. Cotton, mulmul and block prints: hand wash separately in cold water and dry in shade. Each product page lists its exact care.",
          actions: [{ label: "Help me find a piece", send: "#shop" }],
        },
      ]);

    case "human":
      return out([await humanHandoff(region)]);

    case "shop": {
      const found = text && !text.startsWith("#") ? await productSearch(text, region) : null;
      if (found) return out([found]);
      return out([
        {
          text: text && !text.startsWith("#") ? "I couldn't find an exact match. Try a colour, fabric or budget, for example:" : "Tell me what you have in mind: colour, fabric, occasion or budget. For example:",
          actions: [
            { label: "Silk sarees for a wedding", send: "silk saree wedding" },
            { label: region === "uk" ? "Cotton sarees under £35" : "Cotton sarees under ₹3,000", send: region === "uk" ? "cotton saree under £35" : "cotton saree under 3000" },
            { label: "Kurta sets for office", send: "kurta set office" },
            { label: "Bridal lehengas", send: "bridal lehenga" },
          ],
        },
      ]);
    }

    default: {
      const found = await productSearch(text, region);
      if (found) return out([found]);
      return out([{ text: "Sorry, I didn't quite get that. Here's what I can help with, or you can ask our team directly:", actions: menu(region) }]);
    }
  }
}

const SHORTCUTS: Record<string, Intent> = {
  "#track": "track",
  "#size": "size",
  "#delivery": "delivery",
  "#returns": "returns",
  "#shop": "shop",
  "#human": "human",
  "#menu": "greet",
};

export async function assistantReply(req: BotRequest, region: Region): Promise<BotResponse> {
  const text = String(req.text ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  const state: BotState = req.state ?? {};
  if (!text) return answer("greet", "", region, {});

  const shortcut = SHORTCUTS[text.toLowerCase()];
  if (shortcut) return answer(shortcut, text, region, {});

  // Multi-step flows: the previous turn asked for something specific.
  if (state.awaiting === "order_number") {
    const num = text.match(ORDER_NUMBER)?.[1]?.toUpperCase();
    if (num) return answer("track", num, region, {});
    if (understand(text).intent === "unknown") {
      return { messages: [{ text: "That doesn't look like an order number. It starts with MG, for example MG261009AB12. You'll find it in your confirmation email.", actions: [{ label: "Talk to a person", send: "#human" }] }], state };
    }
  }
  // An email or phone number is always the answer we asked for, even if it contains a word like "someone".
  const looksLikeContact = /\S+@\S+\.\S+/.test(text) || text.replace(/\D/g, "").length >= 7;
  if (state.awaiting === "order_contact" && state.orderNumber && (looksLikeContact || understand(text).intent !== "human")) {
    const o = await findTrackableOrder(state.orderNumber, text);
    if (!o) {
      return {
        messages: [
          {
            text: `I couldn't match that to order ${state.orderNumber}. Please use the same email or phone number you gave at checkout, or check the order number.`,
            actions: [{ label: "Try another order number", send: "#track" }, { label: "Talk to a person", send: "#human" }],
          },
        ],
        state,
      };
    }
    const sh = o.shipment;
    const eta = sh?.expectedBy && o.status !== "delivered" ? ` Expected by ${fmtTrackDay(sh.expectedBy, o.region)}.` : "";
    const latest = sh?.events[0] ? ` Latest update: ${sh.events[0].customerLabel}${sh.events[0].location ? `, ${sh.events[0].location}` : ""}.` : "";
    const courier = sh ? ` Courier: ${sh.courierName}, tracking number ${sh.awb}.` : "";
    const actions: BotAction[] = [{ label: "Full tracking", href: `/track?order=${encodeURIComponent(o.number)}` }];
    if (sh?.trackingUrl) actions.push({ label: `Track on ${sh.courierName}`, href: sh.trackingUrl, external: true });
    actions.push({ label: "Something else", send: "#menu" });
    return {
      messages: [{ text: `Order ${o.number}: ${STATUS_TEXT[o.status] ?? o.status}.${courier}${latest}${eta}`, actions }],
      state: {},
    };
  }
  if (state.awaiting === "bust") {
    const m = parseMeasurements(text);
    if (m) return answer("size", text, region, {});
  }

  return answer(understand(text).intent, text, region, {});
}
