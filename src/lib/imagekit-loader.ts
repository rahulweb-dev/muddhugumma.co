"use client";
// next/image loader: ImageKit transformations when an endpoint is configured, local /img files otherwise.
// Image paths are stored as "products/name.webp"; local copies live in public/img/products/name.webp.
const ENDPOINT = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT?.replace(/\/$/, "");

export default function imagekitLoader({ src, width, quality }: { src: string; width: number; quality?: number }) {
  if (src.startsWith("data:") || src.startsWith("blob:")) return src;
  const q = quality || 75;
  if (src.startsWith("http")) {
    if (src.includes("ik.imagekit.io")) return `${src}${src.includes("?") ? "&" : "?"}tr=w-${width},q-${q},f-auto`;
    return src;
  }
  const path = src.replace(/^\/+/, "").replace(/^img\//, "");
  if (ENDPOINT) return `${ENDPOINT}/${path}?tr=w-${width},q-${q},f-auto`;
  return `/img/${path}?w=${width}`;
}
