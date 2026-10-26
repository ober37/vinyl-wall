import { useRef, useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@appica/ui-react/collapsible'
import { Field, FieldLabel, FieldDescription } from '@appica/ui-react/field'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Input } from '@appica/ui-react/input'
import { Textarea } from '@appica/ui-react/textarea'
import { useDebouncedSave } from '../gear/useDebouncedSave'
import { kindOf } from '../model/record'
import { KINDS, shopLink, shopsOf, shopWhere, siteUrl, type Shop, type ShopKind } from '../model/shops'
import { useRuntime } from '../runtime/runtime'
import { Confirm } from '../sheet/Confirm'
import { Chevron, link } from '../sheet/Links'
import { Segmented } from '../sheet/Segmented'

const GROUPS: [ShopKind, string][] = [
  ['local', 'Local shops'],
  ['online', 'Online shops'],
  ['market', 'Marketplaces'],
]
type Draft = { name: string; kind: ShopKind; url: string; search: string; place: string; phone: string; email: string; about: string }
const draftOf = (s: Shop): Draft => ({
  name: s.name, kind: s.kind, url: s.url || '', search: s.search || '', place: s.place || '', phone: s.phone || '', email: s.email || '', about: s.about || '',
})
const okSearch = (v: string) => /^https:\/\/\S+$/i.test(v.trim()) && v.includes('{q}')
// what a draft stores: a name always (the last one when it's cleared), links only when they work, contact only for local
function fromDraft(d: Draft, was: Shop): Shop {
  const s: Shop = { id: was.id, name: d.name.trim() || was.name, kind: d.kind }
  const url = siteUrl(d.url)
  if (url.startsWith('https:')) s.url = url
  if (okSearch(d.search)) s.search = d.search.trim()
  if (d.kind === 'local') for (const k of ['place', 'phone', 'email', 'about'] as const) if (d[k].trim()) s[k] = d[k].trim()
  return s
}

// a shop as a folded row: its name and town or domain, opening to its details, which save as they're typed
function ShopRow({ shop, open, onOpenChange, save, onRemove, sample }: {
  shop: Shop
  open: boolean
  onOpenChange: (o: boolean) => void
  save: (s: Shop) => Promise<boolean>
  onRemove: () => void
  sample: { artist: string; title: string }
}) {
  const [d, setD] = useState(() => draftOf(shop))
  const [saved, setSaved] = useState('')
  const live = useRef(d)
  live.current = d
  const { schedule } = useDebouncedSave(() => save(fromDraft(live.current, shop)).then((ok) => setSaved(ok ? 'Saved' : '')), setSaved, 500)
  const set = (k: keyof Draft, v: string) => {
    setD((x) => ({ ...x, [k]: v }))
    schedule()
  }
  const where = shopWhere(shop)
  const tryIt = okSearch(d.search) ? shopLink({ ...shop, search: d.search.trim() }, sample) : ''
  const field = (k: keyof Draft, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input value={d[k]} onChange={(e) => set(k, e.target.value)} {...props} />
    </Field>
  )
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger className="group flex w-full cursor-pointer items-baseline gap-3 rounded-md text-start outline-offset-2 focus-visible:outline-2 focus-visible:outline-(--focus-ring)">
        <span className="min-w-0 flex-1 text-sm break-words">
          <span className="text-foreground-intense">{shop.name}</span>
          {where && <span className="text-foreground-muted"> · {where}</span>}
        </span>
        <span className="text-primary flex shrink-0 items-center gap-1 self-center text-sm">
          {open ? 'Done' : 'Edit'}
          <Chevron />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="transition-none">
        <div className="flex flex-col gap-4 pt-4 pb-2">
          <span role="status" className="text-foreground-muted -mb-2 text-xs empty:hidden">
            {saved}
          </span>
          {field('name', 'Name', { maxLength: 80 })}
          <Segmented label="Kind" value={d.kind} options={KINDS} onChange={(v) => set('kind', v)} />
          {field('url', d.kind === 'local' ? 'Web store' : 'Website', { inputMode: 'url', placeholder: 'shop.example.com' })}
          <Field>
            <FieldLabel>Search link (Claude can fill this in)</FieldLabel>
            <Input value={d.search} inputMode="url" onChange={(e) => set('search', e.target.value)} />
            <FieldDescription>
              {d.search.trim() && !tryIt ? (
                'Needs to start with https:// and have {q} where the artist and album go.'
              ) : tryIt ? (
                <a href={tryIt} target="_blank" rel="noopener" className={link}>
                  Try it with {sample.title} ↗
                </a>
              ) : (
                'The shop’s search, with {q} where the artist and album go.'
              )}
            </FieldDescription>
          </Field>
          {d.kind === 'local' && (
            <>
              {field('place', 'Address')}
              <div className="grid gap-4 sm:grid-cols-2">
                {field('phone', 'Phone', { inputMode: 'tel' })}
                {field('email', 'Email', { inputMode: 'email' })}
              </div>
              <Field>
                <FieldLabel>About</FieldLabel>
                <Textarea rows={2} maxLength={400} value={d.about} onChange={(e) => set('about', e.target.value)} />
              </Field>
            </>
          )}
          <Button size="sm" variant="ghost" className="text-error-emphasis -ms-3 self-start" onClick={onRemove}>
            Remove this shop
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function AddShop({ onAdd, onCancel }: { onAdd: (s: Shop) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ShopKind>('local')
  const [url, setUrl] = useState('')
  const add = () => {
    const u = siteUrl(url)
    onAdd({ id: Math.random().toString(36).slice(2, 12), name: name.trim().slice(0, 80), kind, ...(u.startsWith('https:') ? { url: u } : {}) })
  }
  return (
    <form
      className="border-border flex flex-col gap-4 rounded-md border p-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) add()
      }}
    >
      <Field>
        <FieldLabel>Name</FieldLabel>
        <Input autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Segmented label="Kind" value={kind} options={KINDS} onChange={setKind} />
      <Field>
        <FieldLabel>Website</FieldLabel>
        <Input value={url} inputMode="url" placeholder="shop.example.com" onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <div className="flex gap-3">
        <Button size="sm" type="submit" disabled={!name.trim()}>
          Add shop
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

// Settings → Shops: your shops by kind, A to Z, one open at a time, with + Add a shop at the end
export function ShopsSection() {
  const { settings, saveSettings, records } = useRuntime()
  const shops = shopsOf(settings)
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Shop | null>(null)
  const latest = useRef(settings)
  latest.current = settings
  // a change writes the whole list, read from the latest settings so a change elsewhere isn't lost
  const write = (fn: (list: Shop[]) => Shop[]) => saveSettings({ shops: fn(shopsOf(latest.current)) })
  // Try it searches for a record on the wall, a wanted one first
  const live = records.filter((r) => !r.deleted && !r.example && r.title)
  const pick = live.find((r) => kindOf(r) === 'wish') || live[0]
  const sample = pick ? { artist: String(pick.artist || ''), title: String(pick.title) } : { artist: 'Pearl Jam', title: 'Ten' }
  return (
    <div className="flex flex-col gap-8">
      <p className="text-foreground-muted text-sm">
        Search elsewhere on a record, and research in your Claude chat, look at these shops first, local ones first.
      </p>
      {GROUPS.map(([k, title]) => {
        const list = shops.filter((s) => s.kind === k).sort((a, b) => a.name.localeCompare(b.name))
        return (
          list.length > 0 && (
            <Fieldset key={k}>
              <FieldsetLegend>{title}</FieldsetLegend>
              <div className="flex flex-col gap-4">
                {list.map((s) => (
                  <ShopRow
                    key={s.id}
                    shop={s}
                    open={openId === s.id}
                    onOpenChange={(o) => setOpenId(o ? s.id : null)}
                    save={(n) => write((all) => all.map((x) => (x.id === n.id ? n : x)))}
                    onRemove={() => setRemoving(s)}
                    sample={sample}
                  />
                ))}
              </div>
            </Fieldset>
          )
        )
      })}
      {!shops.length && <p className="text-foreground-muted text-sm">No shops yet.</p>}
      {adding ? (
        <AddShop
          onCancel={() => setAdding(false)}
          onAdd={(s) => {
            write((all) => [...all, s])
            setAdding(false)
          }}
        />
      ) : (
        <Button size="sm" variant="outline" className="self-start" onClick={() => setAdding(true)}>
          + Add a shop
        </Button>
      )}
      <Confirm
        open={removing !== null}
        title={`Remove ${removing?.name || 'this shop'} from your shops?`}
        yes="Remove"
        onYes={() => {
          const id = removing!.id
          setOpenId(null)
          write((all) => all.filter((x) => x.id !== id))
        }}
        onClose={() => setRemoving(null)}
      />
    </div>
  )
}
