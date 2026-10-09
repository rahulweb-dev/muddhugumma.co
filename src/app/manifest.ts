import type { MetadataRoute } from "next";

/*
 * Web app manifest: lets shoppers add the store to their home screen (Android, iOS 16.4+, desktop Chrome/Edge).
 * Icons are drawn by src/app/icon.tsx (/icon/192, /icon/512, /icon/maskable) and src/app/apple-icon.tsx.
 *
 * No service worker this round, on purpose:
 *  - every page is rendered per request for the shopper's region (₹ or £) and stock, so a cached page could show a
 *    wrong price, a sold-out size or someone else's bag after a region switch;
 *  - checkout, Razorpay and Stripe need the network anyway, so an offline shell adds little for a shop;
 *  - a badly cached worker is hard to recall from phones once installed.
 * When we want offline browsing or web push, add Serwist (@serwist/next) with network-first for HTML,
 * cache-first for /img/* and ImageKit, and never cache /api, /checkout, /bag or /account.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "House of Muddhugumma",
    short_name: "Muddhugumma",
    description: "Handpicked sarees, kurta sets and bridal lehengas from India's weaving clusters, delivered across India and the UK.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FBFAF7",
    theme_color: "#FBFAF7",
    categories: ["shopping", "lifestyle"],
    lang: "en",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "New in", url: "/c/new" },
      { name: "My bag", url: "/bag" },
      { name: "Track my order", url: "/track" },
      { name: "Book a video consult", url: "/consult" },
    ],
  };
}
