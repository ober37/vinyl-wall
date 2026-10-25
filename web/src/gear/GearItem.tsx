import { useRef, useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { Checkbox } from '@appica/ui-react/checkbox'
import { DateField } from '@appica/ui-react/date-field'
import { Field, FieldLabel } from '@appica/ui-react/field'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Input } from '@appica/ui-react/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@appica/ui-react/select'
import { Textarea } from '@appica/ui-react/textarea'
import { ALL_SETUPS, GEAR_ORDER, GEAR_TYPES, gHours, gName, gState, num, rated, ratingOf, replaced, setupName, sortSetups, typeOf, type Gear } from '../model/gear'
import { fmtH, playDate, today } from '../model/record'
import { useRuntime } from '../runtime/runtime'
import { Confirm } from '../sheet/Confirm'
import { Facts } from '../sheet/Facts'
import { Linkify } from '../sheet/Linkify'
import { fromDate, toDate } from '../model/dates'
import { useDebouncedSave } from './useDebouncedSave'
import { Gauge, StateChip } from './Wear'

// Base UI's Select needs a non-empty value for "Not in a setup"
const NONE = '-'

// A piece of gear in view: its play time, details, log and recent plays. Replace with a new one is the one step here;
// the fields, Retire and Delete are in edit (GearEdit).
export function GearItem({ g, onOpen }: { g: Gear; onOpen: (id: string) => void }) {
  const { canEdit, setups, saveGear, newDocId } = useRuntime()
  const [mins, setMins] = useState('')
  const [note, setNote] = useState('')
  const [drop, setDrop] = useState<number | null>(null)
  const [replace, setReplace] = useState(false)
  const S = gState(g), h = gHours(g), T = typeOf(g)
  const notes = g.notes || []
  const recent = (g.plays || []).slice(-12).reverse()

  const addTime = (e: React.FormEvent) => {
    e.preventDefault()
    const m = parseInt(mins, 10)
    if (!m || m < 1) return
    saveGear(g.id, (x) => x && { minutes: (+x.minutes! || 0) + m, plays: [...(x.plays || []), { d: today(), title: 'Manual entry', min: m }].slice(-200) }).then(
      (ok) => ok && setMins(''),
    )
  }
  const addNote = (e: React.FormEvent) => {
    e.preventDefault()
    const t = note.trim()
    if (t) saveGear(g.id, (x) => x && { notes: [...(x.notes || []), { d: today(), t }] }).then((ok) => ok && setNote(''))
  }
  const doReplace = async () => {
    const { old, fresh } = replaced(g)
    if (!(await saveGear(g.id, old))) return
    const id = newDocId('gear')
    if (await saveGear(id, fresh)) onOpen(id)
  }

  const details: [string, React.ReactNode][] = [
    ['Setup', g.setup === ALL_SETUPS ? 'Shared by all setups' : setups.some((x) => x.id === g.setup) ? setupName(setups, g.setup) : 'Not in a setup'],
    ['In use since', g.installed ? playDate(g.installed) : ''],
    ['Bought from', g.shop || ''],
    ['Paid', g.paid ? '$' + g.paid : ''],
    ['Warranty until', g.warranty ? playDate(g.warranty) : ''],
    ['Rated life', g.tracks && rated(g) ? [g.ratedLow, g.ratedHigh].filter(Boolean).join('–') + ' h' : ''],
    ['Hours before tracking', g.tracks && +g.startHours! ? fmtH(+g.startHours!) + ' h' : ''],
    ['Setup notes', g.specs ? <span className="whitespace-pre-line">{g.specs}</span> : ''],
  ]

  return (
    <div className="flex flex-col gap-6">
      {g.tracks && (
        <Fieldset>
          <FieldsetLegend>Play time</FieldsetLegend>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-display text-foreground-intense text-5xl leading-none font-extrabold tabular-nums">{fmtH(h)}</span>
            <span className="text-foreground-muted text-sm">hours played</span>
            {(S.tone || rated(g)) && <StateChip g={g} />}
          </div>
          <Gauge g={g} />
          {S.msg && <p className="text-foreground-muted text-sm">{S.msg}</p>}
          {canEdit && (
            <form onSubmit={addTime} className="flex flex-wrap gap-2">
              <Input
                aria-label="Minutes played off the wall"
                value={mins}
                onChange={(e) => setMins(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 45 min"
                className="min-w-0 flex-1 font-mono placeholder:font-sans"
              />
              <Button type="submit" size="sm" variant="outline" disabled={!(parseInt(mins, 10) >= 1)}>
                Add time
              </Button>
            </form>
          )}
        </Fieldset>
      )}
      {details.some(([, v]) => v) && (
        <Fieldset>
          <FieldsetLegend>Details</FieldsetLegend>
          <Facts rows={details.filter(([, v]) => v)} />
        </Fieldset>
      )}
      <Fieldset>
        <FieldsetLegend>Log</FieldsetLegend>
        {canEdit && (
          <form onSubmit={addNote} className="flex flex-wrap gap-2">
            <Input aria-label="Log entry" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Cleaned with the brush" autoComplete="off" className="min-w-0 flex-1" />
            <Button type="submit" size="sm" variant="outline" disabled={!note.trim()}>
              Log
            </Button>
          </form>
        )}
        {notes.length ? (
          <ul className="divide-border flex flex-col divide-y">
            {notes
              .map((n, i) => ({ n, i }))
              .reverse()
              .map(({ n, i }) => (
                <li key={i} className="flex items-start justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <time className="text-foreground-muted text-xs">{n.d ? playDate(String(n.d)) : ''}</time>
                    <p className="text-foreground break-words whitespace-pre-line">
                      <Linkify text={String(n.t ?? '')} />
                    </p>
                  </div>
                  {canEdit && (
                    <Button size="sm" variant="ghost" onClick={() => setDrop(i)}>
                      Delete
                    </Button>
                  )}
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-foreground-muted text-sm">{canEdit ? 'Cleaning, adjustments, repairs, anything worth remembering.' : 'Nothing logged yet.'}</p>
        )}
      </Fieldset>
      {g.tracks && recent.length > 0 && (
        <Fieldset>
          <FieldsetLegend>Recent plays</FieldsetLegend>
          <ul className="divide-border flex flex-col divide-y">
            {recent.map((p, i) => (
              <li key={i} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-3 py-2 text-sm">
                <time className="text-foreground-muted text-xs">{playDate(p.d)}</time>
                <span className="text-foreground min-w-0 break-words">{p.title || 'Manual entry'}</span>
                <span className="text-foreground-muted font-mono text-xs tabular-nums">{p.min} min</span>
              </li>
            ))}
          </ul>
        </Fieldset>
      )}
      {canEdit && g.status !== 'retired' && (
        <Button className="self-start" onClick={() => setReplace(true)}>
          Replace with a new one
        </Button>
      )}
      <Confirm
        open={replace}
        calm
        title={`Retire this ${T.label.toLowerCase()} at ${fmtH(h)} h and start a fresh one at 0 h today?`}
        yes="Replace"
        no="Not yet"
        onYes={doReplace}
        onClose={() => setReplace(false)}
      />
      <Confirm
        open={drop !== null}
        title="Delete this log entry?"
        yes="Delete"
        onYes={() => {
          // by what it says, in case another entry moved it
          const n = drop !== null ? notes[drop] : null
          if (n) saveGear(g.id, (x) => x && { notes: (x.notes || []).filter((y) => !(y.d === n.d && y.t === n.t)) })
        }}
        onClose={() => setDrop(null)}
      />
    </div>
  )
}

type F = { type: string; name: string; setup: string; installed: string; shop: string; paid: string; warranty: string; specs: string; tracks: boolean; lo: string; hi: string; start: string }
const formOf = (g: Gear): F => ({
  type: g.type && GEAR_TYPES[g.type] ? g.type : 'other',
  name: g.name || '',
  setup: g.setup || NONE,
  installed: g.installed || '',
  shop: g.shop || '',
  paid: g.paid || '',
  warranty: g.warranty || '',
  specs: g.specs || '',
  tracks: !!g.tracks,
  lo: String(g.ratedLow ?? ''),
  hi: String(g.ratedHigh ?? ''),
  start: String(g.startHours || ''),
})

// A piece of gear in edit: its fields save after a pause (type, setup and tracking at once), as production's saveFields;
// leaving edit writes what's waiting
export function GearEdit({ g, onStatus, onGone }: { g: Gear; onStatus: (s: string) => void; onGone: () => void }) {
  const { setups, saveGear, deleteGear } = useRuntime()
  const [f, setF] = useState(() => formOf(g))
  const [ask, setAsk] = useState<'retire' | 'delete' | null>(null)
  const latest = useRef(f)
  latest.current = f
  const S = sortSetups(setups)
  const loose = f.setup !== ALL_SETUPS && !S.some((x) => x.id === f.setup)

  const { schedule, flush, cancel } = useDebouncedSave(() => {
    const x = latest.current
    const d: Record<string, unknown> = {
      setup: x.setup === NONE ? '' : x.setup, type: x.type, name: x.name, installed: x.installed, shop: x.shop, paid: x.paid, warranty: x.warranty, specs: x.specs, tracks: x.tracks,
    }
    if (x.tracks) Object.assign(d, { ratedLow: num(x.lo), ratedHigh: num(x.hi), startHours: num(x.start) || 0 })
    // a piece deleted elsewhere while this waited stays deleted
    saveGear(g.id, (cur) => cur && d).then((ok) => onStatus(ok ? 'Saved' : "Couldn't save"))
  }, onStatus)
  const change = (p: Partial<F>, now = false) => {
    const next = { ...latest.current, ...p }
    latest.current = next
    setF(next)
    schedule()
    if (now) flush()
  }
  const text = (k: keyof F) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change({ [k]: e.target.value })
  const date = (k: keyof F) => (d: Date | null) => change({ [k]: fromDate(d) })

  const retire = () => {
    cancel()
    saveGear(g.id, { status: 'retired', retired: today() }).then((ok) => ok && onGone())
  }
  const del = () => {
    cancel()
    deleteGear(g.id).then((ok) => ok && onGone())
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>Type</FieldLabel>
          <Select value={f.type} onValueChange={(v) => change({ type: String(v) }, true)} items={GEAR_ORDER.map((k) => ({ value: k, label: GEAR_TYPES[k].label }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GEAR_ORDER.map((k) => (
                <SelectItem key={k} value={k}>
                  {GEAR_TYPES[k].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Make & model</FieldLabel>
          <Input value={f.name} onChange={text('name')} placeholder="e.g. Audio-Technica ATN3600L" />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel>Setup</FieldLabel>
          <Select
            value={f.setup}
            onValueChange={(v) => change({ setup: String(v) }, true)}
            items={[
              ...S.map((x) => ({ value: x.id, label: x.name || 'Untitled setup' })),
              { value: ALL_SETUPS, label: 'Shared by all setups' },
              ...(loose ? [{ value: f.setup, label: 'Not in a setup' }] : []),
            ]}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {S.map((x) => (
                <SelectItem key={x.id} value={x.id}>
                  {x.name || 'Untitled setup'}
                </SelectItem>
              ))}
              <SelectItem value={ALL_SETUPS}>Shared by all setups</SelectItem>
              {loose && <SelectItem value={f.setup}>Not in a setup</SelectItem>}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>In use since</FieldLabel>
          <DateField value={toDate(f.installed)} onValueChange={date('installed')} />
        </Field>
        <Field>
          <FieldLabel>Bought from</FieldLabel>
          <Input value={f.shop} onChange={text('shop')} />
        </Field>
        <Field>
          <FieldLabel>Paid</FieldLabel>
          <Input value={f.paid} onChange={text('paid')} inputMode="decimal" startSlot={<span aria-hidden="true">$</span>} className="font-mono" />
        </Field>
        <Field>
          <FieldLabel>Warranty until</FieldLabel>
          <DateField value={toDate(f.warranty)} onValueChange={date('warranty')} />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel>Setup notes</FieldLabel>
          <Textarea rows={3} value={f.specs} onChange={text('specs')} placeholder="Tracking force, settings, part numbers, what it pairs with…" />
        </Field>
        <label className="text-foreground flex items-center gap-2 text-sm sm:col-span-2">
          <Checkbox
            checked={f.tracks}
            onCheckedChange={(on) => {
              // turning tracking on fills in the type's typical rating when none is set
              const fill = on && !f.lo && !f.hi ? ratingOf(f.type) : {}
              change({ tracks: !!on, ...fill }, true)
            }}
          />
          Track play hours
        </label>
        {f.tracks && (
          <>
            <Field>
              <FieldLabel>Rated life from (h)</FieldLabel>
              <Input value={f.lo} onChange={text('lo')} inputMode="numeric" placeholder="optional" className="font-mono placeholder:font-sans" />
            </Field>
            <Field>
              <FieldLabel>Rated life to (h)</FieldLabel>
              <Input value={f.hi} onChange={text('hi')} inputMode="numeric" placeholder="optional" className="font-mono placeholder:font-sans" />
            </Field>
            <Field>
              <FieldLabel>Hours before tracking</FieldLabel>
              <Input value={f.start} onChange={text('start')} inputMode="decimal" placeholder="0" className="font-mono" />
            </Field>
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {g.status === 'retired' ? (
          <Button variant="outline" size="sm" onClick={() => saveGear(g.id, { status: 'active', retired: '' })}>
            Put back in use
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAsk('retire')}>
            Retire…
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setAsk('delete')}>
          Delete…
        </Button>
      </div>
      <Confirm
        open={ask === 'retire'}
        calm
        title={`Retire ${gName(g)}? It stops gaining play time and moves to Retired.`}
        yes="Retire"
        no="Not yet"
        onYes={retire}
        onClose={() => setAsk(null)}
      />
      <Confirm open={ask === 'delete'} title={`Delete ${gName(g)} and its log for good?`} yes="Delete" onYes={del} onClose={() => setAsk(null)} />
    </div>
  )
}
