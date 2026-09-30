import Link from "next/link";

export const MARK_PATH = "M0,0H2V6H4V4H6V2H8V0H12V2H10V4H8V6H6V8H8V10H10V12H12V14H8V12H6V10H4V8H2V14H0Z";

interface MarkProps {
  size?: number;
  tile?: boolean;
  tileRadius?: number;
  className?: string;
}

/** The K staircase. With `tile`, sits on a near-black square on a 16-unit grid (2 units of margin left and right). */
export function Mark({ size = 32, tile = false, tileRadius = 5, className }: MarkProps) {
  if (tile) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="-2 -1 16 16"
        width={size}
        height={size}
        shapeRendering="crispEdges"
        aria-hidden="true"
        className={className}
      >
        <rect x={-2} y={-1} width={16} height={16} rx={(tileRadius / size) * 16} fill="#0B0D0C" />
        <path d={MARK_PATH} fill="#D9A441" />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 12 14"
      width={size * (12 / 14)}
      height={size}
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={className}
    >
      <path d={MARK_PATH} fill="#D9A441" />
    </svg>
  );
}

export function NavLogo() {
  return (
    <Link href="/" aria-label="Kestiv home" className="flex items-center gap-[10px] rounded-image">
      <Mark tile size={32} tileRadius={5} />
      <span className="text-[22px] leading-none font-semibold tracking-[-0.01em] text-ink">Kestiv</span>
    </Link>
  );
}

export function FooterLogo() {
  return (
    <div className="flex items-center gap-[10px]">
      <Mark size={28} />
      <span className="text-[22px] leading-none font-semibold tracking-[-0.01em] text-night-fg">Kestiv</span>
    </div>
  );
}
