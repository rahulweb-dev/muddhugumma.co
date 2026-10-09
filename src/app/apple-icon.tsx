import { ImageResponse } from "next/og";

// Home-screen icon for iPhone and iPad (iOS adds its own rounded corners). Same monogram as src/app/icon.tsx.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const PAPER = "#FBFAF7";
const COCOA = "#5B3A22";
const BRONZE = "#9A744A";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: PAPER }}>
        <svg width={150} height={150} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" fill="none" stroke={BRONZE} strokeWidth="2.4" />
          <circle cx="50" cy="50" r="41.5" fill="none" stroke={BRONZE} strokeWidth="0.9" />
          <g fill={COCOA}>
            <rect x="28.5" y="29" width="3.2" height="42" />
            <polygon points="28.5,29 37.5,29 52.5,64 49,71" />
            <polygon points="47.6,67 67,29 70.2,29 50.6,71" />
            <rect x="64" y="29" width="7.8" height="42" />
            <rect x="23.5" y="69" width="13.2" height="2" />
            <rect x="59.5" y="69" width="17" height="2" />
            <rect x="23.5" y="29" width="14" height="2" />
            <rect x="64" y="29" width="12.5" height="2" />
          </g>
        </svg>
      </div>
    ),
    size
  );
}
