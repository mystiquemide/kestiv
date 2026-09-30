import { CopyButton } from "./CopyButton";

/** A copyable block of terminal lines. `copy` is what lands on the clipboard, `lines` is what is shown. */
export function CodeBlock({ lines, copy, label }: { lines: string[]; copy?: string; label: string }) {
  return (
    <div className="relative rounded-accordion bg-band">
      <pre className={`p-5 pr-14 text-[14px] leading-relaxed text-ink md:text-[15px] ${copy !== undefined ? "break-words whitespace-pre-wrap" : "overflow-x-auto"}`} tabIndex={0} aria-label={label}>
        <code className="num">{lines.join("\n")}</code>
      </pre>
      {copy !== undefined && (
        <div className="absolute top-3 right-3">
          <CopyButton value={copy} label={`Copy ${label}`} />
        </div>
      )}
    </div>
  );
}
