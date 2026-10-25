import { badgesOf, type Badge, type Metal } from '../model/stats'
import type { Rec } from '../model/record'

const ICON: Record<Badge['icon'], React.ReactNode> = {
  trophy: <path d="M8 4h8v4a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 3M16 6h3a3 3 0 0 1-3 3M12 12v4M8 20h8M10 16h4v4h-4z" />,
  flame: <path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 2 1.5 3 2.5 3-1-3 0-5.5 0-8z" />,
  disc: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
}
// each metal's highlight and rim, as --m1 and --m2 for the emblem and the pill
const METAL: Record<Metal, string> = {
  gold: '[--m1:var(--metal-gold-hi)] [--m2:var(--metal-gold-lo)]',
  silver: '[--m1:var(--metal-silver-hi)] [--m2:var(--metal-silver-lo)]',
  bronze: '[--m1:var(--metal-bronze-hi)] [--m2:var(--metal-bronze-lo)]',
  hot: '[--m1:var(--metal-hot-hi)] [--m2:var(--metal-hot-lo)]',
}

// What an owned record has earned, as production's badges: a metal emblem with its icon, then the name. Not appica's
// Badge, whose variants mean a status (like Owned beside it). Its own wrapping row; nothing when there's none.
export function Badges({ r, records }: { r: Rec; records: Rec[] }) {
  const B = badgesOf(r, records)
  if (!B.length) return null
  return (
    <ul aria-label="Badges" className="mt-1 flex flex-wrap gap-1.5">
      {B.map((b) => (
        <li
          key={b.name}
          className={`${METAL[b.metal]} text-foreground-intense inline-flex h-7 items-center gap-1.5 rounded-full border border-(--m2) bg-[color-mix(in_oklch,var(--m1)_16%,transparent)] py-0.5 ps-0.5 pe-2.5 font-mono text-[0.6875rem] leading-none tracking-wider whitespace-nowrap uppercase`}
        >
          <span className="grid size-5.5 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,var(--m1),var(--m2)_75%)] shadow-[inset_0_0_0_1.5px_color-mix(in_oklch,var(--gleam)_40%,transparent)]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="text-paper-ink size-3.5"
            >
              {ICON[b.icon]}
            </svg>
          </span>
          {b.name}
        </li>
      ))}
    </ul>
  )
}
