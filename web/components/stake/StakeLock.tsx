import { CircleAlert } from "lucide-react";
import type { StakeChartCard } from "@/lib/stakeChart";
import { SectionHeading } from "../sheet/SectionHeading";
import { StakeStaircase } from "./StakeStaircase";

export function StakeLock({ card }: { card: StakeChartCard }) {
  return (
    <section id="staircase">
      <SectionHeading eyebrow="The lock" title="Every buy adds a step" />
      <div className="mt-14 rounded-card bg-band p-6 md:p-10">
        {card.kind === "chart" ? (
          <StakeStaircase chart={card.chart} />
        ) : (
          <div className="flex items-start gap-3 text-[16px] text-ink">
            <CircleAlert size={24} strokeWidth={1.75} className="shrink-0 text-refusal" aria-hidden="true" />
            <p>{card.message}</p>
          </div>
        )}
      </div>
    </section>
  );
}
