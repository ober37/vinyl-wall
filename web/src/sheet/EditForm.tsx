import { DateField } from '@appica/ui-react/date-field'
import { Field, FieldLabel, FieldDescription } from '@appica/ui-react/field'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Input } from '@appica/ui-react/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@appica/ui-react/select'
import { useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { Textarea } from '@appica/ui-react/textarea'
import type { Form, TextKey } from '../model/edit'
import { GRADES, shopHref, type Kind } from '../model/record'
import { Confirm } from './Confirm'
import { CopiesEdit } from './CopiesEdit'
import { Segmented } from './Segmented'

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
}

// "YYYY-MM-DD" <-> a local Date at noon, so a timezone never moves the day
const toDate = (s: string | undefined) => (s && /^\d{4}-\d\d-\d\d$/.test(s) ? new Date(s + 'T12:00') : null)
const fromDate = (d: Date | null) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : ''

// Base UI's Select needs a non-empty value for "Not graded"
const NONE = '-'

function Text({ k, label, form, set, placeholder, mono, wide, numeric, auto }: {
  k: Key
  label: string
  form: Form
  set: Props['set']
  placeholder?: string
  mono?: boolean
  wide?: boolean
  numeric?: boolean
  auto?: string[]
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

export function EditForm({ form, kind, set, change, title, focusWhy, onStatus, onRemove, isNew, autoFilled, focusCopy }: Props) {
  const p = { form, set, auto: autoFilled }
  const own = kind === 'own'
  const [confirm, setConfirm] = useState(false)
  const shopUrlBad = !!form.shopUrl?.trim() && !shopHref(form.shopUrl)
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
      {!isNew && (
        <Fieldset>
          <FieldsetLegend>The record</FieldsetLegend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Text k="title" label="Album" {...p} />
            <Text k="artist" label="Artist" {...p} />
          </div>
        </Fieldset>
      )}

      <Fieldset>
        <FieldsetLegend>{own ? "Why it's on the wall" : 'Why you want it'}</FieldsetLegend>
        <Textarea
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
      {!own && <CopiesEdit form={form} kind={kind} change={change} isNew={isNew} auto={autoFilled} focusCopy={focusCopy} />}

      {own && (
        <Fieldset>
          <FieldsetLegend>Your copy</FieldsetLegend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2">
              <FieldLabel>Pressing</FieldLabel>
              <Textarea
                rows={2}
                value={form.pressing ?? ''}
                onChange={(e) => set('pressing', e.target.value)}
                placeholder="e.g. 2015 Analogue Productions 45rpm reissue"
              />
            </Field>
            <Field>
              <FieldLabel>Bought on</FieldLabel>
              <DateField value={toDate(form.acquired)} onValueChange={(d) => set('acquired', fromDate(d))} />
            </Field>
            <Field>
              <FieldLabel>Paid</FieldLabel>
              <Input
                value={form.paid ?? ''}
                onChange={(e) => set('paid', e.target.value)}
                inputMode="decimal"
                startSlot={<span aria-hidden="true">$</span>}
                className="font-mono"
              />
            </Field>
            <Text k="shop" label="Bought from" placeholder="e.g. a local record shop" wide {...p} />
            <Field className="sm:col-span-2" invalid={shopUrlBad}>
              <FieldLabel>Shop website</FieldLabel>
              <Input
                value={form.shopUrl ?? ''}
                onChange={(e) => set('shopUrl', e.target.value)}
                type="url"
                autoCapitalize="off"
                autoComplete="off"
                placeholder="e.g. https://www.roughtrade.com"
              />
              {shopUrlBad && <FieldDescription>Not a web address, so it won't link</FieldDescription>}
            </Field>
            <Grade k="mediaGrade" label="Vinyl" {...p} />
            <Grade k="sleeveGrade" label="Sleeve" {...p} />
          </div>
        </Fieldset>
      )}
      {own && !isNew && <CopiesEdit form={form} kind={kind} change={change} auto={autoFilled} />}

      <Fieldset>
        <FieldsetLegend>About the album</FieldsetLegend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Text k="year" label="Year" placeholder="e.g. 1959" mono numeric {...p} />
          <Text k="runtime" label="Runtime (min)" placeholder="e.g. 46" mono numeric {...p} />
          {own && <Text k="label" label="Label" placeholder="e.g. Columbia" {...p} />}
          {own && <Text k="catalog" label="Catalog no." placeholder="e.g. CS 8163" mono {...p} />}
        </div>
      </Fieldset>

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
