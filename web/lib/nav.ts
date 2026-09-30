export interface NavItem {
  label: string;
  href: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Stake", href: "/stake" },
  { label: "Decisions", href: "/decisions" },
  { label: "Run it", href: "/run" },
  { label: "FAQ", href: "/#faq" },
];

export const CTA = { label: "See the live stake", href: "/stake" } as const;

export function isCurrent(pathname: string, href: string): boolean {
  if (href.includes("#")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
