import { useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { DateField } from '@appica/ui-react/date-field'
import { Field, FieldLabel } from '@appica/ui-react/field'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Input } from '@appica/ui-react/input'
import { ALL_SETUPS, GEAR_EXAMPLE, GEAR_ORDER, GEAR_TYPES, newGear, ratingOf } from '../model/gear'
import { today } from '../model/record'
import { useRuntime } from '../runtime/runtime'
import { Segmented } from '../sheet/Segmented'
import { fromDate, toDate } from '../model/dates'

// Adding a piece of gear: pick the type, then only what that type needs (rated life only where there's a typical rating,
// i.e. the stylus). Nothing is saved until Add; shop, price, notes and the rest are in the item's own sheet.
export function AddGear({ setup, type: first, onAdded, onCancel }: {
  setup: string
  type?: string
  onAdded: (id: string) => void
  onCancel: () => void
}) {
  const { saveGear, newDocId } = useRuntime()
  const [type, setType] = useState(first || '')
  // a type with a typical rating starts with it filled in
  const [f, setF] = useState(() => ({ name: '', installed: today(), start: '', ...ratingOf(first || '') }))
  const [busy, setBusy] = useState(false)
  const T = GEAR_TYPES[type]
  const pick = (k: string) => {
    setType(k)
    setF((x) => ({ ...x, ...ratingOf(k) }))
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const id = newDocId('gear')
    const ok = await saveGear(id, newGear(type, setup, f))
    setBusy(false)
    if (ok) onAdded(id)
  }

  return (
    <div className="flex flex-col gap-6">
      <Fieldset>
        <FieldsetLegend>What is it?</FieldsetLegend>
        <Segmented label="Equipment type" value={type} onChange={pick} options={GEAR_ORDER.map((k) => [k, GEAR_TYPES[k].label])} />
      </Fieldset>
      {/* before a type is picked, ‹ All gear is the way back; Cancel comes with the form */}
      {T && (
        <form onSubmit={add} className="flex flex-col gap-6">
          <Fieldset>
            <FieldsetLegend>{T.label}</FieldsetLegend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="sm:col-span-2">
                <FieldLabel>Make & model</FieldLabel>
                <Input value={f.name} onChange={set('name')} placeholder={'e.g. ' + GEAR_EXAMPLE[type]} autoComplete="off" autoFocus={!matchMedia('(hover: none)').matches} />
              </Field>
              <Field>
                <FieldLabel>In use since</FieldLabel>
                <DateField value={toDate(f.installed)} onValueChange={(d) => setF({ ...f, installed: fromDate(d) })} />
              </Field>
              {T.tracks && (
                <Field>
                  <FieldLabel>Hours played so far</FieldLabel>
                  <Input value={f.start} onChange={set('start')} inputMode="decimal" placeholder="0 if it's new" className="font-mono placeholder:font-sans" />
                </Field>
              )}
              {!!T.ratedHigh && (
                <>
                  <Field>
                    <FieldLabel>Rated life from (h)</FieldLabel>
                    <Input value={f.lo} onChange={set('lo')} inputMode="numeric" placeholder="optional" className="font-mono placeholder:font-sans" />
                  </Field>
                  <Field>
                    <FieldLabel>Rated life to (h)</FieldLabel>
                    <Input value={f.hi} onChange={set('hi')} inputMode="numeric" placeholder="optional" className="font-mono placeholder:font-sans" />
                  </Field>
                </>
              )}
            </div>
            {T.tracks && (
              <p className="text-foreground-muted text-sm">
                {setup === ALL_SETUPS ? 'Plays on any setup add hours to it.' : 'Plays on this setup add hours to it.'}
                {T.hint ? ' ' + T.hint : ''}
              </p>
            )}
          </Fieldset>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy}>
              Add
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
