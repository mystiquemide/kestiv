export function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <>
      <p className="text-eyebrow text-helper">{eyebrow}</p>
      <h2 className="mt-4 text-h2">{title}</h2>
    </>
  );
}
