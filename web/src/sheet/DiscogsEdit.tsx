// The runout and the Discogs release in edit, as production's runRow/wireRuns and discogsHTML: the runout side by side, and
// the release number (a pasted link keeps just its number).
import { Button } from '@appica/ui-react/button'
import { Field, FieldLabel, FieldDescription, FieldError } from '@appica/ui-react/field'
import { Input } from '@appica/ui-react/input'
import { useId, useState } from 'react'
import { wantCopies } from '../model/copies'
import { generalMatch, releaseOf, runJoin, runSides, type Sync } from '../model/discogs'
import type { Form } from '../model/edit'
import type { Rec } from '../model/record'

const sidesOf = (m: unknown) => {
  const r = runSides(m)
  return r.length ? r : [{ side: 'A', v: '' }, { side: 'B', v: '' }]
}
// Sides A and B to start with, one more at a time up to Z; empty sides aren't saved
export function Runout({ form, set }: { form: Form; set: (k: 'matrix', v: string) => void }) {
  const [rows, setRows] = useState(() => sidesOf(form.matrix))
  const [focus, setFocus] = useState('')
  const id = useId()
  // the runout changed under the form (from chat, or another tab): show it
  if (runJoin(rows) !== runJoin(runSides(form.matrix))) setRows(sidesOf(form.matrix))
  const last = rows.reduce((a, x) => (x.side > a ? x.side : a), '@')
  const edit = (i: number, v: string) => {
    const next = rows.map((x, j) => (j === i ? { ...x, v } : x))
    setRows(next)
    set('matrix', runJoin(next))
  }
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-2 sm:col-span-2">
      {/* FieldLabel's look; its gap to the first side is the group's */}
      <span id={id} className="text-foreground-intense text-sm font-medium">
        Runout
      </span>
      {rows.map((x, i) => (
        <div key={i} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2">
          <span className="text-foreground-muted font-mono text-xs">Side {x.side}</span>
          <Input
            value={x.v}
            onChange={(e) => edit(i, e.target.value)}
            placeholder="Etched in the dead wax"
            aria-label={'Side ' + x.side}
            autoFocus={focus === x.side}
            className="font-mono placeholder:font-sans"
          />
        </div>
      ))}
      {last < 'Z' && (
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          onClick={() => {
            const side = String.fromCharCode(last.charCodeAt(0) + 1)
            setRows([...rows, { side, v: '' }])
            setFocus(side)
          }}
        >
          + Add side
        </Button>
      )}
    </div>
  )
}

type Props = {
  r: Rec
  form: Form
  change: (p: Partial<Form>) => void
  // Discogs is connected (a token saved); when it isn't, the line offers Settings instead of a sync that won't come
  connected: boolean
  onConnect?: () => void
}

export function DiscogsFields({ r, form, change, connected, onConnect }: Props) {
  const id = form.discogsId ?? ''
  // what's typed while it isn't a release; otherwise the field shows the number (a pasted link becomes it at once)
  const [draft, setDraft] = useState<string | null>(null)
  const bad = draft !== null
  const changed = id !== wantCopies(r)[0].discogsId
  const typed = (v: string) => {
    const n = releaseOf(v)
    setDraft(n === null ? v : null)
    if (n !== null && n !== id) change({ discogsId: n })
  }
  // how the sync is going is the sheet's status line now (#121); under the field, only why it won't sync, or what to do
  // when the last sync found nothing
  const sync = (r.discogsSync || {}) as Sync
  const noMatch = connected && sync.state === 'no-match' && !changed && !r.needsSync
  const line = !connected ? (
    <>
      Connect Discogs in{' '}
      <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={onConnect}>
        Settings
      </button>{' '}
      to sync
    </>
  ) : noMatch ? (
    'Paste the number from its Discogs URL.'
  ) : null
  return (
    <Field className="sm:col-span-2" invalid={bad}>
      <FieldLabel>Discogs release</FieldLabel>
      {/* the link's column only when there's a link, so the field reaches the right edge on phones without it */}
      <div className={`grid items-center gap-4 sm:grid-cols-2 ${id !== '' && !bad ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-1'}`}>
        <Input
          value={draft ?? String(id)}
          onChange={(e) => typed(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          placeholder="Link or release #"
          className="font-mono placeholder:font-sans"
        />
        {id !== '' && !bad && (
          <a
            href={`https://www.discogs.com/release/${id}`}
            target="_blank"
            rel="noopener"
            className="text-primary justify-self-start text-sm underline-offset-2 hover:underline"
          >
            Open on Discogs ↗
          </a>
        )}
      </div>
      {bad ? <FieldError match>Not a release number or link</FieldError> : line && <FieldDescription>{line}</FieldDescription>}
      {!changed && !bad && generalMatch(r.discogsMatch) && (
        <FieldDescription>This points at a general release of the album. Paste the number of your exact pressing when you know it.</FieldDescription>
      )}
    </Field>
  )
}
