import { Button } from '@appica/ui-react/button'
import { activeGear, gState, pillOf, wearPct, type Gear } from '../model/gear'
import { useRuntime } from '../runtime/runtime'
import { WearBar } from './Wear'

// The header's way to Equipment: the tracked part nearest its rating (stylus wear, usually), a count of the gear when
// none is rated, or "Add your gear" for an owner with none. Viewers don't see it until there's gear (gearPillShown).
export const gearPillShown = (gear: Gear[], canEdit: boolean) => canEdit || activeGear(gear).length > 0
export function GearPill({ onOpen }: { onOpen: () => void }) {
  const { gear, setups } = useRuntime()
  const p = pillOf(gear, setups)
  return (
    <Button
      variant="outline"
      aria-label={p.aria}
      title={p.aria}
      onClick={onOpen}
      className="min-h-11 gap-2.5 rounded-full bg-transparent before:rounded-full before:bg-transparent"
    >
      {p.label && <span className="text-foreground-muted font-mono text-[0.6875rem] tracking-wider uppercase">{p.label}</span>}
      {p.gear && <WearBar pct={wearPct(p.gear)} tone={gState(p.gear).tone} className="w-14 sm:w-18" />}
      <span className="font-mono text-xs whitespace-nowrap tabular-nums">{p.text}</span>
    </Button>
  )
}
