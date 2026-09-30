"use client";

/** First tab stop. It moves focus to the page content without putting a # in the address bar. */
export function SkipLink() {
  return (
    <a
      href="#main"
      onClick={(e) => {
        const main = document.getElementById("main");
        if (!main) return;
        e.preventDefault();
        main.focus({ preventScroll: true });
        main.scrollIntoView({ block: "start" });
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-pill focus:bg-ink focus:px-5 focus:py-3 focus:text-[15px] focus:text-white"
    >
      Skip to content
    </a>
  );
}
