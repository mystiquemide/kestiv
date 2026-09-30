/** A terminal window showing real commands and, when the agent's feed is up, its real dry-run output. */
export function TerminalPanel({ lines }: { lines: string[] }) {
  return (
    <div className="overflow-hidden rounded-card bg-night text-night-fg" role="figure" aria-label="Kestiv commands in a terminal">
      <div className="flex items-center gap-2 border-b border-night-line px-5 py-4" aria-hidden="true">
        <span className="size-3 rounded-full bg-night-line" />
        <span className="size-3 rounded-full bg-night-line" />
        <span className="size-3 rounded-full bg-night-line" />
        <span className="num ml-3 text-[13px] text-night-muted">kestiv</span>
      </div>
      <pre className="h-[300px] overflow-x-auto overflow-y-hidden p-5 text-[12.5px] leading-[1.7] md:h-[420px] md:p-7 md:text-[13.5px]" tabIndex={0}>
        <code className="num">
          {lines.map((l, i) => (
            <span key={i} className={`block ${l.startsWith("$") ? "text-brass" : l.startsWith("DRY-RUN") && l.includes("FAIL") ? "text-[#E58F7B]" : l.startsWith("…") ? "text-night-muted" : ""}`}>
              {l === "" ? " " : l}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
