import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CTA, NAV_ITEMS, SECTION_PATHS } from "../lib/nav";
import { LIVE_ROUTES } from "../lib/routes";
import { footerSections } from "../lib/footer";
import { WhoItsFor } from "../components/who/WhoItsFor";

const INTERNAL = /^\/(?!\/)([a-z-]+)$/;

describe("links to pages that don't exist", () => {
  it("nav has all four names with clean paths and no #", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(["Stake", "Decisions", "Run it", "FAQ"]);
    for (const i of NAV_ITEMS) expect(i.href).not.toContain("#");
  });

  it("section paths map to real ids and the nav button points at the stake page", () => {
    expect(SECTION_PATHS).toEqual({ "/faq": "faq", "/verify": "verify" });
    expect(CTA).toEqual({ label: "See the live stake", href: "/stake" });
  });

  it("footer product links are left out", () => {
    const hrefs = footerSections({ stake: { state: "not_launched" }, env: { cluster: "mainnet-beta" } }).flatMap((s) => s.links.map((l) => l.href));
    for (const h of hrefs.filter((h) => INTERNAL.test(h))) expect(LIVE_ROUTES).toContain(h);
  });

  it("who-it's-for cards render no dead links", () => {
    const html = renderToStaticMarkup(<WhoItsFor />);
    for (const m of html.matchAll(/href="(\/[a-z-]+)"/g)) expect(LIVE_ROUTES).toContain(m[1]);
  });
});

describe("footer visibility", () => {
  it("is hidden on the stake, run and decisions pages", () => {
    const src = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
    expect(src).toContain('<HideOnPaths paths={["/stake", "/run", "/decisions"]}>');
  });
});
