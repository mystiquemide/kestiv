export interface NavItem {
  label: string;
  href: string;
}

import { routeLive } from "./routes";

const ALL_NAV_ITEMS: NavItem[] = [
  { label: "Stake", href: "/stake" },
  { label: "Decisions", href: "/decisions" },
  { label: "Run it", href: "/run" },
  { label: "FAQ", href: "/#faq" },
];

/** Links to pages that don't exist yet are left out. Anchors on the home page always stay. */
export const NAV_ITEMS: NavItem[] = ALL_NAV_ITEMS.filter((i) => i.href.includes("#") || routeLive(i.href));

/** The stake page when it exists, otherwise the on-chain checks on the home page. */
export const CTA: { label: string; href: string } = routeLive("/stake")
  ? { label: "See the live stake", href: "/stake" }
  : { label: "Verify it yourself", href: "/#verify" };

export function isCurrent(pathname: string, href: string): boolean {
  if (href.includes("#")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
