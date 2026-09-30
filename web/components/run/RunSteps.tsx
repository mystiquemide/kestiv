import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { CLI, ENV_ROWS, WALLET_COMMANDS, initBlock, installCommands, type Transcript } from "@/lib/runPage";
import { CodeBlock } from "../CodeBlock";
import { SectionHeading } from "../sheet/SectionHeading";

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="grid gap-4 border-t border-line py-10 md:grid-cols-[72px_1fr] md:gap-8">
      <span className="num text-[32px] leading-none text-helper" aria-hidden="true">
        {n}
      </span>
      <div className="min-w-0">
        <h3 className="text-[24px] leading-tight text-ink md:text-[28px]">
          <span className="sr-only">Step {n}: </span>
          {title}
        </h3>
        <div className="mt-4 flex flex-col gap-4 text-[16px] text-body">{children}</div>
      </div>
    </li>
  );
}

export function RunSteps({
  repoUrl,
  policy,
  transcript,
}: {
  repoUrl: string | undefined;
  policy: { stakeShareBps: number; capBps: number } | null;
  transcript: Transcript;
}) {
  const install = installCommands(repoUrl);
  const dry = `${CLI} run-once --dry-run`;
  return (
    <section id="steps">
      <SectionHeading eyebrow="Set up" title="Six steps, nothing hidden" />
      <ol className="mt-14 list-none">
        <Step n={1} title="Make a Kestiv wallet before you launch">
          <p>Set it as the payout wallet when you launch. ClawPump fixes the payout wallet once the token exists, so it can&apos;t be changed later.</p>
          <CodeBlock lines={WALLET_COMMANDS} copy={WALLET_COMMANDS.join("\n")} label="wallet commands" />
        </Step>

        <Step n={2} title="Install the skill">
          {install ? (
            <>
              <p>Needs Node 22 or newer.</p>
              <CodeBlock lines={install} copy={install.join("\n")} label="install commands" />
            </>
          ) : (
            <p>The install command shows here as soon as the code is public.</p>
          )}
        </Step>

        <Step n={3} title="Set your details">
          <p>These are environment variables. Kestiv never prints their values.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left">
              <caption className="sr-only">Environment variables</caption>
              <thead>
                <tr className="border-b border-line text-eyebrow text-helper">
                  <th scope="col" className="py-3 pr-4 font-medium">Name</th>
                  <th scope="col" className="py-3 pr-4 font-medium">What it is</th>
                  <th scope="col" className="py-3 font-medium">Needed</th>
                </tr>
              </thead>
              <tbody>
                {ENV_ROWS.map((r) => (
                  <tr key={r.name} className="border-b border-line">
                    <td className="num py-3 pr-4 text-[14px] text-ink">{r.name}</td>
                    <td className="py-3 pr-4">{r.what}</td>
                    <td className="py-3 text-ink">{r.needed ? "Yes" : "Optional"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Step>

        <Step n={4} title="Check it before it writes anything">
          <p>
            <span className="num text-ink">init</span> shows what it is about to lock in and asks you to type the last four characters of the mint. Mint, founder and vesting terms are write-once after that.
          </p>
          <CodeBlock lines={[`${CLI} init`, "", ...initBlock(policy)]} copy={`${CLI} init`} label="init command" />
        </Step>

        <Step n={5} title="Try it without spending">
          <p>A dry run checks every gate, takes a real Jupiter quote and one free UsePod call, and prints what it would do. It signs nothing and never reads your keypair.</p>
          <CodeBlock lines={[dry]} copy={dry} label="dry run command" />
          {transcript.kind === "run" ? (
            <div>
              <CodeBlock lines={transcript.lines} label="dry run output" />
              <p className="mt-3 text-caption text-helper">{transcript.caption}</p>
              <p className="mt-1 text-caption text-helper md:hidden">Scroll the box sideways to read the full lines.</p>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-accordion bg-band p-5">
              {transcript.kind === "error" && <CircleAlert size={24} strokeWidth={1.75} className="shrink-0 text-refusal" aria-hidden="true" />}
              <p>{transcript.message}</p>
            </div>
          )}
        </Step>

        <Step n={6} title="Start it">
          <p>The loop runs a check every 30 to 90 minutes. Read a dry run first and start it only when it looks right.</p>
          <CodeBlock lines={[`${CLI} loop`]} copy={`${CLI} loop`} label="loop command" />
        </Step>
      </ol>
    </section>
  );
}
