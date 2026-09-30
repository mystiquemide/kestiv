import { Coins, LockKeyhole, ShieldCheck } from "lucide-react";

const FACTS = [
  { Icon: Coins, title: "Paid by fees", text: "The stake is bought with the token's creator fees, not the founder's money." },
  { Icon: LockKeyhole, title: "Locked, then daily", text: "Nothing unlocks for 90 days. Then a little unlocks every day." },
  { Icon: ShieldCheck, title: "Nobody can cancel it", text: "Not the founder, not Kestiv. The contract is created with its cancel switch off." },
];

export function Facts() {
  return (
    <ul className="mt-24 grid gap-10 md:grid-cols-3 md:gap-8">
      {FACTS.map(({ Icon, title, text }) => (
        <li key={title}>
          <Icon size={24} strokeWidth={1.75} className="text-ink" aria-hidden="true" />
          <h3 className="mt-4 text-[18px] leading-snug font-medium text-ink">{title}</h3>
          <p className="mt-2 text-[16px] text-body">{text}</p>
        </li>
      ))}
    </ul>
  );
}
