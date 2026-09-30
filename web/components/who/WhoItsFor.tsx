import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { routeLive } from "@/lib/routes";
import { SectionHeading } from "../sheet/SectionHeading";

const AUDIENCES = [
  {
    eyebrow: "For traders",
    title: "See what the founder really holds",
    text: "Kestiv's stake is public and locked on Solana. Nothing unlocks for the first 90 days, and after that only a fixed amount each day.",
    items: ["Stake size read live from the chain", "Can't be cancelled or unlocked early", "Every buy decision is public"],
    link: { label: "See the live stake", href: "/stake" },
  },
  {
    eyebrow: "For builders",
    title: "Own a real piece of what you launched",
    text: "Build a founder stake from the creator fees your token already earns. No money up front, and Kestiv never sells.",
    // The share of fees and the cap are both settable in the policy file (agent/src/policy.ts, KESTIV_POLICY_FILE).
    items: ["Runs on your own agent wallet", "You pick the share of fees and the cap", "Skips buys when trading looks thin or circular"],
    link: { label: "Run it on your token", href: "/run" },
  },
];

export function WhoItsFor() {
  return (
    <section id="who-its-for">
      <SectionHeading eyebrow="Who it's for" title="One stake, two reasons to care" />
      <div className="mt-14 grid gap-4 lg:grid-cols-2">
        {AUDIENCES.map((a) => (
          <article key={a.eyebrow} className="flex flex-col rounded-card bg-band p-6 md:p-10">
            <p className="text-eyebrow text-helper">{a.eyebrow}</p>
            <h3 className="mt-4 text-h3">{a.title}</h3>
            <p className="mt-4 max-w-[480px] text-[16px] text-body">{a.text}</p>
            <ul className="mt-8 flex flex-col gap-3">
              {a.items.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[16px] text-ink">
                  <Check size={18} strokeWidth={1.75} className="mt-[3px] shrink-0 text-ink" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            {routeLive(a.link.href) && (
              <Link href={a.link.href} className="mt-auto inline-flex items-center gap-2 pt-10 text-[16px] font-medium text-ink hover:underline">
                {a.link.label}
                <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
              </Link>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
