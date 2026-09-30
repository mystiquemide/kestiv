import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { routeLive } from "@/lib/routes";

export function ClosingCta() {
  const run = routeLive("/run");
  const stake = routeLive("/stake");
  return (
    <section className="flex flex-col items-center text-center">
      <h2 className="max-w-[720px] text-h2">Start owning what you launched.</h2>
      {(run || stake) && (
        <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
          {run && (
            <Link href="/run" className="rounded-pill bg-brass px-[22px] py-[14px] text-[15px] leading-none font-medium text-ink transition-colors hover:bg-[#c8933a]">
              Run it on your token
            </Link>
          )}
          {stake && (
            <Link href="/stake" className="inline-flex items-center gap-2 text-[16px] font-medium text-ink hover:underline">
              See the live stake
              <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
