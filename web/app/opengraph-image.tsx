import { ImageResponse } from "next/og";

export const alt = "Kestiv: own what you launched";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MARK = "M0,0H2V6H4V4H6V2H8V0H12V2H10V4H8V6H6V8H8V10H10V12H12V14H8V12H6V10H4V8H2V14H0Z";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0B0D0C", padding: 80 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width={86} height={100} viewBox="0 0 12 14">
            <path d={MARK} fill="#D9A441" />
          </svg>
          <div style={{ fontSize: 56, color: "#EDEBE4", fontWeight: 600 }}>Kestiv</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 96, lineHeight: 1.05, color: "#EDEBE4", fontWeight: 600 }}>Own what you launched.</div>
          <div style={{ fontSize: 34, color: "#8A8A84", maxWidth: 900 }}>Creator fees become a founder stake, locked where nobody can cancel it.</div>
        </div>
      </div>
    ),
    size,
  );
}
