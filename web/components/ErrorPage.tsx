import type { CSSProperties, ReactNode } from "react";
import { NextSteps } from "./NextSteps";
import { WhiteSheet } from "./sheet/WhiteSheet";

const delay = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

export const WHERE_TO = [
  { label: "Stake", href: "/stake", text: "What the founder holds, read from the chain." },
  { label: "Decisions", href: "/decisions", text: "Every run and every check, including the skips." },
  { label: "Run it", href: "/run", text: "Set up your own agent in six steps." },
];

/** Shared by the 404 and the error page: one message and ways back. */
export function ErrorPage({ eyebrow, title, text, actions }: { eyebrow: string; title: string; text: string; actions?: ReactNode }) {
  return (
    <main>
      <section className="bg-band pt-[168px] pb-[120px]">
        <div className="container-k">
          <div className="mx-auto flex max-w-[880px] flex-col items-center text-center">
            <p className="rise text-eyebrow text-helper">{eyebrow}</p>
            <h1 className="rise mt-6 text-h1" style={delay(0.08)}>
              {title}
            </h1>
            <p className="rise mt-6 max-w-[560px] text-sub" style={delay(0.16)}>
              {text}
            </p>
            {actions && (
              <div className="rise mt-10 flex flex-wrap items-center justify-center gap-6" style={delay(0.24)}>
                {actions}
              </div>
            )}
          </div>
        </div>
      </section>
      <WhiteSheet>
        <NextSteps title="Where people usually go" steps={WHERE_TO} columns={3} />
      </WhiteSheet>
    </main>
  );
}
