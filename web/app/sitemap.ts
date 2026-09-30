import type { MetadataRoute } from "next";

const SITE = "https://kestiv.midelabs.xyz";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/stake", "/decisions", "/run"].map((path) => ({ url: `${SITE}${path === "/" ? "" : path}`, changeFrequency: "hourly" as const }));
}
