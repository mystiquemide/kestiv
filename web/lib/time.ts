export function timeAgo(tsSec: number, nowSec: number): string {
  const s = Math.max(0, nowSec - tsSec);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export const STALE_AFTER_SEC = 2 * 60 * 60;
export const nowSec = (): number => Math.floor(Date.now() / 1000);
