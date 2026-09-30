import Image from "next/image";
import Link from "next/link";
import { PHOTOS } from "@/lib/photos";
import { routeLive } from "@/lib/routes";

export function PhotoBand() {
  const photo = PHOTOS.stairsShadow;
  return (
    <section aria-labelledby="photo-band-title" className="relative isolate flex min-h-[420px] items-end overflow-hidden rounded-card md:min-h-[520px]">
      <Image
        src={photo.file}
        alt={photo.alt}
        width={photo.width}
        height={photo.height}
        sizes="(min-width: 1224px) 1176px, 100vw"
        className="absolute inset-0 -z-10 h-full w-full object-cover"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-black/30" />
      <div className="p-8 md:p-16">
        <h2 id="photo-band-title" className="max-w-[560px] text-h2 text-white">
          Every buy adds a step. No step can be taken away.
        </h2>
        {routeLive("/decisions") && (
          <Link href="/decisions" className="mt-8 inline-flex items-center justify-center rounded-pill bg-white px-[22px] py-[14px] text-[15px] leading-none font-medium text-ink hover:bg-band">
            See every decision
          </Link>
        )}
      </div>
    </section>
  );
}
