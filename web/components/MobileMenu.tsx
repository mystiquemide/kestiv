"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { NAV_ITEMS, isCurrent } from "@/lib/nav";
import { CtaPill } from "./CtaPill";

export function MobileMenu() {
  const pathname = usePathname();
  // The menu is open only for the route it was opened on, so any navigation closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  const close = () => {
    setOpenOn(null);
    buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    firstLinkRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenOn(null);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close() : setOpenOn(pathname))}
        className="flex h-11 w-11 items-center justify-center rounded-pill text-ink"
      >
        {open ? <X size={24} strokeWidth={1.75} /> : <Menu size={24} strokeWidth={1.75} />}
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute top-[68px] right-6 left-6 rounded-[24px] border border-line bg-canvas p-6"
        >
          <nav aria-label="Main" className="flex flex-col gap-4">
            {NAV_ITEMS.map((item, i) => (
              <Link
                key={item.href}
                ref={i === 0 ? firstLinkRef : undefined}
                href={item.href}
                onClick={() => setOpenOn(null)}
                aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
                className={`rounded-image text-[20px] leading-tight font-medium ${isCurrent(pathname, item.href) ? "text-ink" : "text-body"}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <CtaPill className="mt-6 flex w-full" onClick={() => setOpenOn(null)} />
        </div>
      )}
    </div>
  );
}
