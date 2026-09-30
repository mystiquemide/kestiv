import { GitHubIcon, XIcon } from "./BrandIcons";
import { X_URL } from "@/lib/links";

/** The short trust line for pages that have no footer: the disclaimer, and where to follow. */
export function PageNote({ repoUrl }: { repoUrl?: string }) {
  const link = "inline-flex size-11 items-center justify-center rounded-image text-ink transition-opacity hover:opacity-70";
  return (
    <aside aria-label="About this page" className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2 border-t border-line pt-8">
      <p className="text-caption text-helper">Kestiv never sells. Nothing here is financial advice.</p>
      <div className="flex items-center">
        <a href={X_URL} target="_blank" rel="noopener noreferrer" aria-label="X @Kestiv_xyz" title="X @Kestiv_xyz" className={link}>
          <XIcon />
        </a>
        {repoUrl && (
          <a href={repoUrl} target="_blank" rel="noopener noreferrer" aria-label="GitHub" title="GitHub" className={link}>
            <GitHubIcon />
          </a>
        )}
      </div>
    </aside>
  );
}
