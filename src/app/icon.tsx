import { ImageResponse } from "next/og";

/*
 * App icons: a high-contrast "M" monogram in cocoa inside a double bronze ring, on the paper colour.
 * Drawn as SVG shapes, so no font has to be fetched at build time.
 *   /icon/32       browser tab
 *   /icon/192      Android home screen (manifest)
 *   /icon/512      splash screen and install prompt (manifest)
 *   /icon/maskable full-bleed version with a safe zone, for Android adaptive icons
 */
const PAPER = "#FBFAF7";
const COCOA = "#5B3A22";
const BRONZE = "#9A744A";

export function generateImageMetadata() {
  return [
    { id: "32", size: { width: 32, height: 32 }, contentType: "image/png" },
    { id: "192", size: { width: 192, height: 192 }, contentType: "image/png" },
    { id: "512", size: { width: 512, height: 512 }, contentType: "image/png" },
    { id: "maskable", size: { width: 512, height: 512 }, contentType: "image/png" },
  ];
}

function Monogram({ px, rings, scale }: { px: number; rings: boolean; scale: number }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: PAPER }}>
      <svg width={px * scale} height={px * scale} viewBox="0 0 100 100">
        {rings && <circle cx="50" cy="50" r="46" fill="none" stroke={BRONZE} strokeWidth="2.4" />}
        {rings && <circle cx="50" cy="50" r="41.5" fill="none" stroke={BRONZE} strokeWidth="0.9" />}
        <g fill={COCOA}>
          {/* thin left stem */}
          <rect x="28.5" y="29" width="3.2" height="42" />
          {/* thick left diagonal, down to the centre point */}
          <polygon points="28.5,29 37.5,29 52.5,64 49,71" />
          {/* thin right diagonal, back up */}
          <polygon points="47.6,67 67,29 70.2,29 50.6,71" />
          {/* thick right stem */}
          <rect x="64" y="29" width="7.8" height="42" />
          {/* bracketed serifs */}
          <rect x="23.5" y="69" width="13.2" height="2" />
          <rect x="59.5" y="69" width="17" height="2" />
          <rect x="23.5" y="29" width="14" height="2" />
          <rect x="64" y="29" width="12.5" height="2" />
        </g>
      </svg>
    </div>
  );
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const key = String(await id);
  const px = key === "maskable" ? 512 : Number(key) || 512;
  // Tiny favicons drop the fine inner ring detail and fill more of the square; maskable keeps the mark inside the 80% safe zone.
  const scale = key === "maskable" ? 0.72 : px <= 32 ? 1.1 : 0.94;
  return new ImageResponse(<Monogram px={px} rings={px > 32 || key === "maskable"} scale={scale} />, { width: px, height: px });
}
