"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { nextTabIndex } from "@/lib/tabs";

export interface TabSpec {
  id: string;
  label: string;
  content: ReactNode;
}

export function ProtectionTabs({ tabs, visuals }: { tabs: TabSpec[]; visuals: Record<string, ReactNode> }) {
  const [active, setActive] = useState(0);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next = nextTabIndex(e.key, i, tabs.length);
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label="What protects the stake" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {tabs.map((t, i) => {
          const selected = i === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`h-11 shrink-0 rounded-pill px-5 text-[15px] leading-none font-medium whitespace-nowrap ${
                selected ? "bg-ink text-canvas" : "border border-line bg-canvas text-ink"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-8 grid overflow-hidden rounded-card bg-band lg:grid-cols-2">
        <div className="p-4 lg:p-6">
          {tabs.map((t, i) => (
            <div key={t.id} hidden={i !== active} aria-hidden={i !== active}>
              {visuals[t.id]}
            </div>
          ))}
        </div>
        <div className="p-6 md:p-12">
          {tabs.map((t, i) => (
            <div
              key={t.id}
              role="tabpanel"
              id={`${base}-panel-${t.id}`}
              aria-labelledby={`${base}-tab-${t.id}`}
              hidden={i !== active}
            >
              {t.content}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
