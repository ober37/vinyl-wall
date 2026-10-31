import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@appica/ui-react/accordion'
import { DateField } from '@appica/ui-react/date-field'
import { Field, FieldLabel, FieldDescription } from '@appica/ui-react/field'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Input } from '@appica/ui-react/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@appica/ui-react/select'
import { useRef, useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { Textarea } from '@appica/ui-react/textarea'
import { fromDate, toDate } from '../model/dates'
import type { Form, TextKey } from '../model/edit'
import { GRADES, OSTAT, shopHref, type Kind, type Rec } from '../model/record'
import { orderState } from '../model/orders'
import { copyRec, emptyOwned, gradeShort, moreOwned, ownedTitle, type OwnCopy } from '../model/owned'
import { Confirm } from './Confirm'
import { CopiesEdit } from './CopiesEdit'
import { DiscogsFields, Runout } from './DiscogsEdit'
import { Segmented } from './Segmented'
import { ShopInput } from './ShopInput'
import { sameSite, shopSite, shopsOf } from '../model/shops'
import { useRuntime } from '../runtime/runtime'

type Key = TextKey
type Props = {
  form: Form
  kind: Kind
  set: (k: Key, v: string) => void
  // several fields at once (a copy added or removed), saved now when asked
  change: (p: Partial<Form>, now?: boolean) => void
  title: string
  focusWhy: boolean
  // null when the status can't be changed here (a hunt with more than one copy)
  onStatus: ((to: Kind) => void) | null
  onRemove: () => void
  // the new-record sheet's "Add details now": no status, album, artist or Remove (the sheet has its own)
  isNew?: boolean
  // fields the lookup filled in (marked "auto-filled" until typed over), and whether a lookup is under way
  autoFilled?: string[]
  // a copy to put the cursor in (one added from Research)
  focusCopy?: number | null
  // the record as stored, for its Discogs sync line (not on the new-record sheet)
  r?: Rec
  // Discogs is connected, and the way to Settings when it isn't
  connected?: boolean
  onConnect?: () => void
  // Cancelled, still want it, on an order (0 the record's own, else a copy's index in wantCopies), saved at once (#139)
  onCancel?: (ci: number) => void
}


// Base UI's Select needs a non-empty value for "Not graded"
const NONE = '-'

function Text({ k, label, form, set, placeholder, mono, wide, numeric, auto, autoFocus }: {
  k: Key
  label: string
  form: Form
  set: Props['set']
  placeholder?: string
  mono?: boolean
  wide?: boolean
  numeric?: boolean
  auto?: string[]
  autoFocus?: boolean
}) {
  return (
    <Field className={wide ? 'sm:col-span-2' : undefined}>
      <FieldLabel>
        {label}
        {auto?.includes(k) && <span className="text-primary ms-1.5 font-mono text-[0.625rem] tracking-wider uppercase">auto-filled</span>}
      </FieldLabel>
      <Input
        value={form[k] ?? ''}
        onChange={(e) => set(k, e.target.value)}
        placeholder={placeholder}
        inputMode={numeric ? 'numeric' : undefined}
        className={mono ? 'font-mono' : undefined}
        autoFocus={autoFocus}
      />
    </Field>
  )
}

function Grade({ k, label, form, set }: { k: Key; label: string; form: Form; set: Props['set'] }) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        value={form[k] || NONE}
        onValueChange={(v) => set(k, v === NONE ? '' : String(v))}
        items={GRADES.map(([value, label]) => ({ value: value || NONE, label }))}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {GRADES.map(([v, l]) => (
            <SelectItem key={v || NONE} value={v || NONE}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

function Paid({ form, set, placeholder }: { form: Form; set: Props['set']; placeholder?: string }) {
  return (
    <Field>
      <FieldLabel>Paid</FieldLabel>
      <Input
        value={form.paid ?? ''}
        onChange={(e) => set('paid', e.target.value)}
        inputMode="decimal"
        placeholder={placeholder}
        startSlot={<span aria-hidden="true">$</span>}
        className="font-mono placeholder:font-sans"
      />
    </Field>
  )
}

// where it came from, suggesting your shops (#99)
function ShopField({ label, form, set, placeholder }: { label: string; form: Form; set: Props['set']; placeholder: string }) {
  const { settings } = useRuntime()
  return (
    <Field className="sm:col-span-2">
      <FieldLabel>{label}</FieldLabel>
      <ShopInput
        value={form.shop ?? ''}
        onChange={(v) => set('shop', v)}
        // the shop's website, unless the record's link is already at it (a product page there)
        onPick={(n) => {
          const site = shopSite(shopsOf(settings), n)
          if (site && !sameSite(form.shopUrl, site)) set('shopUrl', site)
        }}
        placeholder={placeholder}
      />
    </Field>
  )
}

function ShopUrl({ form, set, placeholder }: { form: Form; set: Props['set']; placeholder: string }) {
  // said once the field is left, not while the address is still being typed
  const [left, setLeft] = useState(false)
  const bad = left && !!form.shopUrl?.trim() && !shopHref(form.shopUrl)
  return (
    <Field className="sm:col-span-2" invalid={bad}>
      <FieldLabel>Shop website</FieldLabel>
      <Input
        value={form.shopUrl ?? ''}
        onChange={(e) => {
          setLeft(false)
          set('shopUrl', e.target.value)
        }}
        onBlur={() => setLeft(true)}
        type="url"
        autoCapitalize="off"
        autoComplete="off"
        placeholder={placeholder}
      />
      {bad && <FieldDescription>Not a web address, so it won't link</FieldDescription>}
    </Field>
  )
}

function DateIn({ k, label, form, set }: { k: Key; label: string; form: Form; set: Props['set'] }) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <DateField value={toDate(form[k])} onValueChange={(d) => set(k, fromDate(d))} />
    </Field>
  )
}

// one owned copy's fields: Name, Pressing across, where and when it was bought, grades, Label and Catalog no., runout and
// its Discogs release; album: on a copy after the first, the album's runtime, beside which the copy's own can be typed (#138)
function OwnedFields({ form, set, discogs, auto, focus, album }: {
  form: Form
  set: Props['set']
  discogs: React.ReactNode
  auto?: string[]
  focus?: boolean
  album?: string
}) {
  const p = { form, set }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Text k="copyName" label="Name" placeholder="e.g. Sealed, or Player" wide autoFocus={focus} {...p} />
      <Field className="sm:col-span-2">
        <FieldLabel>Pressing</FieldLabel>
        <Textarea
          className="field-sizing-content max-h-80"
          rows={2}
          value={form.pressing ?? ''}
          onChange={(e) => set('pressing', e.target.value)}
          placeholder="e.g. 2015 Analogue Productions 45rpm reissue"
        />
      </Field>
      <DateIn k="acquired" label="Bought on" {...p} />
      <Paid {...p} />
      <ShopField label="Bought from" placeholder="e.g. a local record shop" {...p} />
      <ShopUrl placeholder="e.g. https://www.roughtrade.com" {...p} />
      <Grade k="mediaGrade" label="Vinyl" {...p} />
      <Grade k="sleeveGrade" label="Sleeve" {...p} />
      <Text k="label" label="Label" placeholder="e.g. Columbia" auto={auto} {...p} />
      <Text k="catalog" label="Catalog no." placeholder="e.g. CS 8163" mono {...p} />
      {album !== undefined && <Text k="runtime" label="Runtime (min)" placeholder={album ? album + " (the album's)" : 'e.g. 46'} mono numeric {...p} />}
      <Runout form={form} set={set} />
      {discogs}
    </div>
  )
}

// an owned copy after the first as the form's fields, so OwnedFields edits it as it does the first
const OWN_FORM: Record<Exclude<keyof OwnCopy, 'discogsId' | 'barcodes' | 'releaseTracks'>, Key> = {
  name: 'copyName', pressing: 'pressing', label: 'label', catalog: 'catalog', matrix: 'matrix', mediaGrade: 'mediaGrade', sleeveGrade: 'sleeveGrade',
  paid: 'paid', shop: 'shop', shopUrl: 'shopUrl', acquired: 'acquired', runtime: 'runtime',
}
const asForm = (c: OwnCopy): Form => ({
  title: '', artist: '', why: '', year: '', runtime: '', discogsId: c.discogsId,
  ...Object.fromEntries(Object.entries(OWN_FORM).map(([k, f]) => [f, c[k as keyof typeof OWN_FORM]])),
})
const fromForm = (k: Key) => Object.entries(OWN_FORM).find(([, f]) => f === k)?.[0] as keyof typeof OWN_FORM | undefined

// Your copy, or Your copies (#121): the first in the record's own fields, the others in ownedCopies, each under its title
// with Remove this copy; + Add another copy you own (not on a new record). Removing the first moves the next into its place.
function YourCopiesEdit({ form, set, auto, change, r, isNew, discogs, connected, onConnect }: {
  form: Form
  set: Props['set']
  auto?: string[]
  change: Props['change']
  r?: Rec
  isNew?: boolean
  discogs: React.ReactNode
  connected: boolean
  onConnect?: () => void
}) {
  const [confirm, setConfirm] = useState<number | null>(null)
  const more = form.ownedCopies ?? []
  // each copy's fold, kept by a key that stays with the copy as others are added or removed; all folded to start, and a
  // copy just added opens with the cursor in its name
  const [keys, setKeys] = useState(() => [0, ...more.map((_, j) => j + 1)])
  // (on a new record the copy is what's being filled in, so it starts open)
  const [open, setOpen] = useState<string[]>(isNew ? ['0'] : [])
  const [added, setAdded] = useState<number | null>(null)
  // the copies changed under the form (from chat, or another tab): new keys, all folded
  if (keys.length !== more.length + 1) {
    setKeys([0, ...more.map((_, j) => j + 1)])
    setOpen([])
  }
  const stored = r ? moreOwned(r) : []
  const titles = [ownedTitle(form as Rec, 0), ...more.map((c, j) => ownedTitle(copyRec(r ?? { id: '' }, c), j + 1))]
  // two changes in one event (a shop picked: its name, then its website) build on each other, not on this render's copies
  const latest = useRef(more)
  latest.current = more
  const setMore = (j: number, c: Partial<OwnCopy>) => {
    latest.current = latest.current.map((x, i) => (i === j ? { ...x, ...c } : x))
    change({ ownedCopies: latest.current })
  }
  const add = () => {
    const k = Math.max(...keys) + 1
    setKeys([...keys, k])
    setOpen([...open, String(k)])
    setAdded(k)
    change({ ownedCopies: [...more, emptyOwned()] }, true)
  }
  const remove = (i: number) => {
    setKeys(keys.filter((_, j) => j !== i))
    setAdded(null)
    if (i > 0) return change({ ownedCopies: more.filter((_, j) => j !== i - 1) }, true)
    const [next, ...rest] = more
    change({ ...asForm(next), title: form.title, artist: form.artist, why: form.why, year: form.year, runtime: form.runtime, ownedCopies: rest }, true)
  }
  const has = (i: number) => {
    const f = i ? asForm(more[i - 1]) : form
    return [...Object.values(OWN_FORM).map((k) => f[k]), f.discogsId].some(Boolean)
  }
  const ask = (i: number) => (has(i) ? setConfirm(i) : remove(i))
  const several = more.length > 0
  // each copy a fold under its title and grades, one too, so what belongs to it is clear; Remove at the foot of the open
  // fold, only while there are several (removing your only copy is a status change)
  const grades = [gradeShort(form as Rec), ...more.map((c) => gradeShort(c as unknown as Rec))]
  const block = (i: number, fields: React.ReactNode) => (
    <AccordionItem key={keys[i]} value={String(keys[i])}>
      <AccordionTrigger className="text-foreground text-sm font-medium">
        <span className="flex w-full flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <span className="min-w-0">{titles[i]}</span>
          {grades[i] && <span className="text-foreground-muted shrink-0 font-normal">{grades[i]}</span>}
        </span>
      </AccordionTrigger>
      {/* room for the fields' focus rings, which the fold's clipping would cut (as Listening's folds do) */}
      <AccordionContent className="-mx-1 px-1">
        <div className="flex flex-col gap-4 pt-1 pb-1">
          {fields}
          {several && (
            <Button size="sm" variant="ghost" className="text-error-emphasis -ms-3 self-start" onClick={() => ask(i)}>
              Remove this copy
            </Button>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  )
  return (
    <Fieldset>
      <FieldsetLegend>{several ? 'Your copies' : 'Your copy'}</FieldsetLegend>
      <Accordion variant="flush" multiple value={open} onValueChange={(v) => setOpen(v as string[])}>
        {block(0, <OwnedFields form={form} set={set} discogs={discogs} auto={auto} />)}
        {more.map((c, j) => {
          const cf = asForm(c)
          const setC = (k: Key, v: string) => {
            const f = fromForm(k)
            if (f) setMore(j, { [f]: v })
          }
          // its release line reads the copy as stored, beside what's typed
          const disc = r && (
            <DiscogsFields
              r={copyRec(r, stored[j] ?? emptyOwned())}
              form={cf}
              change={(p) => 'discogsId' in p && setMore(j, { discogsId: p.discogsId ?? '' })}
              connected={connected}
              onConnect={onConnect}
              />
          )
          return block(j + 1, <OwnedFields form={cf} set={setC} discogs={disc} focus={added === keys[j + 1]} album={form.runtime} />)
        })}
      </Accordion>
      {/* on a row of its own below the last copy: it's for the group, not that copy */}
      {!isNew && (
        <div className="border-border-subtle border-t pt-4">
          <Button size="sm" variant="outline" onClick={add}>
            + Add another copy you own
          </Button>
        </div>
      )}
      <Confirm
        open={confirm !== null}
        title={confirm === null ? '' : `Remove ${titles[confirm]} from your copies?`}
        yes="Remove"
        onYes={() => confirm !== null && remove(confirm)}
        onClose={() => setConfirm(null)}
      />
    </Fieldset>
  )
}

const ORDER_STATES = Object.entries(OSTAT)
// an ordered record's order, the fields updated most first: where it's at, where it's from, what it cost, how to track it.
// It sits in the ordered copy's fold, as its Order details (#121)
function OrderFields(p: { form: Form; set: Props['set'] }) {
  const { form, set } = p
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel>Order status</FieldLabel>
        <Select
          value={form.orderStatus || 'ordered'}
          onValueChange={(v) => set('orderStatus', String(v))}
          items={ORDER_STATES.map(([value, label]) => ({ value, label }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORDER_STATES.map(([v, l]) => (
              <SelectItem key={v} value={v}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <DateIn k="eta" label="Expected" {...p} />
      <ShopField label="From" placeholder="e.g. the band's webstore, a Discogs seller" {...p} />
      <ShopUrl placeholder="e.g. https://yourband.bandcamp.com" {...p} />
      <Paid placeholder="incl. shipping" {...p} />
      <DateIn k="orderDate" label="Ordered on" {...p} />
      <Text k="orderNum" label="Order #" mono {...p} />
      <Text k="carrier" label="Carrier" placeholder="e.g. UPS" {...p} />
      <Field className="sm:col-span-2">
        <FieldLabel>Tracking #</FieldLabel>
        <Input
          value={form.tracking ?? ''}
          onChange={(e) => set('tracking', e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          className="font-mono"
        />
      </Field>
      {form.orderNotes !== undefined && (
        <Field className="sm:col-span-2">
          <FieldLabel>Order notes</FieldLabel>
          <Textarea className="field-sizing-content max-h-80" rows={2} value={form.orderNotes} onChange={(e) => set('orderNotes', e.target.value)} />
        </Field>
      )}
    </div>
  )
}

export function EditForm({ form, kind, set, change, title, focusWhy, onStatus, onRemove, isNew, autoFilled, focusCopy, r, connected, onConnect, onCancel }: Props) {
  const p = { form, set, auto: autoFilled }
  const own = kind === 'own'
  const [confirm, setConfirm] = useState(false)
  const discogs = !isNew && r && (
    <DiscogsFields r={r} form={form} change={change} connected={!!connected} onConnect={onConnect} />
  )
  return (
    <div className="flex flex-col gap-8">
      {onStatus && !isNew && (
        <Fieldset>
          <FieldsetLegend>Status</FieldsetLegend>
          <Segmented
            label="Status"
            value={kind}
            onChange={onStatus}
            options={[
              ['own', 'Owned'],
              ['ordered', 'Ordered'],
              ['wish', 'Wanted'],
            ]}
          />
        </Fieldset>
      )}
      {/* the album's own facts, beside its name (#121): the year it came out and how long it runs, whatever the copy (a new
          record's sheet has its own album and artist) */}
      <Fieldset>
        <FieldsetLegend>The record</FieldsetLegend>
        <div className="grid gap-4 sm:grid-cols-2">
          {!isNew && <Text k="title" label="Album" {...p} />}
          {!isNew && <Text k="artist" label="Artist" {...p} />}
          <Text k="year" label="Year released" placeholder="e.g. 1959" mono numeric {...p} />
          <Text k="runtime" label="Runtime (min)" placeholder={r?.needsEnrich ? 'Looking it up…' : 'e.g. 46'} mono numeric {...p} />
        </div>
      </Fieldset>

      <Fieldset>
        <FieldsetLegend>{own ? "Why it's on the wall" : 'Why you want it'}</FieldsetLegend>
        <Textarea
          className="field-sizing-content max-h-80"
          aria-label="Why"
          rows={3}
          autoFocus={focusWhy}
          value={form.why}
          onChange={(e) => set('why', e.target.value)}
          placeholder={
            own
              ? 'What makes this one special front to back: a favorite side, the track that hooked you, where you first heard it.'
              : 'What drew you to it: the track that hooked you, a show, who recommended it.'
          }
        />
      </Fieldset>

      {kind === 'wish' && (
        <Fieldset>
          <FieldsetLegend>Priority</FieldsetLegend>
          <Segmented
            label="Priority"
            value={form.priority ?? '2'}
            onChange={(v) => set('priority', v)}
            options={[
              ['1', 'Top'],
              ['2', 'Want'],
              ['3', 'Someday'],
            ]}
          />
        </Fieldset>
      )}
      {!own && (
        <CopiesEdit
          form={form}
          kind={kind}
          change={change}
          isNew={isNew}
          auto={autoFilled}
          focusCopy={focusCopy}
          r={r}
          discogs={discogs}
          connected={!!connected}
          onConnect={onConnect}
          order={kind === 'ordered' && <OrderFields {...p} />}
          orderState={kind === 'ordered' ? orderState({ id: '', orderStatus: form.orderStatus, eta: form.eta }) : ''}
          orderFor={(f, s) => <OrderFields form={f} set={s} />}
          onCancel={onCancel}
        />
      )}

      {own && <YourCopiesEdit {...p} r={r} change={change} isNew={isNew} discogs={discogs} connected={!!connected} onConnect={onConnect} />}
      {own && !isNew && (
        <CopiesEdit
          form={form}
          kind={kind}
          change={change}
          auto={autoFilled}
          r={r}
          connected={!!connected}
          onConnect={onConnect}
          orderFor={(f, s) => <OrderFields form={f} set={s} />}
          onCancel={onCancel}
        />
      )}

      {!isNew && (
        <>
          <Button variant="outline" size="sm" className="self-start" onClick={() => setConfirm(true)}>
            Remove from the wall…
          </Button>
          <Confirm
            open={confirm}
            title={`Remove ${title} and its notes for good?`}
            yes="Remove"
            onYes={onRemove}
            onClose={() => setConfirm(false)}
          />
        </>
      )}
    </div>
  )
}
