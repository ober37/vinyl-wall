import { useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { DateField } from '@appica/ui-react/date-field'
import { Field, FieldLabel } from '@appica/ui-react/field'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Input } from '@appica/ui-react/input'
import { fromDate, toDate } from '../model/dates'
import { longDate, today, type Rec } from '../model/record'
import { addSighting, agoText, daysSince, RECENT_DAYS, removeSighting, seenAt, sightingsOf } from '../model/sightings'
import { shopsOf } from '../model/shops'
import { useRuntime } from '../runtime/runtime'
import { ShopInput } from './ShopInput'

// Seen it (#152): where you saw it and when (today unless you say), and what you remember of the copy
export function SeenForm({ r, onDone }: { r: Rec; onDone: (msg: string) => void }) {
  const { mutate, settings } = useRuntime()
  const [shop, setShop] = useState('')
  const [d, setD] = useState(today())
  const [price, setPrice] = useState('')
  const [pressing, setPressing] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const name = shop.trim()
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!name) return
        setBusy(true)
        const ok = await mutate(r.id, (latest) => addSighting(latest, { shop: name, d, price: price.replace(/^\$\s*/, ''), pressing, note }, shopsOf(settings)))
        setBusy(false)
        if (ok) onDone(`Seen at ${name}. It's on the wall's “seen” filter for ${RECENT_DAYS} days.`)
      }}
    >
      <Fieldset>
        <FieldsetLegend>Where did you see it?</FieldsetLegend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Seen at</FieldLabel>
            <ShopInput value={shop} onChange={setShop} placeholder="e.g. Rough Trade" />
          </Field>
          <Field>
            <FieldLabel>When</FieldLabel>
            <DateField value={toDate(d)} onValueChange={(x) => setD(fromDate(x) || d)} />
          </Field>
          <Field>
            <FieldLabel>Price</FieldLabel>
            <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" startSlot={<span aria-hidden="true">$</span>} />
          </Field>
          <Field>
            <FieldLabel>Pressing</FieldLabel>
            <Input value={pressing} onChange={(e) => setPressing(e.target.value)} placeholder="e.g. 2016 reissue, red vinyl" />
          </Field>
        </div>
        <Field>
          <FieldLabel>Note</FieldLabel>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. used bin, sleeve a bit worn" />
        </Field>
        <div className="flex gap-3">
          <Button type="submit" size="sm" disabled={busy || !name}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onDone('')}>
            Cancel
          </Button>
        </div>
      </Fieldset>
    </form>
  )
}

// Seen in shops: every sighting, newest first; ones older than RECENT_DAYS are muted (stock moves on). Editors can take
// one off
export function SightingsView({ r }: { r: Rec }) {
  const { canEdit, mutate, settings } = useRuntime()
  const shops = shopsOf(settings)
  const list = sightingsOf(r)
  if (!list.length) return null
  return (
    <Fieldset>
      <FieldsetLegend>Seen in shops</FieldsetLegend>
      <ul className="flex flex-col gap-2">
        {list.map((s) => {
          const old = daysSince(s.d) > RECENT_DAYS
          const at = seenAt(s, shops)
          return (
            <li key={s.id + s.d} className={`flex items-start justify-between gap-3 text-sm ${old ? 'text-foreground-muted' : 'text-foreground'}`}>
              <div className="min-w-0">
                <div>
                  <span className="font-medium">{at}</span> · <time dateTime={s.d} title={longDate(s.d)}>{agoText(s.d)}</time>
                </div>
                {(s.price || s.pressing || s.note || s.bought) && (
                  <div className="text-foreground-muted break-words">{[s.price && '$' + s.price, s.pressing, s.note, s.bought && 'bought here'].filter(Boolean).join(' · ')}</div>
                )}
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove seen at ${at}, ${longDate(s.d)}`}
                  onClick={() => mutate(r.id, (latest) => removeSighting(latest, s))}
                >
                  Remove
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </Fieldset>
  )
}
