import type { ReactNode } from "react";

export function StepNumber({ n }: { n: number }) {
  return (
    <span className="num flex h-8 w-8 items-center justify-center rounded-full border border-line bg-canvas text-[14px] leading-none text-ink">
      {n}
    </span>
  );
}

export function Card({
  n,
  title,
  text,
  wide = false,
  className = "",
  children,
}: {
  n: number;
  title: string;
  text: string;
  wide?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <article
      className={`rounded-card bg-band p-6 md:p-10 ${wide ? "lg:col-span-2 lg:grid lg:grid-cols-[2fr_3fr] lg:gap-10" : ""} ${className}`}
    >
      <div>
        <StepNumber n={n} />
        <h3 className="mt-6 text-h3">{title}</h3>
        <p className="mt-4 max-w-[420px] text-[16px] text-body">{text}</p>
      </div>
      <div className={`rounded-[20px] bg-canvas p-6 ${wide ? "mt-8 lg:mt-0" : "mt-8"}`}>{children}</div>
    </article>
  );
}

export function InnerHeader({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  if (!left && !right) return null;
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4 text-caption text-helper">
      <div>{left}</div>
      <div>{right}</div>
    </div>
  );
}
