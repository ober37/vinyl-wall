import { useState } from 'react'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@appica/ui-react/accordion'
import { Button } from '@appica/ui-react/button'
import { DateField } from '@appica/ui-react/date-field'
import { Field, FieldDescription, FieldLabel } from '@appica/ui-react/field'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Input } from '@appica/ui-react/input'
import { Textarea } from '@appica/ui-react/textarea'
import { copyHas, copyOrdered, copyTitle, emptyCopy, ORDER_KEYS, type Copy } from '../model/copies'
import { fromDate, toDate } from '../model/dates'
import type { Form, TextKey } from '../model/edit'
import { orderState as stateOf } from '../model/orders'
import { shopHref, type Kind, type Rec } from '../model/record'
import { Confirm } from './Confirm'
import { DiscogsFields } from './DiscogsEdit'

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
function CopyFields({ c, ph, on, auto, focus, links, discogs }: {
  c: Copy
  ph: Ph
  on: (k: keyof Copy, v: string) => void
  auto?: string[]
  focus?: boolean
  links?: boolean
  // its Discogs release, last, as an owned copy has it (#121)
  discogs?: React.ReactNode
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
      {discogs}
    </div>
  )
}

// a copy's own fields as the record's (its barcodes aren't edited: a copy moved into first place has its own read again)
const FLAT: Record<Exclude<keyof Copy, 'barcodes'>, keyof Form> = {
  name: 'copyName', pressing: 'pressing', label: 'label', catalog: 'catalog', budget: 'budget', discogsId: 'discogsId', buyLinks: 'buyLinks', releaseDate: 'releaseDate',
  ...(Object.fromEntries(ORDER_KEYS.map((k) => [k, k])) as Record<(typeof ORDER_KEYS)[number], keyof Form>),
}
export const firstOf = (f: Form): Copy => ({
  name: f.copyName ?? '', pressing: f.pressing ?? '', label: f.label ?? '', catalog: f.catalog ?? '', budget: f.budget ?? '', discogsId: f.discogsId ?? '',
  buyLinks: f.buyLinks ?? [],
  releaseDate: f.releaseDate ?? '',
})
const asFlat = (c: Copy): Partial<Form> =>
  Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'barcodes').map(([k, v]) => [FLAT[k as keyof typeof FLAT], v]))

// Edit mode's copies, as production's edit form has them. A hunt's copies are one group, the first in the record's own
// fields; an ordered record's first copy is the one ordered, and the copies on order (#139) follow it (on an owned record
// they're a group of their own, when there are any), each with its Order details and Cancelled, still want it; owned and
// ordered records list the copies still wanted after ("None yet." when there are none). Each copy is a fold under its title (and budget), all folded to start, as Your copies
// are (#121); a copy just added, or one asked for (focusCopy), opens with the cursor in its name, and a new record's one
// copy starts open. Removing a hunt's only copy clears it back to a blank one; a new record shows only the first.
export function CopiesEdit({ form, kind, change, isNew, auto, focusCopy, r, discogs, connected = false, onConnect, order, orderState = '', orderFor, onCancel }: {
  form: Form
  kind: Kind
  change: (p: Partial<Form>, now?: boolean) => void
  isNew?: boolean
  auto?: string[]
  // a copy to put the cursor in (one just added)
  focusCopy?: number | null
  // each copy's Discogs release: the first copy's field as the record's own (with its sync), the others' made here
  r?: Rec
  discogs?: React.ReactNode
  connected?: boolean
  onConnect?: () => void
  // an ordered record's order, its Order details folded at the foot of the copy ordered (#121), and where it's at, shown on
  // the copy's folded row
  order?: React.ReactNode
  orderState?: string
  // a copy's own Order details, edited as the record's are (#139)
  orderFor?: (f: Form, set: (k: TextKey, v: string) => void) => React.ReactNode
  // Cancelled, still want it: an order (0 the record's own) comes off, saved at once
  onCancel?: (ci: number) => void
}) {
  const [confirm, setConfirm] = useState<number | null>(null)
  const more = form.moreCopies ?? []
  const wish = kind === 'wish'
  const all = isNew ? [firstOf(form)] : [firstOf(form), ...more]
  // owned and ordered records: their copies on order (#139) and the ones still wanted, each by its place in all
  const onOrder = all.map((c, i) => [c, i] as const).filter(([c, i]) => i > 0 && copyOrdered(c))
  const wanted = all.map((c, i) => [c, i] as const).filter(([c, i]) => i > 0 && !copyOrdered(c))
  // each copy's fold, kept by a key that stays with the copy as others are added or removed
  const [keys, setKeys] = useState(() => all.map((_, i) => i))
  const [open, setOpen] = useState<string[]>(() => (isNew ? ['0'] : focusCopy != null ? [String(focusCopy)] : []))
  const [added, setAdded] = useState<number | null>(focusCopy ?? null)
  // the copies changed under the form (from chat, or another tab): new keys, all folded
  if (keys.length !== all.length) {
    setKeys(all.map((_, i) => i))
    setOpen([])
    setAdded(null)
  }

  // the links box's text is kept a line each, blank lines too, so typing a new line works
  const val = (k: keyof Copy, v: string) => (k === 'buyLinks' ? v.split('\n') : v)
  const setFirst = (k: keyof Copy, v: string) => k !== 'barcodes' && change({ [FLAT[k]]: val(k, v) })
  const setMore = (i: number, k: keyof Copy, v: string) => change({ moreCopies: more.map((c, j) => (j === i - 1 ? { ...c, [k]: val(k, v) } : c)) })
  const add = () => {
    const k = Math.max(...keys) + 1
    setKeys([...keys, k])
    setOpen([...open, String(k)])
    setAdded(k)
    change({ moreCopies: [...more, emptyCopy()] }, true)
  }
  // removing a hunt's first copy moves the next into the record's own fields
  const remove = (i: number) => {
    setAdded(null)
    if (i > 0 || more.length) setKeys(keys.filter((_, j) => j !== i))
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
  // trail: muted beside the title (a copy wanted's budget, where an order's at)
  const fold = (i: number, title: string, fields: React.ReactNode, trail = '', ordered = false) => (
    <AccordionItem key={keys[i]} value={String(keys[i])}>
      <AccordionTrigger className="text-foreground text-sm font-medium">
        <span className="flex w-full flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <span className="min-w-0">{title}</span>
          {trail && <span className="text-foreground-muted shrink-0 font-normal">{trail}</span>}
        </span>
      </AccordionTrigger>
      {/* room for the fields' focus rings, which the fold's clipping would cut */}
      <AccordionContent className="-mx-1 px-1">
        <div className="flex flex-col gap-4 pt-1 pb-1">
          {fields}
          {ordered && onCancel && (
            <Button size="sm" variant="outline" className="self-start" onClick={() => onCancel(i)}>
              Cancelled, still want it
            </Button>
          )}
          {canRemove(i) && (
            <Button size="sm" variant="ghost" className="text-error-emphasis -ms-3 self-start" onClick={() => ask(i)}>
              Remove this copy
            </Button>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  )
  // a copy after the first: its release, read as the record's would be
  const release = (c: Copy, i: number) =>
    r && (
      <DiscogsFields
        r={{ ...r, discogsId: c.discogsId, discogsMatch: '', discogsSync: {} }}
        form={{ title: '', artist: '', why: '', year: '', runtime: '', discogsId: c.discogsId }}
        change={(p) => 'discogsId' in p && change({ moreCopies: more.map((x, j) => (j === i - 1 ? { ...x, discogsId: p.discogsId ?? '' } : x)) })}
        connected={connected}
        onConnect={onConnect}
      />
    )
  const block = (c: Copy, i: number, ph: Ph) =>
    fold(
      i,
      copyTitle(c, i),
      <CopyFields
        c={c}
        ph={ph}
        on={(k, v) => (i === 0 ? setFirst(k, v) : setMore(i, k, v))}
        auto={i === 0 ? auto : undefined}
        focus={added === keys[i]}
        links
        discogs={i === 0 ? discogs : release(c, i)}
      />,
      c.budget && 'Up to $' + c.budget,
    )
  // a copy's order, after its fields; folded unless it's being entered on a new record (where it's at shows on the copy's row)
  const orderFold = (node: React.ReactNode) => (
    <Accordion variant="flush" defaultValue={isNew ? ['order'] : []}>
      <AccordionItem value="order">
        <AccordionTrigger className="text-foreground text-sm font-medium">Order details</AccordionTrigger>
        <AccordionContent className="-mx-1 px-1">
          <div className="pt-1 pb-1">{node}</div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
  // a copy on order: its fields as the copy ordered has them, its release, then its own Order details
  const orderedBlock = (c: Copy, i: number) =>
    fold(
      i,
      copyTitle(c, i),
      <>
        <CopyFields c={c} ph={ORDERED} on={(k, v) => setMore(i, k, v)} discogs={release(c, i)} />
        {orderFor &&
          orderFold(
            orderFor({ title: '', artist: '', why: '', year: '', runtime: '', ...Object.fromEntries(ORDER_KEYS.map((k) => [k, c[k] ?? ''])) }, (k, v) =>
              setMore(i, k as keyof Copy, v),
            ),
          )}
      </>,
      stateOf({ id: '', orderStatus: c.orderStatus, eta: c.eta }),
      true,
    )
  const folds = (L: React.ReactNode) => (
    <Accordion variant="flush" multiple value={open} onValueChange={(v) => setOpen(v as string[])}>
      {L}
    </Accordion>
  )
  // on a row of its own below the last copy: it's for the group, not that copy. Beside the copies you own, it says these
  // are ones you want
  const addBtn = !isNew && (
    <div className="border-border-subtle border-t pt-4">
      <Button size="sm" variant="outline" onClick={add}>
        {wish ? '+ Add another copy' : wanted.length ? '+ Add another copy you want' : '+ Add a copy you want'}
      </Button>
    </div>
  )
  const plural = (n: number, s: string) => (n > 1 ? 'The copies you ' : 'The copy you ') + s

  return (
    <>
      {wish ? (
        <Fieldset>
          <FieldsetLegend>{plural(all.length, 'want')}</FieldsetLegend>
          {folds(all.map((c, i) => block(c, i, i ? MORE : FIRST)))}
          {addBtn}
        </Fieldset>
      ) : (
        (kind === 'ordered' || (onOrder.length > 0 && !isNew)) && (
          <Fieldset>
            <FieldsetLegend>{plural(onOrder.length + (kind === 'ordered' ? 1 : 0), 'ordered')}</FieldsetLegend>
            {folds([
              ...(kind === 'ordered'
                ? [
                    fold(
                      0,
                      copyTitle(firstOf(form), 0),
                      <>
                        <CopyFields c={firstOf(form)} ph={ORDERED} on={setFirst} auto={auto} discogs={discogs} />
                        {orderFold(order)}
                      </>,
                      orderState,
                      !isNew,
                    ),
                  ]
                : []),
              ...(isNew ? [] : onOrder.map(([c, i]) => orderedBlock(c, i))),
            ])}
          </Fieldset>
        )
      )}
      {/* owned and ordered records always have it, saying when there are none, so wanting another pressing starts here */}
      {!wish && !isNew && (
        <Fieldset>
          <FieldsetLegend>{plural(wanted.length || 2, 'still want')}</FieldsetLegend>
          {wanted.length ? folds(wanted.map(([c, i]) => block(c, i, MORE))) : <p className="text-foreground-muted text-sm">None yet.</p>}
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
