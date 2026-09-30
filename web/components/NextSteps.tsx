import Link from "next/link";
import { ArrowRight } from "lucide-react";

export interface NextStep {
  label: string;
  href: string;
  text: string;
}

/** A closing row of next steps, so a page never ends in a dead end. */
export function NextSteps({ title, steps, columns = 2 }: { title: string; steps: NextStep[]; columns?: 2 | 3 }) {
  return (
    <section aria-label={title}>
      <h2 className="text-h3">{title}</h2>
      <ul className={`mt-8 grid gap-4 ${columns === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        {steps.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="group flex h-full flex-col justify-between gap-6 rounded-card bg-band p-6 transition-colors hover:bg-[#ececec] md:p-8">
              <span className="text-[16px] text-body">{s.text}</span>
              <span className="inline-flex items-center gap-2 text-[18px] font-medium text-ink">
                {s.label}
                <ArrowRight size={18} strokeWidth={1.75} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
