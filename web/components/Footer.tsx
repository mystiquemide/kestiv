import Link from "next/link";
import { FooterLogo } from "./Logo";
import { getStakeView, type StakeView } from "@/lib/chain";
import { serverEnv } from "@/lib/env";
import { footerSections, photoCredits, type FooterInput } from "@/lib/footer";

export function FooterView({ stake, env }: FooterInput) {
  const sections = footerSections({ stake, env });
  const credits = photoCredits();
  const linkClass = "rounded-image text-[16px] text-ink hover:underline";

  return (
    <footer className="bg-band pt-20 pb-12 md:pt-24">
      <div className="container-k">
        <div className="flex flex-col gap-4">
          <FooterLogo />
          <p className="text-[16px] text-body">Own what you launched.</p>
        </div>

        <div className="mt-16 grid gap-12 md:grid-cols-3 md:gap-8">
          {sections.map((section) => (
            <div key={section.heading}>
              <h2 className="text-eyebrow font-medium text-helper">{section.heading}</h2>
              <ul className="mt-4 flex flex-col gap-3">
                {section.links.map((l) => (
                  <li key={l.href}>
                    {l.external ? (
                      <a href={l.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                        {l.label}
                      </a>
                    ) : (
                      <Link href={l.href} className={linkClass}>
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 border-t border-line pt-8">
          <p className="text-caption text-helper">Kestiv never sells. Nothing here is financial advice.</p>
          <p className="mt-2 text-caption text-helper">
            Photos on Unsplash by{" "}
            {credits.map((c, i) => (
              <span key={c.href}>
                <a href={c.href} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {c.name}
                </a>
                {i < credits.length - 1 ? ", " : ""}
              </span>
            ))}
            .
          </p>
        </div>
      </div>
    </footer>
  );
}

export async function Footer() {
  const env = serverEnv();
  const stake: StakeView = await getStakeView({ env });
  return (
    <FooterView
      stake={stake.state === "active" || stake.state === "cap_reached" ? { state: stake.state, contractId: stake.contractId } : { state: stake.state }}
      env={{ cluster: env.cluster, mint: env.mint, wallet: env.wallet, repoUrl: env.repoUrl }}
    />
  );
}
