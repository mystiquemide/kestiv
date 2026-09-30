import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import type { Row } from "@/lib/hero";

export function Panel({
  eyebrow,
  right,
  className = "",
  children,
}: {
  eyebrow: string;
  right?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-[24px] border border-line bg-canvas p-7 shadow-float ${className}`}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-eyebrow font-medium text-helper">{eyebrow}</h2>
        {right ? <div className="text-caption text-helper">{right}</div> : null}
      </div>
      {children}
    </section>
  );
}

const TONE = { default: "text-ink", brass: "text-brass-ink", refusal: "text-refusal" } as const;

export function ExternalLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-6 items-center gap-1 hover:underline ${className}`}>
      {children}
      <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden="true" />
    </a>
  );
}

export function RowList({ rows, className = "", rowClassName = "min-h-11" }: { rows: Row[]; className?: string; rowClassName?: string }) {
  return (
    <dl className={`border-t border-line ${className}`}>
      {rows.map((r) => (
        <div key={r.label} className={`flex items-center justify-between gap-4 border-b border-line last:border-b-0 ${rowClassName}`}>
          <dt className="text-[14px] text-helper">{r.label}</dt>
          <dd className={`text-right text-[16px] ${r.mono ? "num" : ""} ${TONE[r.tone ?? "default"]}`}>
            {r.href ? <ExternalLink href={r.href}>{r.value}</ExternalLink> : r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
