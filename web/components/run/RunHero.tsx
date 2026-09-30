import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { CSSProperties } from "react";
import { TERMINAL_FALLBACK } from "@/lib/runPage";
import { TerminalPanel } from "./TerminalPanel";

const delay = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

export function RunHero({ repoUrl, terminal = TERMINAL_FALLBACK }: { repoUrl: string | undefined; terminal?: string[] }) {
  return (
    <section className="bg-band pt-[140px] pb-[120px] md:pt-[168px]">
      <div className="container-k">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="rise text-eyebrow text-helper">For builders</p>
            <h1 className="rise mt-6 text-h1" style={delay(0.08)}>
              Run Kestiv on your token
            </h1>
            <p className="rise mt-6 max-w-[520px] text-sub" style={delay(0.16)}>
              Turn your creator fees into a stake you can prove.
            </p>
            <div className="rise mt-10" style={delay(0.24)}>
              <div className="flex flex-wrap items-center gap-6">
                {repoUrl ? (
                  <a
                    href={repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-pill bg-brass px-[22px] py-[14px] text-[15px] leading-none font-medium text-ink transition-colors hover:bg-[#c8933a]"
                  >
                    Get the code
                    <ArrowUpRight size={18} strokeWidth={1.75} aria-hidden="true" />
                  </a>
                ) : (
                  <Link href="/stake" className="rounded-pill bg-brass px-[22px] py-[14px] text-[15px] leading-none font-medium text-ink transition-colors hover:bg-[#c8933a]">
                    See a working example
                  </Link>
                )}
                <Link href="/decisions" className="inline-flex min-h-6 items-center gap-2 text-[16px] font-medium text-ink hover:underline">
                  Read the agent&apos;s decisions
                  <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
          <div className="rise min-w-0" style={delay(0.2)}>
            <TerminalPanel lines={terminal} />
          </div>
        </div>
      </div>
    </section>
  );
}
