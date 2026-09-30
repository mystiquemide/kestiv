"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { SECTION_PATHS } from "@/lib/nav";

const STEP = 0.08;
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Fades sections in as they scroll into view, and makes /faq and /verify scroll the home page to that section.
 * Sections already on screen are left alone, and nothing animates when the visitor prefers reduced motion.
 */
export function MotionInit() {
  const pathname = usePathname();

  // /faq and /verify are the home page scrolled to a section, so there is no # in the address bar.
  useEffect(() => {
    const id = SECTION_PATHS[pathname];
    if (!id) return;
    const t = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
    }, 60);
    return () => clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      const id = SECTION_PATHS[href];
      if (!id || !(location.pathname === "/" || SECTION_PATHS[location.pathname])) return;
      const el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      el.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
      history.replaceState(null, "", href);
    };
    document.addEventListener("click", onClick, true);

    let io: IntersectionObserver | undefined;
    if (!reduced() && "IntersectionObserver" in window) {
      const targets = [...document.querySelectorAll<HTMLElement>("main > div > div > section, footer")].filter(
        (el) => el.getBoundingClientRect().top > window.innerHeight,
      );
      io = new IntersectionObserver(
        (entries) => {
          for (const en of entries) {
            if (en.isIntersecting) {
              en.target.classList.add("in");
              io?.unobserve(en.target);
            }
          }
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
      );
      for (const el of targets) {
        el.classList.add("reveal");
        io.observe(el);
      }
      // Cards in a grid follow each other by a beat.
      document.querySelectorAll<HTMLElement>("#verify article, #who-its-for article").forEach((c, i) => {
        c.style.setProperty("--d", `${(i % 3) * STEP}s`);
      });
    }

    return () => {
      document.removeEventListener("click", onClick, true);
      io?.disconnect();
    };
  }, []);

  return null;
}
