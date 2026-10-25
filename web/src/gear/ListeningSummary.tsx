import { fmtH, playDate, type Rec } from '../model/record'
import { rankedPlays } from '../model/stats'

// The wall's listening at a glance (production's listeningHTML): this month, in all, the last spin, and the five most
// played records, each opening its sheet
export function ListeningSummary({ records, canEdit, onOpen }: { records: Rec[]; canEdit: boolean; onOpen: (id: string) => void }) {
  const P = rankedPlays(records)
  if (!P.length) return <p className="text-foreground-muted text-sm">No plays logged yet.{canEdit && ' Open a record and log a play.'}</p>
  const mo = P.reduce((n, x) => n + x.month, 0)
  const all = P.reduce((n, x) => n + x.count, 0)
  const L = P.reduce((a, x) => (x.last > a.last ? x : a))
  return (
    <div className="flex flex-col gap-3">
      <p className="text-foreground-muted text-sm">
        {mo ? `${mo} play${mo > 1 ? 's' : ''} this month` : 'None yet this month'} · {all} in all · last spun {L.r.title}
        {L.last ? ', ' + playDate(L.last) : ''}
      </p>
      <ul className="flex flex-col gap-1.5">
        {P.slice(0, 5).map((x) => (
          <li key={x.r.id}>
            <button
              type="button"
              onClick={() => onOpen(x.r.id)}
              className="border-border hover:border-border-strong focus-visible:outline-brass flex w-full items-baseline justify-between gap-3 rounded-md border px-3 py-2.5 text-start text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span className="text-foreground min-w-0 break-words">
                <b className="font-semibold">{x.r.title}</b>
                {x.r.artist ? ' — ' + x.r.artist : ''}
              </span>
              <span className="text-foreground-muted font-mono text-xs whitespace-nowrap tabular-nums">
                {x.count} play{x.count > 1 ? 's' : ''} · {fmtH(x.min / 60)} h
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
