import Image from "next/image";
import { ArrowUpRight, CircleAlert } from "lucide-react";
import { PHOTOS } from "@/lib/photos";
import type { ProtectionModel } from "@/lib/protection";
import { SectionHeading } from "../sheet/SectionHeading";
import { ProtectionTabs, type TabSpec } from "./ProtectionTabs";

function ExtLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[16px] font-medium text-ink hover:underline">
      {children}
      <ArrowUpRight size={18} strokeWidth={1.75} aria-hidden="true" />
    </a>
  );
}

function Heading({ children }: { children: string }) {
  return <h3 className="text-h3">{children}</h3>;
}

export function Protection({ model }: { model: ProtectionModel }) {
  const { cancel, sells, checks } = model;

  const tabs: TabSpec[] = [
    {
      id: "cancel",
      label: "Can't be cancelled",
      content: (
        <div>
          <Heading>{cancel.heading}</Heading>
          <p className="mt-4 max-w-[480px] text-[16px] text-body">{cancel.text}</p>
          {cancel.lock.error ? (
            <div className="mt-8 flex items-start gap-3 text-[16px] text-ink">
              <CircleAlert size={24} strokeWidth={1.75} className="shrink-0 text-refusal" aria-hidden="true" />
              <p>{cancel.lock.error}</p>
            </div>
          ) : (
            <div className="mt-8">
              <p className="mb-3 text-caption text-helper">{cancel.lock.label}</p>
              <dl className="grid grid-cols-2 border-t border-line">
                {cancel.lock.cells.map((c, i) => (
                  <div key={c.label} className={`border-b border-line py-3 ${i % 2 === 0 ? "pr-4" : "border-l pl-4"}`}>
                    <dt className="text-[14px] text-helper">{c.label}</dt>
                    <dd className={`text-[18px] ${c.tone === "refusal" ? "text-refusal" : "text-ink"}`}>{c.value}</dd>
                  </div>
                ))}
              </dl>
              {cancel.lock.streamflowHref ? (
                <p className="mt-6">
                  <ExtLink href={cancel.lock.streamflowHref}>Read them yourself on Streamflow</ExtLink>
                </p>
              ) : null}
            </div>
          )}
        </div>
      ),
    },
    {
      id: "sells",
      label: "Never sells",
      content: (
        <div>
          <Heading>{sells.heading}</Heading>
          <p className="mt-4 max-w-[480px] text-[16px] text-body">{sells.text}</p>
          {sells.repoHref ? (
            <p className="mt-8">
              <ExtLink href={sells.repoHref}>Read the code</ExtLink>
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "checks",
      label: "Checks before every buy",
      content: (
        <div>
          <Heading>{checks.heading}</Heading>
          <p className="mt-4 max-w-[480px] text-[16px] text-body">{checks.text}</p>
          {checks.kind === "rules" ? (
            <ol className="mt-8 grid gap-x-8 lg:grid-cols-2">
              {checks.rules.map((r, i) => (
                <li key={r} className="flex items-start gap-3 border-t border-line py-3 text-[16px] text-ink">
                  <span className="num w-5 shrink-0 text-[14px] text-helper">{i + 1}</span>
                  {r}
                </li>
              ))}
            </ol>
          ) : (
            <div className="mt-8 flex items-start gap-3 text-[16px] text-ink">
              {checks.kind === "feed_error" ? (
                <CircleAlert size={24} strokeWidth={1.75} className="shrink-0 text-refusal" aria-hidden="true" />
              ) : null}
              <p>{checks.message}</p>
            </div>
          )}
        </div>
      ),
    },
  ];

  const photo = (
    <div className="relative aspect-[4/3] overflow-hidden rounded-image lg:aspect-auto lg:h-full lg:min-h-[480px]">
      <Image
        src={PHOTOS.stairsWarm.file}
        alt={PHOTOS.stairsWarm.alt}
        fill
        sizes="(min-width:1024px) 540px, 100vw"
        className="object-cover"
      />
    </div>
  );

  return (
    <section id="what-protects-the-stake">
      <SectionHeading eyebrow="What protects the stake" title="Rules the agent can't break" />
      <div className="mt-14">
        <ProtectionTabs tabs={tabs} photo={photo} />
      </div>
    </section>
  );
}
