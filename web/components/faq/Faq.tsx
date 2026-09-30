import { ChevronDown } from "lucide-react";
import { FAQ } from "@/lib/faq";
import { SectionHeading } from "../sheet/SectionHeading";

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-24">
      <SectionHeading eyebrow="Frequently asked questions" title="Questions, answered" />
      <div className="mt-14 flex max-w-[800px] flex-col gap-3">
        {FAQ.map((item) => (
          <details key={item.q} className="group rounded-accordion bg-band">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-[18px] text-ink [&::-webkit-details-marker]:hidden">
              {item.q}
              <ChevronDown size={20} strokeWidth={1.75} className="shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <p className="px-6 pb-6 text-[16px] text-body">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
