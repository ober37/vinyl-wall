import { useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { DateField } from '@appica/ui-react/date-field'
import { Field, FieldDescription, FieldLabel } from '@appica/ui-react/field'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Input } from '@appica/ui-react/input'
import { Textarea } from '@appica/ui-react/textarea'
import { copyHas, copyTitle, emptyCopy, type Copy } from '../model/copies'
import { fromDate, toDate } from '../model/dates'
import type { Form } from '../model/edit'
import { shopHref, type Kind } from '../model/record'
import { Confirm } from './Confirm'

type Ph = { name: string; pressing: string; label: string; catalog: string }
const FIRST: Ph = { name: 'e.g. MoFi one-step', pressing: 'e.g. 2015 Mobile Fidelity UD1S, or any original 6-eye', label: 'e.g. Columbia', catalog: 'e.g. CS 8163' }
const ORDERED: Ph = { ...FIRST, pressing: 'e.g. 2024 indie-store colored vinyl' }
const MORE: Ph = { name: 'e.g. UK first', pressing: 'e.g. 1969 UK Apple first pressing', label: 'e.g. Apple', catalog: 'e.g. PCS 7088' }

const AutoMark = () => <span className="text-primary ms-1.5 font-mono text-[0.625rem] tracking-wider uppercase">auto-filled</span>

// a copy's links, one a line. A line that won't link is said once the box is left, not while it's still being typed
function BuyLinks({ c, on }: { c: Copy; on: (v: string) => void }) {
  const [left, setLeft] = useState(false)
  const bad = left ? c.buyLinks.find((u) => u.trim() && !shopHref(u))?.trim() : undefined
  return (
    <Field className="sm:col-span-2" invalid={!!bad}>
      <FieldLabel>Where to buy</FieldLabel>
      <Textarea
        rows={2}
        value={c.buyLinks.join('\n')}
        onChange={(e) => {
          setLeft(false)
          on(e.target.value)
        }}
        onBlur={() => setLeft(true)}
        className="field-sizing-content"
        autoCapitalize="off"
        autoComplete="off"
        placeholder="One link per line, e.g. https://www.roughtrade.com/…"
      />
      {bad && <FieldDescription>“{bad}” isn't a web address, so it won't link</FieldDescription>}
    </Field>
  )
}

// one copy's fields: Name and Budget, Pressing across, Label and Catalog no., then a pre-order's release date and where to
// buy it (not on the copy ordered, which has the order's Expected)
function CopyFields({ c, ph, on, auto, focus, links }: {
  c: Copy
  ph: Ph
  on: (k: keyof Copy, v: string) => void
  auto?: string[]
  focus?: boolean
  links?: boolean
}) {
  const text = (k: 'name' | 'label' | 'catalog', label: string, mono = false) => (
    <Field>
      <FieldLabel>
        {label}
        {k === 'label' && auto?.includes('label') && <AutoMark />}
      </FieldLabel>
      <Input value={c[k]} onChange={(e) => on(k, e.target.value)} placeholder={ph[k]} className={mono ? 'font-mono' : undefined} autoFocus={k === 'name' && focus} />
    </Field>
  )
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {text('name', 'Name')}
      <Field>
        <FieldLabel>Budget</FieldLabel>
        <Input
          value={c.budget}
          onChange={(e) => on('budget', e.target.value)}
          inputMode="decimal"
          placeholder="e.g. 60"
          startSlot={<span aria-hidden="true">$</span>}
          className="font-mono"
        />
      </Field>
      <Field className="sm:col-span-2">
        <FieldLabel>Pressing</FieldLabel>
        <Textarea rows={2} value={c.pressing} onChange={(e) => on('pressing', e.target.value)} placeholder={ph.pressing} />
      </Field>
      {text('label', 'Label')}
      {text('catalog', 'Catalog no.', true)}
      {links && (
        <Field className="sm:col-start-1">
          <FieldLabel>Release date</FieldLabel>
          <DateField value={toDate(c.releaseDate)} onValueChange={(d) => on('releaseDate', fromDate(d))} />
        </Field>
      )}
      {links && <BuyLinks c={c} on={(v) => on('buyLinks', v)} />}
    </div>
  )
}

const FLAT: Record<keyof Copy, keyof Form> = {
  name: 'copyName', pressing: 'pressing', label: 'label', catalog: 'catalog', budget: 'budget', discogsId: 'discogsId', buyLinks: 'buyLinks', releaseDate: 'releaseDate',
}
export const firstOf = (f: Form): Copy => ({
  name: f.copyName ?? '', pressing: f.pressing ?? '', label: f.label ?? '', catalog: f.catalog ?? '', budget: f.budget ?? '', discogsId: f.discogsId ?? '',
  buyLinks: f.buyLinks ?? [],
  releaseDate: f.releaseDate ?? '',
})
const asFlat = (c: Copy): Partial<Form> => Object.fromEntries(Object.entries(c).map(([k, v]) => [FLAT[k as keyof Copy], v]))

// Edit mode's copies, as production's edit form has them. A hunt's copies are one group, the first in the record's own
// fields; an ordered record's first copy is the one ordered; owned and ordered records list the copies still wanted
// after, only while there are any. Removing a hunt's only copy clears it back to a blank one; a new record shows only the
// first.
export function CopiesEdit({ form, kind, change, isNew, auto, focusCopy }: {
  form: Form
  kind: Kind
  change: (p: Partial<Form>, now?: boolean) => void
  isNew?: boolean
  auto?: string[]
  // a copy to put the cursor in (one just added)
  focusCopy?: number | null
}) {
  const [added, setAdded] = useState<number | null>(null)
  const [confirm, setConfirm] = useState<number | null>(null)
  const more = form.moreCopies ?? []
  const wish = kind === 'wish'
  const all = isNew ? [firstOf(form)] : [firstOf(form), ...more]
  const focus = added ?? focusCopy ?? null

  // the links box's text is kept a line each, blank lines too, so typing a new line works
  const val = (k: keyof Copy, v: string) => (k === 'buyLinks' ? v.split('\n') : v)
  const setFirst = (k: keyof Copy, v: string) => change({ [FLAT[k]]: val(k, v) })
  const setMore = (i: number, k: keyof Copy, v: string) => change({ moreCopies: more.map((c, j) => (j === i - 1 ? { ...c, [k]: val(k, v) } : c)) })
  const add = () => {
    setAdded(more.length + 1)
    change({ moreCopies: [...more, emptyCopy()] }, true)
  }
  // removing a hunt's first copy moves the next into the record's own fields
  const remove = (i: number) => {
    setAdded(null)
    if (i === 0) {
      const [next, ...rest] = more
      change({ ...asFlat(next ?? emptyCopy()), moreCopies: rest }, true)
    } else change({ moreCopies: more.filter((_, j) => j !== i - 1) }, true)
  }
  const ask = (i: number) => {
    const c = all[i]
    if (copyHas(c) || c.discogsId) setConfirm(i)
    else remove(i)
  }

  // a hunt's lone copy can be removed once it has something in it
  const canRemove = (i: number) => !isNew && (i > 0 || (wish && (all.length > 1 || copyHas(all[0]) || !!all[0].discogsId)))
  const block = (c: Copy, i: number, ph: Ph) => {
    const fields = (
      <CopyFields
        c={c}
        ph={ph}
        on={(k, v) => (i === 0 ? setFirst(k, v) : setMore(i, k, v))}
        auto={i === 0 ? auto : undefined}
        focus={focus === i}
        links
      />
    )
    // several copies: each under its own title, with Remove beside it
    const titled = wish ? all.length > 1 : true
    if (!titled && !canRemove(i)) return <div key={i}>{fields}</div>
    return (
      <div key={i} className="border-border-subtle flex flex-col gap-3 border-t pt-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-foreground-intense min-w-0 truncate text-sm font-medium">{copyTitle(c, i)}</h4>
          {canRemove(i) && (
            <Button size="sm" variant="ghost" className="text-error-emphasis -me-3 ms-auto shrink-0" onClick={() => ask(i)}>
              Remove this copy
            </Button>
          )}
        </div>
        {fields}
      </div>
    )
  }
  const addBtn = !isNew && (
    <Button size="sm" variant="outline" className="self-start" onClick={add}>
      + Add another copy
    </Button>
  )
  const plural = (n: number, s: string) => (n > 1 ? 'The copies you ' : 'The copy you ') + s

  return (
    <>
      {wish ? (
        <Fieldset>
          <FieldsetLegend>{plural(all.length, 'want')}</FieldsetLegend>
          {all.map((c, i) => block(c, i, i ? MORE : FIRST))}
          {addBtn}
        </Fieldset>
      ) : (
        kind === 'ordered' && (
          <Fieldset>
            <FieldsetLegend>The copy you ordered</FieldsetLegend>
            <CopyFields c={firstOf(form)} ph={ORDERED} on={setFirst} auto={auto} />
          </Fieldset>
        )
      )}
      {!wish && !isNew && more.length > 0 && (
        <Fieldset>
          <FieldsetLegend>{plural(more.length, 'still want')}</FieldsetLegend>
          {more.map((c, j) => block(c, j + 1, MORE))}
          {addBtn}
        </Fieldset>
      )}
      <Confirm
        open={confirm !== null}
        title={confirm !== null ? `Remove ${copyTitle(all[confirm], confirm)} from the copies you want?` : ''}
        yes="Remove"
        onYes={() => confirm !== null && remove(confirm)}
        onClose={() => setConfirm(null)}
      />
    </>
  )
}
