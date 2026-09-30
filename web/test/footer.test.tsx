import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FooterView } from "../components/Footer";
import { footerSections } from "../lib/footer";

const hrefs = (input: Parameters<typeof footerSections>[0]) => footerSections(input).flatMap((s) => s.links.map((l) => l.href));
const labels = (input: Parameters<typeof footerSections>[0]) => footerSections(input).flatMap((s) => s.links.map((l) => l.label));

describe("footer link visibility", () => {
  it("not launched and no wallet: no proof section at all", () => {
    const i = { stake: { state: "not_launched" }, env: { cluster: "mainnet-beta" as const } };
    expect(footerSections(i).map((s) => s.heading)).toEqual(["Follow"]);
    expect(labels(i)).toEqual(["X @Kestiv_xyz"]);
  });

  it("not launched with a wallet: wallet link only, no contract and no pump.fun", () => {
    const i = { stake: { state: "not_launched" }, env: { cluster: "mainnet-beta" as const, wallet: "WALLET" } };
    expect(labels(i)).toContain("Kestiv wallet");
    expect(labels(i)).not.toContain("Vesting contract");
    expect(labels(i).some((l) => l.includes("pump.fun"))).toBe(false);
    expect(hrefs(i)).toContain("https://solscan.io/account/WALLET");
  });

  it("active: contract, wallet and pump.fun all show", () => {
    const i = { stake: { state: "active", contractId: "STREAM" }, env: { cluster: "mainnet-beta" as const, wallet: "W", mint: "MINT" } };
    expect(hrefs(i)).toEqual(expect.arrayContaining([
      "https://app.streamflow.finance/contract/solana/mainnet/STREAM",
      "https://solscan.io/account/W",
      "https://pump.fun/coin/MINT",
    ]));
  });

  it("cap_reached still shows the contract", () => {
    const i = { stake: { state: "cap_reached", contractId: "STREAM" }, env: { cluster: "mainnet-beta" as const } };
    expect(labels(i)).toContain("Vesting contract");
  });

  it("rpc_error and no_contract hide the contract link", () => {
    for (const state of ["rpc_error", "no_contract"]) {
      const i = { stake: { state }, env: { cluster: "mainnet-beta" as const, wallet: "W", mint: "M" } };
      expect(labels(i)).not.toContain("Vesting contract");
      expect(labels(i)).toContain("Kestiv wallet");
    }
  });

  it("devnet adds the cluster query and never links pump.fun", () => {
    const i = { stake: { state: "active", contractId: "S" }, env: { cluster: "devnet" as const, wallet: "W", mint: "M" } };
    expect(hrefs(i)).toContain("https://solscan.io/account/W?cluster=devnet");
    expect(hrefs(i)).toContain("https://app.streamflow.finance/contract/solana/devnet/S");
    expect(hrefs(i).some((h) => h.includes("pump.fun"))).toBe(false);
  });

  it("GitHub link only with a repo URL", () => {
    const base = { stake: { state: "not_launched" }, env: { cluster: "mainnet-beta" as const } };
    expect(labels(base)).not.toContain("GitHub");
    expect(hrefs({ ...base, env: { ...base.env, repoUrl: "https://github.com/x/kestiv" } })).toContain("https://github.com/x/kestiv");
  });

  it("every external link opens safely", () => {
    const html = renderToStaticMarkup(
      <FooterView stake={{ state: "active", contractId: "S" }} env={{ cluster: "mainnet-beta", wallet: "W", mint: "M" }} />,
    );
    const anchors = html.match(/<a [^>]*href="https?:[^>]*>/g) ?? [];
    expect(anchors.length).toBeGreaterThanOrEqual(4);
    for (const a of anchors) {
      expect(a).toContain('target="_blank"');
      expect(a).toContain('rel="noopener noreferrer"');
    }
    expect(html).toContain("Kestiv never sells. Nothing here is financial advice.");
    expect(html).toContain("Own what you launched.");
    expect(html).not.toContain("—");
  });
});

describe("footer theme", () => {
  it("is light, on the same grey as the cards, with no dark tokens", () => {
    const html = renderToStaticMarkup(<FooterView stake={{ state: "not_launched" }} env={{ cluster: "mainnet-beta" }} />);
    expect(html).toContain("bg-band");
    expect(html).not.toContain("night");
  });
});

describe("follow icons and credits", () => {
  it("shows X and GitHub as logos with accessible names, and no photo credit line", () => {
    const html = renderToStaticMarkup(
      <FooterView stake={{ state: "not_launched" }} env={{ cluster: "mainnet-beta", repoUrl: "https://github.com/x/kestiv" }} />,
    );
    expect(html).toContain('aria-label="X @Kestiv_xyz"');
    expect(html).toContain('aria-label="GitHub"');
    expect(html.match(/<svg/g)!.length).toBeGreaterThanOrEqual(3);
    expect(html).not.toContain("Unsplash");
    expect(html).not.toContain("Photos on");
  });

  it("leaves GitHub out until a repo url is set", () => {
    const html = renderToStaticMarkup(<FooterView stake={{ state: "not_launched" }} env={{ cluster: "mainnet-beta" }} />);
    expect(html).toContain('aria-label="X @Kestiv_xyz"');
    expect(html).not.toContain('aria-label="GitHub"');
  });
});
