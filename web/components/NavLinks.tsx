"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isCurrent } from "@/lib/nav";

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
      {NAV_ITEMS.map((item) => {
        const current = isCurrent(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={`rounded-image text-[16px] font-medium hover:text-ink ${current ? "text-ink" : "text-body"}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
