"use client";

import { useEffect } from "react";

const STEP = 0.08;

/**
 * Fades sections in as they scroll into view, and keeps section links out of the address bar.
 * Sections already on screen are left alone, and nothing animates when the visitor prefers reduced motion.
 */
export function MotionInit() {
  useEffect(() => {
    const goTo = (id: string) => {
      const el = id ? document.getElementById(decodeURIComponent(id)) : null;
      if (!el) return false;
      el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      history.replaceState(null, "", location.pathname + location.search);
      return true;
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      const m = /^(?:\/)?#([^/?]+)$/.exec(href);
      if (!m || (href.startsWith("/") && location.pathname !== "/")) return;
      if (goTo(m[1]!)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", onClick, true);

    if (location.hash.length > 1) requestAnimationFrame(() => goTo(location.hash.slice(1)));

    let io: IntersectionObserver | undefined;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && "IntersectionObserver" in window) {
      const targets = [...document.querySelectorAll<HTMLElement>("main > div > div > section, main > div > div > div, footer")].filter(
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
