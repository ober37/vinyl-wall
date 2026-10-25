import { Button } from '@appica/ui-react/button'
import { activeGear, gState, pillOf, wearPct, type Gear, type Tone } from '../model/gear'
import { useRuntime } from '../runtime/runtime'
import { Tip } from '../wall/Tip'

const ARC: Record<Tone, string> = { '': 'stroke-ship', warn: 'stroke-brass', bad: 'stroke-want' }

// The header's way to Equipment: a round button like Search and Settings, a record in the middle and a ring around it
// filled as far as the tracked part nearest its rating has worn (stylus wear, usually); red and dotted once it's due.
// No ring when nothing is rated, and a "+" for an owner with no gear. Viewers don't see it until there's gear
// (gearPillShown). The hours are in its name and tooltip.
export const gearPillShown = (gear: Gear[], canEdit: boolean) => canEdit || activeGear(gear).length > 0
export function GearPill({ onOpen }: { onOpen: () => void }) {
  const { gear, setups } = useRuntime()
  const p = pillOf(gear, setups)
  const tone = p.gear ? gState(p.gear).tone : ''
  const pct = p.gear ? (tone === 'bad' ? 100 : wearPct(p.gear)) : 0
  return (
    <span className="relative">
      <Tip label={p.aria}>
        <Button
          size="icon-md"
          variant="outline"
          aria-label={p.aria}
          onClick={onOpen}
          className="rounded-full bg-transparent before:rounded-full before:bg-transparent"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-full p-0.5">
            {p.gear && (
              <>
                <circle cx="12" cy="12" r="10.5" strokeWidth="2" className="stroke-border" />
                <circle
                  cx="12"
                  cy="12"
                  r="10.5"
                  strokeWidth="2"
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray={`${pct} 100`}
                  transform="rotate(-90 12 12)"
                  className={ARC[tone]}
                />
              </>
            )}
            <circle cx="12" cy="12" r="5.5" strokeWidth="1.6" stroke="currentColor" />
            <circle cx="12" cy="12" r="1.3" fill="currentColor" />
          </svg>
        </Button>
      </Tip>
      {(tone === 'bad' || !p.label) && (
        <span
          aria-hidden="true"
          className={`absolute end-0 top-0 grid size-3.5 place-items-center rounded-full font-mono text-[0.625rem] leading-none font-semibold ring-2 ring-(--shade) ${tone === 'bad' ? 'bg-want text-want-ink' : 'bg-ship text-ship-ink'}`}
        >
          {tone === 'bad' ? '' : '+'}
        </span>
      )}
    </span>
  )
}
