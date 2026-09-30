import { X_URL, pumpFunCoin, solscanAccount, streamflowUrl, type LinkCluster } from "./links";

export interface FooterLinkSpec {
  label: string;
  href: string;
  external: boolean;
  /** Rendered as a logo instead of text. The label stays as the accessible name. */
  icon?: "x" | "github";
}

export interface FooterSection {
  heading: string;
  links: FooterLinkSpec[];
}

export interface FooterInput {
  stake: { state: string; contractId?: string };
  env: { cluster: LinkCluster; mint?: string; wallet?: string; repoUrl?: string };
}

/** Links only exist when their target does. No mint means no pump.fun link, no contract means no contract link. */
export function footerSections({ stake, env }: FooterInput): FooterSection[] {
  const proof: FooterLinkSpec[] = [];
  if ((stake.state === "active" || stake.state === "cap_reached") && stake.contractId) {
    proof.push({ label: "Vesting contract", href: streamflowUrl(stake.contractId, env.cluster), external: true });
  }
  if (env.wallet) proof.push({ label: "Kestiv wallet", href: solscanAccount(env.wallet, env.cluster), external: true });
  if (env.mint && env.cluster === "mainnet-beta") {
    proof.push({ label: "$KESTIV on pump.fun", href: pumpFunCoin(env.mint), external: true });
  }

  const follow: FooterLinkSpec[] = [{ label: "X @Kestiv_xyz", href: X_URL, external: true, icon: "x" }];
  if (env.repoUrl) follow.push({ label: "GitHub", href: env.repoUrl, external: true, icon: "github" });

  const sections: FooterSection[] = [
    {
      heading: "Product",
      links: [
        { label: "Stake", href: "/stake", external: false },
        { label: "Decisions", href: "/decisions", external: false },
        { label: "Run it", href: "/run", external: false },
      ],
    },
  ];
  if (proof.length > 0) sections.push({ heading: "Proof", links: proof });
  sections.push({ heading: "Follow", links: follow });
  return sections;
}
