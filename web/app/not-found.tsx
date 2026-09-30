import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ErrorPage } from "@/components/ErrorPage";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <ErrorPage
      eyebrow="404"
      title="This step isn't on the staircase."
      text="The page you asked for doesn't exist. It may have moved, or the link has a typo."
      actions={
        <>
          <Link href="/stake" className="rounded-pill bg-brass px-[22px] py-[14px] text-[15px] leading-none font-medium text-ink transition-colors hover:bg-[#c8933a]">
            See the live stake
          </Link>
          <Link href="/" className="inline-flex min-h-6 items-center gap-2 text-[16px] font-medium text-ink hover:underline">
            Back to the home page
            <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </>
      }
    />
  );
}
