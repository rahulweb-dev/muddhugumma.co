import path from "node:path";
import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Sent on every response. A Content-Security-Policy is left for later: GA4, Meta Pixel, Razorpay and Stripe
// each need their own script/frame/connect sources, and a wrong CSP silently breaks checkout.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // HTTPS only in production (localhost is plain http). Two years, the HSTS preload list minimum.
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

// Every storefront page depends on the shopper's region cookie (₹ or £), so pages render per request.
const nextConfig: NextConfig = {
  // Pin the project root (a stray package-lock.json in the home folder otherwise confuses root detection).
  outputFileTracingRoot: path.join(__dirname),
  turbopack: { root: path.join(__dirname) },
  images: {
    loader: "custom",
    loaderFile: "./src/lib/imagekit-loader.ts",
    // 90 is for the logo, so the fine lines in the crest stay sharp.
    qualities: [75, 90],
  },
  serverExternalPackages: ["mongoose", "mongodb-memory-server"],
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
  poweredByHeader: false,
  // Addresses from the previous (Base44) store, so old links and search results keep working.
  // Old /product/<id> links are resolved in src/app/product/[id]/route.ts.
  async redirects() {
    return [
      { source: "/about-us", destination: "/about", permanent: true },
      { source: "/shipping-policy", destination: "/help/shipping", permanent: true },
      { source: "/returns-policy", destination: "/help/returns", permanent: true },
      { source: "/privacy-policy", destination: "/help/privacy", permanent: true },
      { source: "/terms-conditions", destination: "/help/terms", permanent: true },
      { source: "/faq", destination: "/help/faq", permanent: true },
      { source: "/ProductCatalog", destination: "/c/all", permanent: true },
      { source: "/Stylist", destination: "/consult", permanent: true },
      { source: "/collections/halfsarees", destination: "/c/half-sarees", permanent: true },
      { source: "/collections/:slug", destination: "/c/:slug", permanent: true },
    ];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Local product and brand photos (fallback when ImageKit is not configured). Replace a photo by giving it a new file name.
      // (Generated icons and the manifest are static metadata routes; Next sets their caching itself.)
      { source: "/img/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
};

export default nextConfig;
