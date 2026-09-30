"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CTA } from "@/lib/nav";

/** On the stake page the button would point at itself, so it sends people to the on-chain checks instead. */
export function CtaPill({ className = "", onClick }: { className?: string; onClick?: () => void }) {
  const pathname = usePathname();
  const cta = pathname === CTA.href ? { label: "Verify it yourself", href: "/verify" } : CTA;
  return (
    <Link
      href={cta.href}
      onClick={onClick}
      className={`items-center justify-center rounded-pill bg-brass px-[22px] py-[14px] text-[15px] leading-none font-medium text-ink transition-colors hover:bg-[#c8933a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${className}`}
    >
      {cta.label}
    </Link>
  );
}
