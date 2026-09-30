import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kestiv",
    short_name: "Kestiv",
    description: "Own what you launched.",
    start_url: "/",
    display: "standalone",
    theme_color: "#FFFFFF",
    background_color: "#FFFFFF",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
