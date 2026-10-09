# House of Muddhugumma: storefront

Online store for women's ethnic wear (sarees, kurta sets, lehengas), selling in **India (₹)** and the **United Kingdom (£)**.

Built with Next.js 16, Tailwind CSS v4, MongoDB (Mongoose) and ImageKit. See [ARCHITECTURE.md](ARCHITECTURE.md) for how the code is organised.

## Run it locally

```bash
npm install
npm run dev          # http://localhost:3100
```

No setup is needed for a first look. Without a `MONGODB_URI`, the app starts a temporary in-memory MongoDB and fills it with 16 products, 3 coupons and sample reviews. That data resets every time the server restarts.

Admin login (development): `admin@muddhugumma.com` / `ChangeMe!2026`, then open http://localhost:3100/admin.

## Connect real services

Copy `.env.example` to `.env.local` and fill in what you have.

| Service | Variables | Without it |
|---|---|---|
| MongoDB Atlas | `MONGODB_URI` | In-memory database (development only) |
| Sessions | `AUTH_SECRET` | Dev-only secret (required in production) |
| ImageKit | `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT`, `NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY` | Images load from `public/img`; admin uploads are disabled |
| Cashfree (India) | `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV` (`sandbox` or `production`) | India online payments run in test mode |
| Razorpay (legacy) | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Only confirms payments started before the switch to Cashfree |
| Stripe (UK) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | UK card payments run in test mode |

If `npm run db:ping` fails with `querySrv ECONNREFUSED`, your router's DNS is refusing the Atlas lookup: set `MONGODB_DNS_SERVERS=8.8.8.8,1.1.1.1`.

Then:

```bash
npm run db:ping         # checks the MongoDB connection
npm run images:upload   # copies public/img/** to ImageKit (products/, brand/, banners/)
npm run seed            # fills an empty Atlas database (add -- --force to replace the catalogue)
```

Webhook URLs to register: `/api/webhooks/cashfree` (Cashfree dashboard → Developers → Webhooks, payment events), `/api/webhooks/razorpay` (event `payment.captured`, legacy) and `/api/webhooks/stripe` (event `checkout.session.completed`).

## Pages

| Area | Routes |
|---|---|
| Shop | `/` home, `/c/[slug]` listings (all, new, sarees, kurta-sets, lehengas, bridal, festive, sale), `/search?q=`, `/p/[slug]` product, `/wishlist` |
| Buy | `/bag`, `/checkout`, `/order/[number]` confirmation |
| Account | `/account/login`, `/account/register`, `/account` overview, `/account/orders`, `/account/orders/[number]`, `/account/addresses`, `/account/profile` |
| Help | `/help/shipping`, `/help/returns`, `/help/size-guide`, `/help/faq`, `/help/contact`, `/help/privacy`, `/help/terms`, `/about` |
| Admin | `/admin` dashboard, `/admin/products` (+ new/edit with ImageKit upload), `/admin/orders`, `/admin/coupons`, `/admin/customers` |

## Order tracking

- **Admin:** open an order → *Shipment & tracking* → choose the courier, enter the tracking number (AWB) → **Mark as shipped**. Add updates such as "Reached hub" or "Delivered" as they happen; "Delivered" closes the order.
- **Customers:** see a progress bar, the courier, the tracking number and every update on *My orders*, or at `/track` with their order number plus checkout email or phone (guests).
- **Code:** `src/lib/shipping.ts` (couriers, tracking links, statuses), `src/lib/tracking.ts` (all tracking writes and reads).
- **Shiprocket (next stage):** call `recordShipment()` after booking through the Shiprocket API, and add `/api/webhooks/shiprocket` that maps each scan to a tracking status and calls `recordTrackingEvent({ awb }, …)`. Customer pages need no changes.
- Test script: `node --env-file=.env.local --conditions=react-server --import tsx scripts/test-tracking.mts create|ship|deliver|cleanup`.

## Feature map

| Area | Where |
|---|---|
| Shopping | Timed sales with countdown (`/c/sale`), smart search with typo fixes and suggestions, size finder, back-in-stock alerts, compare (`/compare`), looks (`/look`), lookbooks (`/lookbook`), journal (`/journal`), product video, photo reviews |
| Checkout | Gift wrap + message, prepaid discount (India), part-paid COD with OTP, gift cards (`/gift-cards`), loyalty points + referrals (`/account/rewards`), EMI notes, GST / UK VAT invoices |
| Accounts | Password reset (`/account/forgot`), sign-in lockout, birthday offers, abandoned-bag reminders, returns and exchanges (`/account/returns`), order tracking (`/track`) |
| Service | Video consult booking (`/consult`), order / shipping / return emails and WhatsApp messages |
| Admin | Dashboard, reports, orders, packing slips, stitching board, returns, products + CSV import/export, suppliers, sales, looks, lookbooks, coupons, gift cards, journal, customers, reviews, bookings, messages outbox, activity log, staff roles, settings |
| Platform | Cookie consent + GA4 / Meta Pixel, installable app (manifest + icons), Google / Meta product feeds (`/feeds/google.xml`, `/feeds/meta.csv`), security headers, error webhook, scheduled jobs (`/api/cron/*`, see `vercel.json`) |

Staff roles: **admin** (everything), **manager** (everything except staff and settings), **packer** (orders, shipping, returns), **stylist** (bookings, stitching, reviews). Add staff in Admin → Staff.

Without provider keys, emails / WhatsApp / SMS are written to **Admin → Messages** instead of being sent, and payments run in test mode. Add the keys in `.env.local` (see `.env.example`) to switch each one on.

Checks: `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`. Database test scripts: `scripts/test-*.mts` (run with `node --env-file=.env.local --conditions=react-server --import tsx scripts/<name>.mts`; they only create and delete TEST data).

## Before launch

- Set `AUTH_SECRET`, `MONGODB_URI`, `NEXT_PUBLIC_SITE_URL` and change the admin password.
- Replace the Unsplash photos with your own product photography.
- Have the privacy policy and terms reviewed by a lawyer for India (DPDP Act 2023) and the UK (UK GDPR).
- Replace placeholder WhatsApp numbers and the studio address on `/help/contact`.
