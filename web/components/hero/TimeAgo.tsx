"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/time";

export function TimeAgo({ ts, initial }: { ts: number; initial: string }) {
  const [text, setText] = useState(initial);
  useEffect(() => {
    const id = setInterval(() => setText(timeAgo(ts, Math.floor(Date.now() / 1000))), 30_000);
    return () => clearInterval(id);
  }, [ts]);
  return (
    <time dateTime={new Date(ts * 1000).toISOString()} suppressHydrationWarning>
      {text}
    </time>
  );
}
