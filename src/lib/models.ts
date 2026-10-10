import mongoose, { Schema, type Model, type Types } from "mongoose";
import type { HomeSlide, HomeStory } from "./types";

// Schemas are built untyped and paired with the explicit interfaces below.
// (Mongoose's InferSchemaType on these nested schemas makes the TypeScript checker run out of memory.)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const schema = (def: Record<string, unknown>, opts?: Record<string, unknown>): Schema => new Schema(def as any, opts as any);

/* ---------- Product ---------- */
const money = { now: { type: Number, required: true }, mrp: { type: Number, default: 0 } };

const ProductSchema = schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    oldSlugs: { type: [String], default: [], index: true }, // previous URLs; /p/<old> 301-redirects (lib/product-slugs.ts)
    name: { type: String, required: true },
    category: { type: String, required: true, index: true }, // Category slug (managed in Admin → Categories)
    collections: { type: [String], default: [], index: true }, // bridal, festive, new
    fabric: { type: String, default: "" },
    occasions: { type: [String], default: [] },
    colour: { type: String, default: "" }, // colour family for the filter; "" when it doesn't apply (e.g. jewellery)
    hex: { type: String, default: "#cccccc" },
    images: { type: [String], default: [] }, // ImageKit paths, e.g. "products/kanchi-peacock.webp"
    price: { in: money, uk: money },
    freeSize: { type: Boolean, default: false },
    stock: { type: Map, of: Number, default: {} }, // India stock: size -> qty
    stockUk: { type: Map, of: Number, default: {} }, // UK stock: size -> qty (see lib/stock.ts)
    tag: { type: String, default: "" },
    origin: { type: String, default: "" },
    craft: { type: String, default: "" },
    description: { type: String, default: "" },
    details: { type: [String], default: [] },
    care: { type: String, default: "" },
    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    active: { type: Boolean, default: true, index: true },
    video: { type: String, default: "" }, // ImageKit path or https URL of a short drape video
    madeToOrder: { type: Boolean, default: false },
    costPrice: { type: Number, default: 0 }, // landed cost in INR, admin only
    supplierId: { type: String, default: "" },
    lookbooks: { type: [String], default: [] }, // lookbook slugs
    blouseOptions: { type: Boolean }, // offer blouse stitching + fall/pico at checkout; unset = sarees only
    legacyId: { type: String, index: true, sparse: true }, // id on the previous Base44 store, for old /product/<id> links
  },
  { timestamps: true }
);
ProductSchema.index({ name: "text", fabric: "text", colour: "text", craft: "text", origin: "text" });

/* ---------- User ---------- */
const AddressSchema = schema(
  {
    name: String,
    phone: String,
    line1: String,
    line2: String,
    city: String,
    state: String,
    postcode: String,
    region: { type: String, enum: ["in", "uk"] },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const UserSchema = schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: "" },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["customer", "admin", "manager", "packer", "stylist"], default: "customer" },
    storeLock: { type: String, enum: ["", "in", "uk"], default: "" }, // staff only: limit the admin to one country
    addresses: { type: [AddressSchema], default: [] },
    wishlist: { type: [String], default: [] }, // product slugs
    birthday: { type: String, default: "" }, // "MM-DD"
    marketingOptIn: { type: Boolean, default: false },
    whatsappOptIn: { type: Boolean, default: false },
    loyaltyPoints: { type: Number, default: 0 },
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: String, default: "" }, // referral code used at sign-up
    measurements: { bust: Number, waist: Number, hip: Number, height: Number, usualSize: String, brandSizes: { type: Map, of: String } },
    cart: { type: [{ slug: String, size: String, qty: Number, options: { blouse: String, fallPico: Boolean } }], default: [] },
    cartUpdatedAt: Date,
    cartRemindedAt: Date,
    lastBirthdayOfferYear: Number,
  },
  { timestamps: true }
);
UserSchema.index({ role: 1, createdAt: -1 }); // staff list and customer list

/* ---------- Order ---------- */
const OrderItemSchema = schema(
  {
    productId: String,
    slug: String,
    name: String,
    image: String,
    size: String,
    qty: Number,
    unitPrice: Number,
    options: { blouse: String, fallPico: Boolean },
    optionsPrice: { type: Number, default: 0 },
    // Made-to-order blouse stitching workflow (only when options.blouse === "stitched" or the product is made to order)
    stitching: {
      status: { type: String, enum: ["measurements_needed", "measurements_received", "cutting", "stitching", "qc", "ready"] },
      measurements: { type: Map, of: String },
      tailor: String,
      notes: String,
      updatedAt: Date,
    },
  },
  { _id: false }
);

/* Shipment: filled by the admin today (provider "manual"); Shiprocket will fill the same fields later. */
const TrackingEventSchema = schema(
  {
    code: { type: String, required: true }, // see TRACKING_EVENTS in src/lib/shipping.ts
    label: String,
    location: { type: String, default: "" },
    at: { type: Date, required: true },
    note: { type: String, default: "" },
    source: { type: String, enum: ["admin", "shiprocket"], default: "admin" },
  },
  { _id: true }
);

const ShipmentSchema = schema(
  {
    provider: { type: String, enum: ["manual", "shiprocket"], default: "manual" },
    courier: String, // courier id from COURIERS in src/lib/shipping.ts
    awb: { type: String, default: "" }, // tracking number / AWB
    trackingUrl: { type: String, default: "" },
    providerRef: { type: String, default: "" }, // e.g. Shiprocket shipment id
    shippedAt: Date,
    expectedBy: Date,
    deliveredAt: Date,
    events: { type: [TrackingEventSchema], default: [] },
  },
  { _id: false }
);

const OrderSchema = schema(
  {
    number: { type: String, required: true, unique: true },
    userId: { type: String, index: true },
    email: { type: String, required: true },
    region: { type: String, enum: ["in", "uk"], required: true },
    currency: { type: String, required: true },
    items: { type: [OrderItemSchema], default: [] },
    address: { type: AddressSchema, required: true },
    subtotal: Number,
    discount: { type: Number, default: 0 },
    coupon: { type: String, default: "" },
    shipping: Number,
    codFee: { type: Number, default: 0 },
    total: Number,
    payment: {
      method: { type: String, enum: ["cod", "cashfree", "razorpay", "stripe", "test", "giftcard"], required: true },
      status: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
      ref: { type: String, default: "" },
    },
    status: {
      type: String,
      enum: ["placed", "confirmed", "packed", "shipped", "delivered", "cancelled", "returned"],
      default: "placed",
      index: true,
    },
    history: { type: [{ status: String, at: Date, note: String }], default: [] },
    shipment: { type: ShipmentSchema, default: undefined },
    gift: { wrap: { type: Boolean, default: false }, message: { type: String, default: "" }, fee: { type: Number, default: 0 } },
    prepaidDiscount: { type: Number, default: 0 },
    loyalty: { redeemedPoints: { type: Number, default: 0 }, discount: { type: Number, default: 0 }, earnedPoints: { type: Number, default: 0 }, awarded: { type: Boolean, default: false } },
    giftCard: { code: { type: String, default: "" }, amount: { type: Number, default: 0 } },
    referralCode: { type: String, default: "" },
    partialCod: { paidOnline: { type: Number, default: 0 }, dueOnDelivery: { type: Number, default: 0 } },
    codVerified: { type: Boolean, default: false },
    reviewRequestedAt: Date, // review-requests job: when we asked the customer to review this order
    invoiceNumber: { type: String, default: "" },
    notifications: { type: [String], default: [] }, // keys of customer messages already sent, e.g. "placed", "shipped"
  },
  { timestamps: true }
);
OrderSchema.index({ "shipment.awb": 1 }, { sparse: true });
// Admin lists, dashboard figures, reports, customer profiles and review checks (keep queries fast as orders grow).
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ region: 1, status: 1, createdAt: -1 });
OrderSchema.index({ email: 1, createdAt: -1 });
OrderSchema.index({ "items.slug": 1 });

/* ---------- Coupon ---------- */
const CouponSchema = schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    description: String,
    type: { type: String, enum: ["percent", "flat"], default: "percent" },
    value: Number, // percent, or flat amount in the region's currency
    regions: { type: [String], default: ["in", "uk"] },
    minOrder: { in: { type: Number, default: 0 }, uk: { type: Number, default: 0 } },
    firstOrderOnly: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    expiresAt: Date,
  },
  { timestamps: true }
);

/* ---------- Review ---------- */
const ReviewSchema = schema(
  {
    productSlug: { type: String, required: true, index: true },
    userId: String,
    name: String,
    rating: { type: Number, min: 1, max: 5, required: true },
    title: String,
    body: String,
    city: String,
    verified: { type: Boolean, default: false },
    images: { type: [String], default: [] },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "approved", index: true },
  },
  { timestamps: true }
);

/* ---------- Newsletter ---------- */
const SubscriberSchema = schema({ email: { type: String, unique: true, lowercase: true }, region: String }, { timestamps: true });

/* ---------- Store settings (single document, key "store") ---------- */
const SettingsSchema = schema(
  {
    key: { type: String, required: true, unique: true, default: "store" },
    legalName: { type: String, default: "House of Muddhugumma" },
    gstin: { type: String, default: "" },
    stateCode: { type: String, default: "36" }, // Telangana
    address: { type: String, default: "Jubilee Hills, Hyderabad, Telangana 500033, India" },
    ukVatNumber: { type: String, default: "" },
    supportEmail: { type: String, default: "care@muddhugumma.com" },
    whatsappIn: { type: String, default: "" },
    whatsappUk: { type: String, default: "" },
    prepaidDiscountPct: { type: Number, default: 5 },
    partialCodAdvance: { type: Number, default: 200 }, // INR paid online for part-COD orders
    codOtpRequired: { type: Boolean, default: true },
    giftWrapFee: { in: { type: Number, default: 99 }, uk: { type: Number, default: 3 } },
    lowStockThreshold: { type: Number, default: 3 },
    loyalty: {
      pointsPerUnit: { in: { type: Number, default: 1 }, uk: { type: Number, default: 1 } }, // points per ₹100 / £1 spent
      pointValue: { in: { type: Number, default: 1 }, uk: { type: Number, default: 0.01 } }, // value of 1 point in INR / GBP
      maxRedeemPct: { type: Number, default: 20 },
    },
    referralReward: { in: { type: Number, default: 500 }, uk: { type: Number, default: 5 } },
    birthdayCouponPct: { type: Number, default: 15 },
    abandonedCartHours: { type: Number, default: 24 },
    phone: { type: String, default: "" },
    supportHours: { type: String, default: "" },
    instagram: { type: String, default: "" }, // handle without @
    announcements: { in: { type: [String], default: undefined }, uk: { type: [String], default: undefined } }, // top bar; unset = built-in defaults
    ticker: { in: { type: [String], default: undefined }, uk: { type: [String], default: undefined } }, // homepage scrolling strip
    home: {
      slides: {
        type: [{ kicker: String, title: String, accent: String, text: String, ctaLabel: String, ctaHref: String, linkLabel: String, linkHref: String, image: String, alt: String, _id: false }],
        default: undefined,
      },
      story: { kicker: String, title: String, accent: String, text: String, image: String },
    },
  },
  { timestamps: true }
);

/* ---------- Messages sent (or logged in test mode) ---------- */
/* ---------- Rate limits: counters per action + visitor, removed automatically when their window ends ---------- */
const RateLimitSchema = schema({ key: { type: String, required: true, unique: true }, count: { type: Number, default: 0 }, resetAt: { type: Date, required: true } });
RateLimitSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });

const OutboxSchema = schema(
  {
    channel: { type: String, enum: ["email", "whatsapp", "sms"], required: true, index: true },
    to: { type: String, required: true },
    subject: { type: String, default: "" },
    template: { type: String, default: "", index: true },
    body: { type: String, default: "" },
    status: { type: String, enum: ["sent", "failed", "logged"], default: "logged" },
    provider: { type: String, default: "" },
    error: { type: String, default: "" },
    ref: { type: String, default: "", index: true }, // e.g. order number
  },
  { timestamps: true }
);

/* ---------- Admin activity log ---------- */
const ActivitySchema = schema(
  {
    actorId: String,
    actorName: String,
    action: { type: String, required: true, index: true }, // e.g. "order.status", "product.save"
    target: { type: String, default: "" }, // human label, e.g. order number or product name
    targetId: { type: String, default: "" },
    meta: { type: Map, of: String },
  },
  { timestamps: true }
);

/* ---------- Security ---------- */
const PasswordResetSchema = schema({ userId: { type: String, index: true }, tokenHash: { type: String, unique: true }, expiresAt: Date, usedAt: Date }, { timestamps: true });
const LoginAttemptSchema = schema({ key: { type: String, unique: true }, count: Number, firstAt: Date, lockedUntil: Date }, { timestamps: true });
LoginAttemptSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });
const OtpSchema = schema({ phone: { type: String, index: true }, purpose: String, codeHash: String, expiresAt: Date, attempts: { type: Number, default: 0 }, verifiedAt: Date, ref: String }, { timestamps: true });
OtpSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

/* ---------- Returns and exchanges ---------- */
const ReturnSchema = schema(
  {
    number: { type: String, required: true, unique: true }, // e.g. RT-MG261009AB12-1
    orderNumber: { type: String, required: true, index: true },
    userId: String,
    region: { type: String, enum: ["in", "uk"] },
    items: {
      type: [{ slug: String, name: String, image: String, size: String, qty: Number, reason: String, kind: { type: String, enum: ["return", "exchange"] }, exchangeSize: String, unitPrice: Number }],
      default: [],
    },
    status: { type: String, enum: ["requested", "approved", "pickup_scheduled", "picked_up", "received", "refunded", "exchanged", "rejected"], default: "requested", index: true },
    refundAmount: { type: Number, default: 0 },
    refundMethod: { type: String, enum: ["original", "store_credit", "bank"], default: "original" },
    pickup: { courier: String, awb: String, date: Date },
    comments: { type: String, default: "" },
    history: { type: [{ status: String, at: Date, note: String }], default: [] },
  },
  { timestamps: true }
);
ReturnSchema.index({ region: 1, status: 1, createdAt: -1 });

/* ---------- Stock history: every manual change from Admin → Stock (who, why, before and after) ---------- */
const StockLogSchema = schema(
  {
    productId: { type: String, index: true },
    slug: String,
    name: String,
    region: { type: String, enum: ["in", "uk"] },
    size: String,
    from: Number, // manual edits know the before / after counts
    to: Number,
    change: Number, // pieces added (+) or taken (−); automatic moves only know this
    reason: { type: String, enum: ["restock", "sold_offline", "damaged", "correction", "transfer", "sale", "order_cancelled", "order_reopened", "return_received", "exchange_sent"] },
    note: { type: String, default: "" },
    byId: String,
    byName: String,
  },
  { timestamps: true }
);
StockLogSchema.index({ createdAt: -1 });
StockLogSchema.index({ region: 1, createdAt: -1 });

/* ---------- Back-in-stock alerts ---------- */
const StockAlertSchema = schema({ productSlug: { type: String, index: true }, size: String, email: String, region: String, notifiedAt: Date }, { timestamps: true });
StockAlertSchema.index({ productSlug: 1, size: 1, email: 1 }, { unique: true });

/* ---------- Gift cards ---------- */
const GiftCardSchema = schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    region: { type: String, enum: ["in", "uk"], required: true },
    initial: Number,
    balance: Number,
    purchaserEmail: String,
    recipientName: String,
    recipientEmail: String,
    message: String,
    orderNumber: String,
    active: { type: Boolean, default: true },
    expiresAt: Date,
    redemptions: { type: [{ orderNumber: String, amount: Number, at: Date }], default: [] },
  },
  { timestamps: true }
);

/* ---------- Loyalty ledger ---------- */
const LoyaltyTxnSchema = schema({ userId: { type: String, index: true }, points: Number, reason: String, orderNumber: String }, { timestamps: true });

/* ---------- Styling / bridal consult bookings ---------- */
const BookingSchema = schema(
  {
    name: String,
    email: String,
    phone: String,
    region: { type: String, enum: ["in", "uk"] },
    kind: { type: String, enum: ["bridal", "trousseau", "festive", "styling"], default: "bridal" },
    date: String, // YYYY-MM-DD
    slot: String, // "11:00"
    notes: String,
    status: { type: String, enum: ["requested", "confirmed", "done", "cancelled"], default: "requested", index: true },
    meetingLink: { type: String, default: "" },
    userId: String,
  },
  { timestamps: true }
);

/* ---------- Content: blog posts and festival lookbooks ---------- */
const PostSchema = schema(
  {
    slug: { type: String, required: true, unique: true },
    title: String,
    excerpt: String,
    body: String, // Markdown
    cover: String,
    tags: { type: [String], default: [] },
    author: String,
    status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
    publishedAt: Date,
  },
  { timestamps: true }
);
const LookbookSchema = schema(
  {
    slug: { type: String, required: true, unique: true },
    title: String,
    festival: String,
    intro: String,
    hero: String,
    productSlugs: { type: [String], default: [] },
    active: { type: Boolean, default: true },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true }
);

/* ---------- Merchandising: timed sales and shop-the-look bundles ---------- */
const SaleSchema = schema(
  {
    name: String,
    banner: String,
    percentOff: Number,
    categories: { type: [String], default: [] },
    collections: { type: [String], default: [] },
    slugs: { type: [String], default: [] },
    regions: { type: [String], default: ["in", "uk"] },
    startsAt: Date,
    endsAt: Date,
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
const BundleSchema = schema(
  {
    slug: { type: String, required: true, unique: true },
    name: String,
    description: String,
    image: String,
    productSlugs: { type: [String], default: [] },
    discountPct: { type: Number, default: 10 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

/* ---------- Suppliers / weavers ---------- */
const SupplierSchema = schema({ name: String, cluster: String, craft: String, contact: String, phone: String, email: String, notes: String }, { timestamps: true });

type Stamps = { _id: Types.ObjectId; createdAt?: Date; updatedAt?: Date };
type MoneyDoc = { now: number; mrp: number };
type RegionKey = "in" | "uk";
type PerRegion<T> = { in: T; uk: T };

export type StaffRole = "admin" | "manager" | "packer" | "stylist";
export type UserRole = "customer" | StaffRole;

export type AddressDoc = {
  _id?: Types.ObjectId; name?: string; phone?: string; line1?: string; line2?: string; city?: string; state?: string;
  postcode?: string; region?: RegionKey; isDefault?: boolean;
};

export type ProductDoc = Stamps & {
  slug: string; oldSlugs?: string[]; name: string; category: string; collections: string[]; fabric?: string; occasions: string[];
  colour: string; hex?: string; images: string[]; price: { in: MoneyDoc; uk: MoneyDoc }; freeSize?: boolean;
  stock: Map<string, number> | Record<string, number>; stockUk?: Map<string, number> | Record<string, number>; tag?: string; origin?: string; craft?: string; description?: string;
  details: string[]; care?: string; rating?: number; ratingCount?: number; active?: boolean;
  video?: string; madeToOrder?: boolean; costPrice?: number; supplierId?: string; lookbooks?: string[];
  blouseOptions?: boolean; legacyId?: string;
};

export type CartItemDoc = { slug: string; size: string; qty: number; options?: { blouse?: string; fallPico?: boolean } };
export type UserDoc = Stamps & {
  name: string; email: string; phone?: string; passwordHash: string; role: UserRole; storeLock?: "" | "in" | "uk";
  addresses: AddressDoc[]; wishlist: string[];
  birthday?: string; marketingOptIn?: boolean; whatsappOptIn?: boolean; loyaltyPoints?: number; referralCode?: string; referredBy?: string;
  measurements?: { bust?: number; waist?: number; hip?: number; height?: number; usualSize?: string; brandSizes?: Map<string, string> | Record<string, string> };
  cart?: CartItemDoc[]; cartUpdatedAt?: Date; cartRemindedAt?: Date; lastBirthdayOfferYear?: number;
};

export type StitchStatus = "measurements_needed" | "measurements_received" | "cutting" | "stitching" | "qc" | "ready";
export type OrderItemDoc = {
  productId?: string; slug: string; name: string; image: string; size: string; qty: number; unitPrice: number;
  options?: { blouse?: string; fallPico?: boolean }; optionsPrice?: number;
  stitching?: { status?: StitchStatus; measurements?: Map<string, string> | Record<string, string>; tailor?: string; notes?: string; updatedAt?: Date };
};
export type OrderStatus = "placed" | "confirmed" | "packed" | "shipped" | "delivered" | "cancelled" | "returned";
export type OrderDoc = Stamps & {
  number: string; userId?: string; email: string; region: RegionKey; currency: string; items: OrderItemDoc[];
  address: AddressDoc; subtotal: number; discount: number; coupon?: string; shipping: number; codFee: number; total: number;
  payment: { method: "cod" | "cashfree" | "razorpay" | "stripe" | "test" | "giftcard"; status: "pending" | "paid" | "failed" | "refunded"; ref?: string };
  status: OrderStatus; history: { status: string; at: Date; note?: string }[];
  shipment?: ShipmentDoc;
  gift?: { wrap?: boolean; message?: string; fee?: number };
  prepaidDiscount?: number;
  loyalty?: { redeemedPoints?: number; discount?: number; earnedPoints?: number; awarded?: boolean };
  giftCard?: { code?: string; amount?: number };
  referralCode?: string;
  partialCod?: { paidOnline?: number; dueOnDelivery?: number };
  codVerified?: boolean;
  reviewRequestedAt?: Date;
  invoiceNumber?: string;
  notifications?: string[];
};

export type TrackingEventDoc = {
  _id?: Types.ObjectId; code: string; label?: string; location?: string; at: Date; note?: string; source?: "admin" | "shiprocket";
};
export type ShipmentDoc = {
  provider?: "manual" | "shiprocket"; courier?: string; awb?: string; trackingUrl?: string; providerRef?: string;
  shippedAt?: Date; expectedBy?: Date; deliveredAt?: Date; events?: TrackingEventDoc[];
};

export type CouponDoc = Stamps & {
  code: string; description?: string; type: "percent" | "flat"; value: number; regions: string[];
  minOrder: { in: number; uk: number }; firstOrderOnly: boolean; active: boolean; expiresAt?: Date;
};

export type ReviewDoc = Stamps & {
  productSlug: string; userId?: string; name?: string; rating: number; title?: string; body?: string; city?: string; verified?: boolean;
  images?: string[]; status?: "pending" | "approved" | "rejected";
};

export type SubscriberDoc = Stamps & { email: string; region?: string };

export type SettingsDoc = Stamps & {
  key: string; legalName: string; gstin: string; stateCode: string; address: string; ukVatNumber: string; supportEmail: string;
  whatsappIn: string; whatsappUk: string; prepaidDiscountPct: number; partialCodAdvance: number; codOtpRequired: boolean;
  giftWrapFee: PerRegion<number>; lowStockThreshold: number;
  loyalty: { pointsPerUnit: PerRegion<number>; pointValue: PerRegion<number>; maxRedeemPct: number };
  referralReward: PerRegion<number>; birthdayCouponPct: number; abandonedCartHours: number;
  phone?: string; supportHours?: string; instagram?: string; announcements?: { in?: string[]; uk?: string[] }; ticker?: { in?: string[]; uk?: string[] };
  home?: { slides?: HomeSlide[]; story?: HomeStory };
};

export type OutboxDoc = Stamps & {
  channel: "email" | "whatsapp" | "sms"; to: string; subject?: string; template?: string; body?: string;
  status: "sent" | "failed" | "logged"; provider?: string; error?: string; ref?: string;
};
export type ActivityDoc = Stamps & { actorId?: string; actorName?: string; action: string; target?: string; targetId?: string; meta?: Map<string, string> | Record<string, string> };
export type PasswordResetDoc = Stamps & { userId: string; tokenHash: string; expiresAt: Date; usedAt?: Date };
export type LoginAttemptDoc = Stamps & { key: string; count: number; firstAt: Date; lockedUntil?: Date };
export type OtpDoc = Stamps & { phone: string; purpose: string; codeHash: string; expiresAt: Date; attempts: number; verifiedAt?: Date; ref?: string };
export type ReturnStatus = "requested" | "approved" | "pickup_scheduled" | "picked_up" | "received" | "refunded" | "exchanged" | "rejected";
export type ReturnDoc = Stamps & {
  number: string; orderNumber: string; userId?: string; region: RegionKey;
  items: { slug: string; name: string; image: string; size: string; qty: number; reason: string; kind: "return" | "exchange"; exchangeSize?: string; unitPrice: number }[];
  status: ReturnStatus; refundAmount: number; refundMethod: "original" | "store_credit" | "bank";
  pickup?: { courier?: string; awb?: string; date?: Date }; comments?: string; history: { status: string; at: Date; note?: string }[];
};
export type StockReason = "restock" | "sold_offline" | "damaged" | "correction" | "transfer" | "sale" | "order_cancelled" | "order_reopened" | "return_received" | "exchange_sent";
export type StockLogDoc = Stamps & { productId: string; slug: string; name: string; region: RegionKey; size: string; from?: number; to?: number; change?: number; reason: StockReason; note?: string; byId?: string; byName?: string };
export type StockAlertDoc = Stamps & { productSlug: string; size: string; email: string; region: string; notifiedAt?: Date };
export type GiftCardDoc = Stamps & {
  code: string; region: RegionKey; initial: number; balance: number; purchaserEmail?: string; recipientName?: string; recipientEmail?: string;
  message?: string; orderNumber?: string; active: boolean; expiresAt?: Date; redemptions: { orderNumber: string; amount: number; at: Date }[];
};
export type LoyaltyTxnDoc = Stamps & { userId: string; points: number; reason: string; orderNumber?: string };
export type BookingDoc = Stamps & {
  name: string; email: string; phone: string; region: RegionKey; kind: "bridal" | "trousseau" | "festive" | "styling";
  date: string; slot: string; notes?: string; status: "requested" | "confirmed" | "done" | "cancelled"; meetingLink?: string; userId?: string;
};
export type PostDoc = Stamps & { slug: string; title: string; excerpt?: string; body: string; cover?: string; tags: string[]; author?: string; status: "draft" | "published"; publishedAt?: Date };
export type LookbookDoc = Stamps & { slug: string; title: string; festival?: string; intro?: string; hero?: string; productSlugs: string[]; active: boolean; sort: number };
export type SaleDoc = Stamps & {
  name: string; banner?: string; percentOff: number; categories: string[]; collections: string[]; slugs: string[]; regions: string[];
  startsAt: Date; endsAt: Date; active: boolean;
};
export type BundleDoc = Stamps & { slug: string; name: string; description?: string; image?: string; productSlugs: string[]; discountPct: number; active: boolean };
export type SupplierDoc = Stamps & { name: string; cluster?: string; craft?: string; contact?: string; phone?: string; email?: string; notes?: string };

// Reuse compiled models across hot reloads. Each call names its document type explicitly:
// a generic helper around mongoose.model<T>() sends the TypeScript checker into unbounded type expansion.
const m = mongoose.models;
export const Product: Model<ProductDoc> = m.Product ?? mongoose.model<ProductDoc>("Product", ProductSchema);
export const User: Model<UserDoc> = m.User ?? mongoose.model<UserDoc>("User", UserSchema);
export const Order: Model<OrderDoc> = m.Order ?? mongoose.model<OrderDoc>("Order", OrderSchema);
export const Coupon: Model<CouponDoc> = m.Coupon ?? mongoose.model<CouponDoc>("Coupon", CouponSchema);
export const Review: Model<ReviewDoc> = m.Review ?? mongoose.model<ReviewDoc>("Review", ReviewSchema);
export const Subscriber: Model<SubscriberDoc> = m.Subscriber ?? mongoose.model<SubscriberDoc>("Subscriber", SubscriberSchema);
export const Settings: Model<SettingsDoc> = m.Settings ?? mongoose.model<SettingsDoc>("Settings", SettingsSchema);
export type RateLimitDoc = { key: string; count: number; resetAt: Date };
export const RateLimit: Model<RateLimitDoc> = m.RateLimit ?? mongoose.model<RateLimitDoc>("RateLimit", RateLimitSchema);
export const Outbox: Model<OutboxDoc> = m.Outbox ?? mongoose.model<OutboxDoc>("Outbox", OutboxSchema);
export const Activity: Model<ActivityDoc> = m.Activity ?? mongoose.model<ActivityDoc>("Activity", ActivitySchema);
export const PasswordReset: Model<PasswordResetDoc> = m.PasswordReset ?? mongoose.model<PasswordResetDoc>("PasswordReset", PasswordResetSchema);
export const LoginAttempt: Model<LoginAttemptDoc> = m.LoginAttempt ?? mongoose.model<LoginAttemptDoc>("LoginAttempt", LoginAttemptSchema);
export const Otp: Model<OtpDoc> = m.Otp ?? mongoose.model<OtpDoc>("Otp", OtpSchema);
export const ReturnRequest: Model<ReturnDoc> = m.ReturnRequest ?? mongoose.model<ReturnDoc>("ReturnRequest", ReturnSchema);
export const StockLog: Model<StockLogDoc> = m.StockLog ?? mongoose.model<StockLogDoc>("StockLog", StockLogSchema);
export const StockAlert: Model<StockAlertDoc> = m.StockAlert ?? mongoose.model<StockAlertDoc>("StockAlert", StockAlertSchema);
export const GiftCard: Model<GiftCardDoc> = m.GiftCard ?? mongoose.model<GiftCardDoc>("GiftCard", GiftCardSchema);
export const LoyaltyTxn: Model<LoyaltyTxnDoc> = m.LoyaltyTxn ?? mongoose.model<LoyaltyTxnDoc>("LoyaltyTxn", LoyaltyTxnSchema);
export const Booking: Model<BookingDoc> = m.Booking ?? mongoose.model<BookingDoc>("Booking", BookingSchema);
export const Post: Model<PostDoc> = m.Post ?? mongoose.model<PostDoc>("Post", PostSchema);
export const Lookbook: Model<LookbookDoc> = m.Lookbook ?? mongoose.model<LookbookDoc>("Lookbook", LookbookSchema);
export const Sale: Model<SaleDoc> = m.Sale ?? mongoose.model<SaleDoc>("Sale", SaleSchema);
export const Bundle: Model<BundleDoc> = m.Bundle ?? mongoose.model<BundleDoc>("Bundle", BundleSchema);
export const Supplier: Model<SupplierDoc> = m.Supplier ?? mongoose.model<SupplierDoc>("Supplier", SupplierSchema);

/* ---------- Categories (storefront menu, listings, homepage tiles) ---------- */
const CategorySchema = schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    kicker: { type: String, default: "" }, // small line above the listing heading
    blurb: { type: String, default: "" },
    image: { type: String, default: "" }, // ImageKit path
    sort: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    inNav: { type: Boolean, default: true },
  },
  { timestamps: true }
);
export type CategoryDoc = Stamps & { slug: string; name: string; kicker?: string; blurb?: string; image?: string; sort: number; active: boolean; inNav: boolean };
export const Category: Model<CategoryDoc> = m.Category ?? mongoose.model<CategoryDoc>("Category", CategorySchema);

/* ---------- Editable pages (about, policies, FAQ) ---------- */
const PageSchema = schema(
  {
    slug: { type: String, required: true, unique: true }, // about, shipping, returns, privacy, terms, faq, cookies, size-guide
    title: { type: String, required: true },
    intro: { type: String, default: "" },
    body: { type: String, default: "" }, // Markdown
    published: { type: Boolean, default: true },
  },
  { timestamps: true }
);
export type PageDoc = Stamps & { slug: string; title: string; intro?: string; body: string; published: boolean };
export const Page: Model<PageDoc> = m.Page ?? mongoose.model<PageDoc>("Page", PageSchema);

/* ---------- Sequential counters (invoice numbers) ---------- */
const CounterSchema = schema({ _id: String, seq: { type: Number, default: 0 } }, { _id: false, versionKey: false });
export type CounterDoc = { _id: string; seq: number };
export const Counter: Model<CounterDoc> = m.Counter ?? mongoose.model<CounterDoc>("Counter", CounterSchema);

/** Atomically returns the next number in a named sequence, e.g. nextSequence("invoice-in-2026-27"). */
export async function nextSequence(name: string): Promise<number> {
  const doc = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, new: true }).lean<CounterDoc>();
  return doc!.seq;
}

/* ---------- Contact-form enquiries ---------- */
const EnquirySchema = schema(
  {
    number: { type: String, required: true, unique: true }, // EQ-261009-4821
    name: String,
    email: { type: String, index: true },
    phone: String,
    region: { type: String, enum: ["in", "uk"] },
    topic: String,
    orderNumber: String,
    message: String,
    userId: String,
    status: { type: String, enum: ["open", "replied", "closed"], default: "open", index: true },
    replies: { type: [{ by: String, body: String, at: Date }], default: [] },
  },
  { timestamps: true }
);
export type EnquiryDoc = {
  _id: Types.ObjectId; number: string; name: string; email: string; phone?: string; region: "in" | "uk"; topic: string; orderNumber?: string;
  message: string; userId?: string; status: "open" | "replied" | "closed"; replies: { by: string; body: string; at: Date }[]; createdAt?: Date; updatedAt?: Date;
};
export const Enquiry: Model<EnquiryDoc> = m.Enquiry ?? mongoose.model<EnquiryDoc>("Enquiry", EnquirySchema);
