import type { Staircase as StaircaseModel } from "@/lib/howItWorks";

export function StaircaseChart({ chart }: { chart: StaircaseModel }) {
  const last = chart.points[chart.points.length - 1]!;
  return (
    <div>
      <div className="relative">
        <svg
          role="img"
          aria-label={chart.ariaLabel}
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          className="block h-auto w-full"
          shapeRendering="crispEdges"
        >
          <path d={chart.path} fill="none" stroke="#1F1F1F" strokeWidth={2} />
          {chart.points.map((p) => (
            <rect key={p.id} x={p.x - 3} y={p.y - 3} width={6} height={6} fill="#D9A441" stroke="#1F1F1F" strokeWidth={1} />
          ))}
        </svg>
        <span
          className="num absolute right-4 -translate-y-[calc(100%+8px)] text-[14px] text-ink"
          style={{ top: `${(last.y / chart.height) * 100}%` }}
        >
          {chart.total}
        </span>
      </div>
      <div className="mt-2 flex justify-between text-caption text-helper">
        <span>
          First lock <span className="num">{chart.firstDate}</span>
        </span>
        <span>
          Latest <span className="num">{chart.lastDate}</span>
        </span>
      </div>
    </div>
  );
}
