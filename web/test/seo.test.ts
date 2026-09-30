import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { metadata as faqMeta } from "../app/faq/page";
import { metadata as verifyMeta } from "../app/verify/page";
import { LIVE_ROUTES } from "../lib/routes";

describe("robots, sitemap and section paths", () => {
  it("robots allows everything and points at the sitemap on the production domain", () => {
    const r = robots();
    expect(r.rules).toEqual({ userAgent: "*", allow: "/" });
    expect(r.sitemap).toBe("https://kestiv.midelabs.xyz/sitemap.xml");
  });

  it("the sitemap lists the home page and every live page, and not the 404", () => {
    const urls = sitemap().map((s) => s.url);
    expect(urls).toContain("https://kestiv.midelabs.xyz");
    for (const r of LIVE_ROUTES) expect(urls, r).toContain(`https://kestiv.midelabs.xyz${r}`);
    expect(urls.every((u) => u.startsWith("https://kestiv.midelabs.xyz"))).toBe(true);
  });

  it("/faq and /verify are real routes that point search engines at the home page", () => {
    expect(faqMeta.alternates).toEqual({ canonical: "/" });
    expect(verifyMeta.alternates).toEqual({ canonical: "/" });
    expect(readFileSync(new URL("../next.config.ts", import.meta.url), "utf8")).not.toContain("rewrites");
  });
});
