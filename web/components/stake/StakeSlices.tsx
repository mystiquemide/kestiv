import Link from "next/link";
import { ArrowUpRight, CircleAlert } from "lucide-react";
import { STATUS_TEXT, type SliceRow, type SlicesModel } from "@/lib/stakeSlices";

function Tx({ href, label }: { href: string | null; label: string }) {
  if (!href) return <span className="text-helper">{label} pending</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${label} transaction`} className="inline-flex min-h-6 items-center gap-1 font-medium text-ink hover:underline">
      {label}
      <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden="true" />
    </a>
  );
}

function Pill({ status }: { status: SliceRow["status"] }) {
  const t = STATUS_TEXT[status];
  if (!t) return null;
  return <span className={`ml-2 max-md:ml-0 max-md:mt-2 max-md:inline-block rounded-pill bg-band px-2 py-[2px] text-[12px] ${status === "failed" ? "text-refusal" : "text-ink"}`}>{t}</span>;
}

export function StakeSlices({ model }: { model: SlicesModel }) {
  return (
    <section id="slices" aria-labelledby="slices-heading">
      <h3 id="slices-heading" className="text-h3">
        Slices
      </h3>
      {model.kind !== "rows" ? (
        <div className="mt-6 flex items-start gap-3 rounded-card bg-band p-6 text-[16px] text-ink md:p-8">
          {model.kind === "error" && <CircleAlert size={24} strokeWidth={1.75} className="shrink-0 text-refusal" aria-hidden="true" />}
          <p className="max-w-[640px] text-body">
            {model.message}
            {model.kind === "empty" && (
              <>
                {" "}Skipped runs are on the{" "}
                <Link href="/decisions" className="font-medium text-ink underline">
                  decisions page
                </Link>
                .
              </>
            )}
          </p>
        </div>
      ) : (
        <>
          <table className="mt-6 hidden w-full text-left md:table">
            <caption className="sr-only">Every buy the agent made, newest first</caption>
            <thead>
              <tr className="border-b border-line text-eyebrow text-helper">
                <th scope="col" className="py-3 pr-4 font-medium">#</th>
                <th scope="col" className="py-3 pr-4 font-medium">Date</th>
                <th scope="col" className="py-3 pr-4 text-right font-medium">SOL spent</th>
                <th scope="col" className="py-3 pr-4 text-right font-medium">Tokens</th>
                <th scope="col" className="py-3 pr-4 font-medium">Buy</th>
                <th scope="col" className="py-3 font-medium">Lock</th>
              </tr>
            </thead>
            <tbody>
              {model.rows.map((r) => (
                <tr key={r.n} className="border-b border-line text-[16px]">
                  <td className="num py-4 pr-4 text-helper">{r.n}</td>
                  <td className="py-4 pr-4 text-ink">
                    <span className="num">{r.date}</span>
                    <Pill status={r.status} />
                  </td>
                  <td className="num py-4 pr-4 text-right text-ink">{r.sol}</td>
                  <td className="num py-4 pr-4 text-right text-ink">{r.tokens}</td>
                  <td className="py-4 pr-4"><Tx href={r.buyHref} label="Buy" /></td>
                  <td className="py-4"><Tx href={r.lockHref} label="Lock" /></td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="mt-6 flex flex-col gap-3 md:hidden">
            {model.rows.map((r) => (
              <li key={r.n} className="rounded-accordion bg-band p-5">
                <p className="flex items-baseline justify-between gap-3 text-[16px] text-ink">
                  <span><span className="num text-helper">#{r.n}</span> <span className="num">{r.date}</span></span>
                </p>
                <Pill status={r.status} />
                <dl className="mt-3 grid grid-cols-2 gap-3 text-[16px]">
                  <div><dt className="text-caption text-helper">SOL spent</dt><dd className="num text-ink">{r.sol}</dd></div>
                  <div><dt className="text-caption text-helper">Tokens</dt><dd className="num text-ink">{r.tokens}</dd></div>
                </dl>
                <p className="mt-3 flex gap-6 text-[16px]"><Tx href={r.buyHref} label="Buy" /><Tx href={r.lockHref} label="Lock" /></p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
