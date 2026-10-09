# House of Muddhugumma: storefront architecture

Women's ethnic wear (sarees, kurta sets, lehengas) sold in **India (₹ INR)** and the **UK (£ GBP)**. AJIO-style shopping flow, "Studio Stone" visual design.

## Stack
- **Next.js 16** App Router, TypeScript, React 19, Server Components + Server Actions. `cacheComponents` is OFF: pages render per request because prices depend on the region cookie.
  - `params` and `searchParams` are Promises: `const { slug } = await params`.
  - `cookies()` / `headers()` are async.
- **MongoDB via Mongoose** (`src/lib/db.ts`, `src/lib/models.ts`). Call `await db()` before any model query. Without `MONGODB_URI`, dev uses an in-memory MongoDB that auto-seeds the catalogue + an admin user (`admin@muddhugumma.com` / `ChangeMe!2026`).
- **ImageKit** for images. Image values are *paths* like `products/kanchi-peacock.webp`. Always render with `next/image` and pass the path as `src` (a custom loader in `src/lib/imagekit-loader.ts` builds ImageKit URLs, or falls back to `public/img/...`). Uploads: `src/lib/imagekit.ts` (`uploadAuth()` for browser uploads, `uploadBuffer()` server-side).
- **Auth**: JWT session cookie (`src/lib/auth.ts`: `getSession`, `createSession`, `destroySession`, `requireUser(next)`, `requireAdmin()`); passwords hashed with `bcryptjs`.
- **Tailwind CSS v4.** Tokens live in `@theme` in `src/app/globals.css` (utilities: `bg-stone text-bronze border-line font-display font-serif font-script` …; breakpoints sm 480, md 720, lg 900, xl 1100). Layout and page styling use utilities; a small set of shared component classes lives in `@layer components`. Any extra CSS file must wrap its rules in `@layer components`.

## Key modules
- `src/lib/region.ts`: `Region` ("in" | "uk"), `REGION_CONFIG` (currency, shipping thresholds, sizes, ETA, payment options, postcode rules, state list), `formatMoney`, `sizesFor`, `canonicalSize` (UK sizes share stock with India sizes), `SIZE_CHART`, `deliveryWindow`, `shortDate`.
- `src/lib/types.ts`: `ProductDTO`, `CartLine`, `ReviewDTO`, `discountPct`, `CATEGORY_LABEL`.
- `src/lib/queries.ts` (server only): `getRegion()`, `listProducts(query, region)` with filters/sort/pagination + facets, `LISTINGS` (slug → title/blurb/match), `getProducts`, `getProductsBySlugs`, `getProduct`, `getRelated`, `getCompleteTheLook`, `getReviews`, `toDTO`.
- `src/components/StoreProvider.tsx` (client): `useStore()` → `region`, `setRegion`, `user`, `cart`, `cartCount`, `addToCart(product, size, options?, qty?)`, `updateQty`, `removeLine`, `clearCart`, `wishlist`, `isWished`, `toggleWish`, `toast({text, image?, href?, cta?})`. Cart and wishlist persist in localStorage (wishlist also syncs to the user account when signed in).
- Components: `Icon` (see names in `Icon.tsx`), `Overlay` (drawer/bottom sheet), `ProductCard`, `Header`, `Footer`, `TrustBar`, `AppBar`.

## Routes
- `(store)` group has header + footer: `/`, `/c/[slug]`, `/search`, `/p/[slug]`, `/wishlist`, `/bag`, `/checkout`, `/order/[number]`, `/account/*`, `/help/[slug]`, `/about`.
- `/admin/*` has its own layout (no store header).

## Design tokens (globals.css)
Colours `--paper --stone --stone-2 --ink --muted --line --bronze --cocoa --sale --ok`; fonts `--display` (Tenor Sans, uppercase headings), `--body` (Karla), `--serif` (Cormorant italic accents), `--script` (Pinyon wordmark); `--gutter` side padding (use class `pad`).
Reusable classes: `btn` (`ghost`, `bronze`, `block`), `link`, `kick`, `h1`, `h2` (`<i>` inside = bronze serif italic accent), `h3`, `mount` (photo frame with inset hairline) + `arch`, `pgrid` (product grid; add `g3` for 3 columns on desktop), `rail`, `pc` (product card), `price`, `rate`, `dot`, `crumbs`, `field`, `form-grid two`, `notice ok|err`, `check`, `chip`, `status <state>`, `empty`, `page-head`, `table-wrap` + `table.t`, `sec-head`.

## Rules
- Prices shown always come from `product.price[region]`; checkout re-prices everything on the server from the database.
- Keep copy plain and specific (Indian and UK shoppers). No lorem ipsum.
- Every page: mobile first, works at 360px, no horizontal scroll.
- Never run the dev server on port 3000 (another project uses it). Use port 3100.

## Platform foundations (phase 2)
- **Models** (`src/lib/models.ts`): Product (+video, madeToOrder, costPrice, supplierId, lookbooks), User (+staff roles, birthday, loyaltyPoints, referralCode/referredBy, measurements, server cart for abandoned-bag reminders), Order (+gift, prepaidDiscount, loyalty, giftCard, referralCode, partialCod, codVerified, invoiceNumber, notifications, per-item stitching), Review (+images, status pending/approved/rejected), and new collections: Settings, Outbox, Activity, PasswordReset, LoginAttempt, Otp, ReturnRequest, StockAlert, GiftCard, LoyaltyTxn, Booking, Post, Lookbook, Sale, Bundle, Supplier, Counter (`nextSequence(name)`).
- **Staff roles** (`src/lib/permissions.ts`): admin, manager, packer, stylist; `can(role, perm)`. `requireAdmin(perm?)` in `src/lib/auth.ts` admits any staff and optionally checks a permission; `staffCan(perm)` for actions that return errors.
- **Settings** (`src/lib/settings.ts`): `getSettings()` (GSTIN, prepaid discount, part-COD advance, COD OTP, gift-wrap fee, loyalty rates, referral reward, birthday %, low-stock threshold…), `saveSettings()`.
- **Messaging** (`src/lib/notify.ts`): `sendEmail`, `sendWhatsApp`, `sendSms`, `toE164`. Every message lands in the Outbox collection; without provider keys it is only logged (test mode). Email shell: `renderEmail`, `esc`, `siteUrl` in `src/lib/email-layout.ts`.
- **Audit** (`src/lib/audit.ts`): `logActivity(session, "area.action", { target, targetId, meta })` for every admin write.
- **Scheduled jobs**: `src/lib/jobs/<name>.ts` export `run()`; registry `src/lib/jobs/index.ts`; route `/api/cron/[job]` (Bearer `CRON_SECRET`); schedules in `vercel.json`.
- **Cross-feature contracts** (keep the exported signatures):
  - `src/lib/order-events.ts`: `onOrderPlaced`, `onOrderPaid`, `onOrderStatusChanged`, `onTrackingEvent`, `onReturnUpdated` (call after DB writes; never throw).
  - `src/lib/loyalty.ts`: `awardLoyaltyForOrder`, `reverseLoyaltyForOrder`, `adjustPoints`.
  - `src/lib/referral.ts`: `ensureReferralCode`, `attachReferral`, `rewardReferrerForOrder`.
  - `src/lib/pricing.ts` (`saleFor`, `effectivePrice`, `ActiveSale`) + `src/lib/sales.ts` (`getActiveSales`): the one rule for sale prices, used by cards, PDP and checkout.
  - `src/lib/analytics.ts`: client `track(event, data)`.
- **Type check**: `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit -p .` (use this, not `npx tsc`). Tests: `npx vitest run`.
  - `src/lib/returns.ts`: `RETURN_REASONS`, `RETURN_STATUS_LABEL`, `updateReturnStatus(returnNumber, status, actor, extras)`.
  - `src/lib/reviews.ts`: `recalcProductRating(slug)` (approved reviews only).
  - `src/lib/markdown.ts`: `renderMarkdown(md)` → safe HTML (journal).
  - `src/lib/giftcards.ts`: `newGiftCardCode`, `issueGiftCard(input)`, `restoreGiftCardForOrder(orderNumber)`.
  - Order `payment.method` also allows `"giftcard"` (order fully paid by gift card).
