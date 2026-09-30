import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUILT_ON, logoDisplayWidth } from "../lib/logos";

const SLUGS = ["solana", "pump", "clawpump", "jupiter", "streamflow", "usepod", "helius"];
const fileFor = (file: string) => new URL(`../public${file}`, import.meta.url);

describe("built on logos", () => {
  it("lists all seven projects in order", () => {
    expect(BUILT_ON.map((l) => l.slug)).toEqual(SLUGS);
  });

  it("every logo file exists, is non-empty and is an official-site link over https", () => {
    for (const l of BUILT_ON) {
      expect(statSync(fileFor(l.file)).size, l.slug).toBeGreaterThan(500);
      expect(l.href).toMatch(/^https:\/\//);
    }
  });

  it("every file in public/logos has a matching entry", () => {
    const entries = new Set(BUILT_ON.map((l) => l.file));
    for (const slug of SLUGS) {
      const ext = slug === "clawpump" ? "webp" : "svg";
      expect(entries.has(`/logos/${slug}.${ext}`), slug).toBe(true);
    }
  });

  it("svg files are real SVGs", () => {
    for (const l of BUILT_ON.filter((x) => x.file.endsWith(".svg"))) {
      expect(readFileSync(fileFor(l.file), "utf8").trimStart().startsWith("<svg")).toBe(true);
    }
  });

  it("symbol-only brands carry their name as a label", () => {
    expect(BUILT_ON.filter((l) => l.label).map((l) => l.slug)).toEqual(["pump", "clawpump", "usepod"]);
  });

  it("keeps the aspect ratio when sizing", () => {
    const helius = BUILT_ON.find((l) => l.slug === "helius")!;
    expect(logoDisplayWidth(helius)).toBe(Math.round((562 / 118) * 28));
  });
});
