export interface BuiltOnLogo {
  slug: string;
  name: string;
  href: string;
  file: string;
  /** Natural size of the asset (SVG viewBox or raster pixels). */
  width: number;
  height: number;
  /** Rendered height in px, tuned so every mark has the same optical weight. */
  displayHeight: number;
  /** Set for symbol-only brands: the name is set in type beside the mark. */
  label?: string;
}

export const BUILT_ON: BuiltOnLogo[] = [
  { slug: "solana", name: "Solana", href: "https://solana.com", file: "/logos/solana.svg", width: 646, height: 96, displayHeight: 20 },
  { slug: "pump", name: "pump.fun", href: "https://pump.fun", file: "/logos/pump.svg", width: 200, height: 200, displayHeight: 32, label: "pump.fun" },
  { slug: "clawpump", name: "ClawPump", href: "https://clawpump.tech", file: "/logos/clawpump.webp", width: 676, height: 712, displayHeight: 32, label: "clawpump" },
  { slug: "jupiter", name: "Jupiter", href: "https://jup.ag", file: "/logos/jupiter.svg", width: 104, height: 32, displayHeight: 28 },
  { slug: "usepod", name: "UsePod", href: "https://usepod.ai", file: "/logos/usepod.svg", width: 64, height: 64, displayHeight: 32, label: "UsePod" },
  { slug: "helius", name: "Helius", href: "https://helius.dev", file: "/logos/helius.svg", width: 562, height: 118, displayHeight: 28 },
];

export const logoDisplayWidth = (l: BuiltOnLogo): number => Math.round((l.width / l.height) * l.displayHeight);
