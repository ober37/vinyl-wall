import { useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { Checkbox } from '@appica/ui-react/checkbox'
import { DateField } from '@appica/ui-react/date-field'
import { Field, FieldLabel } from '@appica/ui-react/field'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { fromDate, toDate } from '../model/dates'
import { kindOf, longDate, today, wallOrder, type Rec } from '../model/record'
import type { Shop } from '../model/shops'
import { addSighting, agoText, daysSince, RECENT_DAYS, sightingsAt } from '../model/sightings'
import { useRuntime } from '../runtime/runtime'

// A shop's sightings (#152): Seen here, what you've seen at it, newest first (older than RECENT_DAYS muted), and, at a
// local shop, I saw… to log the wanted records from one visit at once
export function ShopSightings({ shop }: { shop: Shop }) {
  const { records, canEdit } = useRuntime()
  const [logging, setLogging] = useState(false)
  const [msg, setMsg] = useState('')
  const seen = sightingsAt(records, shop)
  const wanted = wallOrder(records.filter((r) => !r.deleted && kindOf(r) === 'wish'))
  const canLog = canEdit && shop.kind === 'local' && wanted.length > 0
  if (!seen.length && !canLog) return null
  return (
    <Fieldset>
      <FieldsetLegend>Seen here</FieldsetLegend>
      {seen.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {seen.map(({ r, s }) => (
            <li key={r.id + s.id} className={`text-sm break-words ${s.bought || daysSince(s.d) > RECENT_DAYS ? 'text-foreground-muted' : 'text-foreground'}`}>
              <span className="font-medium">{r.title || 'Untitled'}</span>
              {r.artist ? ' · ' + r.artist : ''} · <time dateTime={s.d} title={longDate(s.d)}>{agoText(s.d)}</time>
              {[s.price && '$' + s.price, s.pressing, s.bought && 'bought here'].filter(Boolean).map((x) => ' · ' + x)}
            </li>
          ))}
        </ul>
      ) : (
        !logging && <p className="text-foreground-muted text-sm">Nothing yet. On a visit, log the records you want that they had.</p>
      )}
      {msg && (
        <p role="status" className="text-foreground-muted text-sm">
          {msg}
        </p>
      )}
      {canLog &&
        (logging ? (
          <ISaw
            shop={shop}
            wanted={wanted}
            onDone={(m) => {
              setLogging(false)
              setMsg(m)
            }}
          />
        ) : (
          <Button size="sm" variant="outline" className="self-start" onClick={() => (setMsg(''), setLogging(true))}>
            I saw…
          </Button>
        ))}
    </Fieldset>
  )
}

// I saw…: the wanted records this shop had, and the day (today unless you say)
function ISaw({ shop, wanted, onDone }: { shop: Shop; wanted: Rec[]; onDone: (msg: string) => void }) {
  const { mutate } = useRuntime()
  const [picked, setPicked] = useState<string[]>([])
  const [d, setD] = useState(today())
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    let n = 0
    for (const id of picked) if (await mutate(id, (latest) => addSighting(latest, { shop: shop.name, d }, [shop]))) n++
    setBusy(false)
    onDone(n ? `Logged ${n} record${n === 1 ? '' : 's'} seen at ${shop.name}.` : '')
  }
  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-labelledby="iSawQ" className="flex flex-col gap-2">
        <p id="iSawQ" className="text-foreground-muted text-sm">
          Which records you want did they have?
        </p>
        {wanted.map((r) => (
          <label key={r.id} className="text-foreground flex items-start gap-2 text-sm break-words">
            <Checkbox
              checked={picked.includes(r.id)}
              onCheckedChange={(v) => setPicked((p) => (v ? [...p, r.id] : p.filter((x) => x !== r.id)))}
            />
            <span>
              {r.title || 'Untitled'}
              {r.artist && <span className="text-foreground-muted"> · {r.artist}</span>}
            </span>
          </label>
        ))}
      </div>
      <Field>
        <FieldLabel>When</FieldLabel>
        <DateField value={toDate(d)} onValueChange={(x) => setD(fromDate(x) || d)} />
      </Field>
      <div className="flex gap-3">
        <Button size="sm" disabled={busy || !picked.length} onClick={save}>
          {picked.length > 1 ? `Log ${picked.length} records` : 'Log it'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onDone('')}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
