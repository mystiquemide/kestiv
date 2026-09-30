import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import type { CSSProperties } from "react";
import { PHOTOS } from "@/lib/photos";

const delay = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

export function RunHero({ repoUrl }: { repoUrl: string | undefined }) {
  const photo = PHOTOS.laptopNight;
  return (
    <section className="bg-band pt-[140px] pb-[120px] md:pt-[168px]">
      <div className="container-k">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="rise text-eyebrow text-helper">For builders</p>
            <h1 className="rise mt-6 text-h1" style={delay(0.08)}>
              Run Kestiv on your token
            </h1>
            <p className="rise mt-6 max-w-[520px] text-sub" style={delay(0.16)}>
              Turn your creator fees into a stake you can prove.
            </p>
            <div className="rise mt-10" style={delay(0.24)}>
              {repoUrl ? (
                <a
                  href={repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-pill bg-brass px-[22px] py-[14px] text-[15px] leading-none font-medium text-ink transition-colors hover:bg-[#c8933a]"
                >
                  Get the code
                  <ArrowUpRight size={18} strokeWidth={1.75} aria-hidden="true" />
                </a>
              ) : (
                <p className="max-w-[420px] text-[16px] text-body">The install command shows here as soon as the code is public.</p>
              )}
            </div>
          </div>
          <div className="rise overflow-hidden rounded-card" style={delay(0.2)}>
            <Image src={photo.file} alt={photo.alt} width={photo.width} height={photo.height} priority sizes="(min-width: 1024px) 560px, 100vw" className="h-[280px] w-full object-cover md:h-[420px]" />
          </div>
        </div>
      </div>
    </section>
  );
}
