"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1800);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button
      type="button"
      aria-label={done ? "Copied" : label}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => setDone(true)).catch(() => undefined);
      }}
      className="inline-flex size-8 items-center justify-center rounded-image text-helper transition-colors hover:text-ink"
    >
      {done ? <Check size={18} strokeWidth={1.75} aria-hidden="true" /> : <Copy size={18} strokeWidth={1.75} aria-hidden="true" />}
    </button>
  );
}
