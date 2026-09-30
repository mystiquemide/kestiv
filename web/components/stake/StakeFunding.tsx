import { CircleAlert } from "lucide-react";
import type { FundingModel } from "@/lib/stakeFunding";

export function StakeFunding({ model }: { model: FundingModel }) {
  return (
    <section id="paid-for-by" aria-labelledby="paid-for-by-heading">
      <h3 id="paid-for-by-heading" className="text-h3">
        Paid for by
      </h3>
      {model.kind !== "split" ? (
        <div className="mt-6 flex items-start gap-3 rounded-card bg-band p-6 md:p-8">
          {model.kind === "error" && <CircleAlert size={24} strokeWidth={1.75} className="shrink-0 text-refusal" aria-hidden="true" />}
          <p className="max-w-[640px] text-[16px] text-body">{model.message}</p>
        </div>
      ) : (
        <div className="mt-6">
          <div
            role="img"
            aria-label={`Of ${model.total} SOL, ${model.fee.sol} from creator fees and ${model.seed.sol} from the founder's seed`}
            className="flex h-4 w-full overflow-hidden rounded-pill bg-[#D1D1D1]"
          >
            <div className="h-full bg-ink" style={{ width: `${model.fee.pct}%` }} />
          </div>
          <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-4 text-[16px]">
            <div className="flex items-center gap-3">
              <span className="size-3 shrink-0 rounded-full bg-ink" aria-hidden="true" />
              <div>
                <dt className="text-caption text-helper">Creator fees</dt>
                <dd className="num text-ink">{model.fee.sol} SOL</dd>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="size-3 shrink-0 rounded-full bg-[#D1D1D1]" aria-hidden="true" />
              <div>
                <dt className="text-caption text-helper">Founder seed</dt>
                <dd className="num text-ink">{model.seed.sol} SOL</dd>
              </div>
            </div>
            {model.forwarded && (
              <div>
                <dt className="text-caption text-helper">Sent on to the founder</dt>
                <dd className="num text-ink">{model.forwarded} SOL</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </section>
  );
}
