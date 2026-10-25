import { Badge } from '@appica/ui-react/badge'
import { Meter, MeterProgress } from '@appica/ui-react/meter'
import { gHours, gState, highOf, lowOf, rated, wearLeft, wearPct, type Gear, type Tone } from '../model/gear'
import { fmtH, playDate } from '../model/record'

const FILL: Record<Tone, string> = { '': 'bg-ship', warn: 'bg-brass', bad: 'bg-want' }
const CHIP = { '': 'success', warn: 'warning', bad: 'error' } as const

// how worn a part is, as a bar (its label is the hours beside it, so the bar itself is hidden from screen readers)
export function WearBar({ pct, tone, className }: { pct: number; tone: Tone; className?: string }) {
  return (
    <Meter value={pct} aria-hidden="true" statusClassNames={{ default: FILL[tone] }} className={className}>
      <MeterProgress />
    </Meter>
  )
}

export function StateChip({ g }: { g: Gear }) {
  const S = gState(g)
  return (
    <Badge size="sm" variant={CHIP[S.tone]}>
      {S.label}
    </Badge>
  )
}

// a card's last line: hours, wear and state for tracked gear; how long it's been in use for the rest
export function WearLine({ g }: { g: Gear }) {
  if (!g.tracks) return <span className="text-foreground-muted text-xs">{g.installed ? 'Since ' + playDate(g.installed) : 'Not hours-tracked'}</span>
  const S = gState(g)
  // retired gear keeps its hours, without a verdict on its wear
  if (g.status === 'retired')
    return <span className="text-foreground-muted font-mono text-xs tabular-nums">{fmtH(gHours(g))} h · retired{g.retired ? ' ' + playDate(g.retired) : ''}</span>
  return (
    <span className="flex flex-wrap items-center gap-2">
      {rated(g) && <WearBar pct={wearPct(g)} tone={S.tone} className="w-18" />}
      <span className="text-foreground font-mono text-xs tabular-nums">
        {fmtH(gHours(g))} h{rated(g) ? ' · ' + wearLeft(g) : ''}
      </span>
      {S.tone && <StateChip g={g} />}
    </span>
  )
}

// the item's gauge: filled toward the top rating, with a mark at the lower one where the replacement window opens
export function Gauge({ g }: { g: Gear }) {
  const h = gHours(g), lo = lowOf(g), hi = highOf(g), top = hi || lo
  if (!top) return null
  const mark = lo && hi ? (lo / hi) * 100 : 0
  return (
    <div aria-hidden="true" className="flex flex-col gap-1.5">
      <div className="relative">
        <WearBar pct={Math.min(100, (h / top) * 100)} tone={gState(g).tone} className="**:data-[slot=meter-progress]:h-3" />
        {mark > 0 && <span className="bg-foreground-muted absolute -top-0.5 -bottom-0.5 w-0.5 opacity-60" style={{ left: mark + '%' }} />}
      </div>
      <div className="text-foreground-muted relative h-4 font-mono text-[0.6875rem] tabular-nums">
        <span className="absolute start-0">0 h</span>
        {mark > 0 && (
          <span className="absolute -translate-x-1/2" style={{ left: mark + '%' }}>
            {lo} h
          </span>
        )}
        <span className="absolute end-0">{top} h</span>
      </div>
    </div>
  )
}
