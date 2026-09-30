import type { ReactNode } from "react";

/** The white sheet that rises over the grey band. Sections inside are spaced 160px apart (120px on mobile). */
export function WhiteSheet({ children }: { children: ReactNode }) {
  return (
    <div className="relative z-10 -mt-[60px] rounded-t-[60px] bg-canvas pt-[120px] pb-[120px] md:pb-40">
      <div className="container-k flex flex-col gap-[120px] md:gap-40">{children}</div>
    </div>
  );
}
