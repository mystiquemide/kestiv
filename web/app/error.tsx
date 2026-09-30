"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ErrorPage } from "@/components/ErrorPage";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorPage
      eyebrow="Something broke"
      title="That didn't load."
      text="It's on our side, not yours. Your stake and the chain are untouched. Try again in a moment."
      actions={
        <>
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-pill bg-brass px-[22px] py-[14px] text-[15px] leading-none font-medium text-ink transition-colors hover:bg-[#c8933a]"
          >
            Try again
          </button>
          <Link href="/" className="inline-flex min-h-6 items-center gap-2 text-[16px] font-medium text-ink hover:underline">
            Back to the home page
            <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </>
      }
    />
  );
}
