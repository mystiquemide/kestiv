import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { AgentPanelModel, LockPanelModel, StakePanelModel } from "@/lib/hero";
import { CtaPill } from "../CtaPill";
import { AgentPanel } from "./AgentPanel";
import { Facts } from "./Facts";
import { LockPanel } from "./LockPanel";
import { StakePanel } from "./StakePanel";

export interface HeroModels {
  stake: StakePanelModel;
  agent: AgentPanelModel;
  lock: LockPanelModel;
}

export function HeroBand({ stake, agent, lock }: HeroModels) {
  return (
    <section className="bg-band pt-[168px] pb-24">
      <div className="container-k">
        <div className="mx-auto flex max-w-[880px] flex-col items-center text-center">
          <h1 className="text-h1">Own what you launched.</h1>
          <p className="mt-6 max-w-[640px] text-sub">
            Kestiv turns a token&apos;s creator fees into a founder stake, and locks every token it buys where nobody can cancel it.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
            <CtaPill className="inline-flex" />
            <Link href="/run" className="inline-flex items-center gap-2 rounded-image text-[16px] font-medium text-ink hover:underline">
              Run it on your token
              <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-20 w-full max-w-[1080px]">
          <div className="grid gap-4 md:grid-cols-2 lg:flex lg:justify-between lg:gap-6">
            <StakePanel model={stake} className="lg:w-[420px] lg:pb-[60px]" />
            <AgentPanel model={agent} className="lg:mt-12 lg:w-[600px] lg:pb-[60px]" />
          </div>
          <LockPanel model={lock} className="mt-4 lg:relative lg:z-10 lg:mx-auto lg:-mt-10 lg:w-[560px]" />
        </div>

        <Facts />
      </div>
    </section>
  );
}
