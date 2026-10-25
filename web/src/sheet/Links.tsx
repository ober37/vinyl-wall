// The sheets' outbound links and small shared marks
export const link = 'text-primary underline-offset-2 hover:underline'

// links one per line, each opening a new tab
export function LinkList({ links }: { links: [string, string][] }) {
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {links.map(([t, u]) => (
        <li key={t + u}>
          <a href={u} target="_blank" rel="noopener" className={link}>
            {t} ↗
          </a>
        </li>
      ))}
    </ul>
  )
}

// where something came from: its name linked when there's an address, else the name alone
export function Source({ name, href }: { name: string; href: string }) {
  return href ? (
    <a href={href} target="_blank" rel="noopener" className="text-primary whitespace-nowrap hover:underline">
      {name} ↗
    </a>
  ) : (
    <>{name}</>
  )
}

// a fold's chevron, turned over while its panel is open (inside a trigger marked `group`)
export function Chevron({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      className={`${className} transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}
