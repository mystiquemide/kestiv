import Image from "next/image";
import { BUILT_ON, logoDisplayWidth, type BuiltOnLogo } from "@/lib/logos";

function Mark({ logo }: { logo: BuiltOnLogo }) {
  const width = logoDisplayWidth(logo);
  if (logo.file.endsWith(".svg")) {
    // eslint-disable-next-line @next/next/no-img-element -- official SVG with fixed size, nothing to optimise
    return <img src={logo.file} alt="" width={width} height={logo.displayHeight} style={{ height: logo.displayHeight, width: "auto" }} />;
  }
  return <Image src={logo.file} alt="" width={width} height={logo.displayHeight} unoptimized={false} style={{ height: logo.displayHeight, width: "auto" }} />;
}

export function BuiltOn() {
  return (
    <section id="built-on" aria-labelledby="built-on-heading">
      <div className="border-y border-line py-24">
        <p id="built-on-heading" className="text-center text-eyebrow text-helper">
          Built on
        </p>
        <ul className="mt-12 grid grid-cols-2 place-items-center gap-x-14 gap-y-12 md:grid-cols-4 lg:gap-x-10 lg:flex lg:flex-wrap lg:items-center lg:justify-center">
          {BUILT_ON.map((l) => (
            <li key={l.slug}>
              <a
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${l.name} website`}
                className="flex items-center gap-2 transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
              >
                <Mark logo={l} />
                {l.label ? <span className="text-[20px] leading-none font-medium text-ink">{l.label}</span> : null}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
