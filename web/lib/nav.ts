export interface NavItem {
  label: string;
  href: string;
}

import { routeLive } from "./routes";

export const NAV_ITEMS: NavItem[] = [
  { label: "Stake", href: "/stake" },
  { label: "Decisions", href: "/decisions" },
  { label: "Run it", href: "/run" },
  { label: "FAQ", href: "/faq" },
];

/** Clean paths that open a section of the home page (see the rewrites in next.config.ts). No # in the address bar. */
export const SECTION_PATHS: Readonly<Record<string, string>> = { "/faq": "faq", "/verify": "verify" };

/** The stake page when it exists, otherwise the on-chain checks on the home page. */
export const CTA: { label: string; href: string } = routeLive("/stake")
  ? { label: "See the stake", href: "/stake" }
  : { label: "Verify it yourself", href: "/verify" };

export function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
