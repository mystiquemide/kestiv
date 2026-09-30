import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CTA, NAV_ITEMS } from "../lib/nav";
import { LIVE_ROUTES } from "../lib/routes";
import { footerSections } from "../lib/footer";
import { WhoItsFor } from "../components/who/WhoItsFor";

const INTERNAL = /^\/(?!\/)([a-z-]+)$/;

describe("links to pages that don't exist", () => {
  it("nav keeps only anchors and live routes", () => {
    for (const i of NAV_ITEMS) expect(i.href.includes("#") || LIVE_ROUTES.includes(i.href), i.href).toBe(true);
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(["FAQ"]);
  });

  it("the nav button points at the on-chain checks until /stake exists", () => {
    expect(CTA).toEqual({ label: "Verify it yourself", href: "/#verify" });
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
