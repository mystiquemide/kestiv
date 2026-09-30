import { ArrowUpRight } from "lucide-react";
import type { VerifyModel } from "@/lib/verify";
import { SectionHeading } from "../sheet/SectionHeading";

export function Verify({ model }: { model: VerifyModel }) {
  if (model.cards.length === 0) return null;
  return (
    <section id="verify">
      <SectionHeading eyebrow="Verify it yourself" title="Don't trust this page. Check the chain." />
      {model.notice && <p className="mt-6 max-w-[640px] text-[16px] text-body">{model.notice}</p>}
      <div className="mt-14 grid gap-4 md:grid-cols-3">
        {model.cards.map((c) => (
          <article key={c.id} className="flex flex-col rounded-card bg-band p-6 md:p-8">
            <p className="text-eyebrow text-helper">
              {c.title}
              {c.devnet && <span className="ml-2 rounded-pill bg-white px-2 py-[2px] text-caption text-ink">Devnet</span>}
            </p>
            <p className="mt-4 font-mono text-[20px] text-ink" title={c.value}>
              {c.display}
            </p>
            {c.ago && c.ts !== null && (
              <p className="mt-1 text-caption text-helper">
                <time dateTime={new Date(c.ts * 1000).toISOString()}>{c.ago}</time>
              </p>
            )}
            <a
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-auto inline-flex items-center gap-1 pt-8 text-[16px] font-medium text-ink hover:underline"
            >
              {c.action}
              <ArrowUpRight size={18} strokeWidth={1.75} aria-hidden="true" />
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
