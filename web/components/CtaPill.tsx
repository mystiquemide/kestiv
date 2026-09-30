import Link from "next/link";
import { CTA } from "@/lib/nav";

export function CtaPill({ className = "", onClick }: { className?: string; onClick?: () => void }) {
  return (
    <Link
      href={CTA.href}
      onClick={onClick}
      className={`items-center justify-center rounded-pill bg-brass px-[22px] py-[14px] text-[15px] leading-none font-medium text-ink transition-colors hover:bg-[#c8933a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${className}`}
    >
      {CTA.label}
    </Link>
  );
}
