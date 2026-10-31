import { useRef, useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@appica/ui-react/collapsible'
import { Field, FieldLabel, FieldDescription } from '@appica/ui-react/field'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Input } from '@appica/ui-react/input'
import { Textarea } from '@appica/ui-react/textarea'
import { useDebouncedSave } from '../gear/useDebouncedSave'
import { KINDS, shopsOf, shopWhere, siteUrl, unlistedShops, type Shop, type ShopKind } from '../model/shops'
import { useRuntime } from '../runtime/runtime'
import { Confirm } from '../sheet/Confirm'
import { Chevron } from '../sheet/Links'
import { Segmented } from '../sheet/Segmented'

const GROUPS: [ShopKind, string][] = [
  ['local', 'Local shops'],
  ['online', 'Online shops'],
  ['market', 'Marketplaces'],
]
type Draft = { name: string; kind: ShopKind; url: string; place: string; phone: string; email: string; about: string }
const draftOf = (s: Shop): Draft => ({
  name: s.name, kind: s.kind, url: s.url || '', place: s.place || '', phone: s.phone || '', email: s.email || '', about: s.about || '',
})
// a typed website that won't be saved (a link is kept only when it's an https web address)
const badSite = (v: string) => !!v.trim() && !siteUrl(v).startsWith('https:')
const SITE_HINT = 'Needs a web address like shop.example.com.'
const hostOf = (u?: string) => (u ? new URL(u).hostname.replace(/^www\./, '') : '')
// what a draft stores: a name always (the last one when it's cleared), links only when they work, contact only for local,
// and what the chat or the background task found that isn't edited here (#118), unless the website changed, so it's found
// again for the new one
function fromDraft(d: Draft, was: Shop): Shop {
  const s: Shop = { id: was.id, name: d.name.trim() || was.name, kind: d.kind }
  const url = siteUrl(d.url)
  if (url.startsWith('https:')) s.url = url
  if (hostOf(s.url) === hostOf(was.url))
    for (const k of ['search', 'upc', 'shopify', 'searchTried'] as const) if (was[k] !== undefined) Object.assign(s, { [k]: was[k] })
  if (d.kind === 'local') for (const k of ['place', 'phone', 'email', 'about'] as const) if (d[k].trim()) s[k] = d[k].trim()
  return s
}

// a shop as a folded row: its name and town or domain, opening to its details, which save as they're typed
function ShopRow({ shop, open, onOpenChange, save, onRemove }: {
  shop: Shop
  open: boolean
  onOpenChange: (o: boolean) => void
  save: (s: Shop) => Promise<boolean>
  onRemove: () => void
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
  // what the chat can look up for a local shop: where it is, its phone and a line about it (its search is found for it)
  const missing = d.kind === 'local' && !(d.place.trim() && d.phone.trim() && d.about.trim())
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
      {/* room for a focused ring, which the panel would otherwise clip: as wide as Remove this shop pulls out (-ms-3) */}
      <CollapsibleContent className="-mx-4 px-4 transition-none">
        <div className="flex flex-col gap-4 pt-4 pb-2">
          <span role="status" className="text-foreground-muted -mb-2 text-xs empty:hidden">
            {saved}
          </span>
          {missing && <p className="text-foreground-muted text-sm">Your Claude chat can fill in the missing details.</p>}
          {field('name', 'Name', { maxLength: 80 })}
          <Segmented label="Kind" value={d.kind} options={KINDS} onChange={(v) => set('kind', v)} />
          <Field>
            <FieldLabel>{d.kind === 'local' ? 'Web store' : 'Website'}</FieldLabel>
            <Input value={d.url} inputMode="url" placeholder="shop.example.com" onChange={(e) => set('url', e.target.value)} />
            {badSite(d.url) && <FieldDescription>{SITE_HINT}</FieldDescription>}
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
                <Textarea className="field-sizing-content max-h-80" rows={2} maxLength={400} value={d.about} onChange={(e) => set('about', e.target.value)} />
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

// from: a shop your records came from, to start it from. The kind follows the website (online with one, local without)
// until one is picked
function AddShop({ onAdd, onCancel, from }: { onAdd: (s: Shop) => void; onCancel: () => void; from?: { name: string; url: string } }) {
  const [name, setName] = useState(from?.name || '')
  const [picked, setPicked] = useState<ShopKind | null>(null)
  const [url, setUrl] = useState(from?.url || '')
  const kind = picked || (url.trim() ? 'online' : 'local')
  const add = () => {
    const u = siteUrl(url)
    onAdd({ id: Math.random().toString(36).slice(2, 12), name: name.trim().slice(0, 80), kind, ...(u.startsWith('https:') ? { url: u } : {}) })
  }
  return (
    <form
      className="border-border flex flex-col gap-4 rounded-md border p-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim() && !badSite(url)) add()
      }}
    >
      <Field>
        <FieldLabel>Name</FieldLabel>
        <Input autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </Field>
      {/* a press on the kind already shown picks it too (Segmented reports only changes) */}
      <div onClick={() => setPicked((p) => p || kind)}>
        <Segmented label="Kind" value={kind} options={KINDS} onChange={setPicked} />
      </div>
      <Field>
        <FieldLabel>Website</FieldLabel>
        <Input value={url} inputMode="url" placeholder="shop.example.com" onChange={(e) => setUrl(e.target.value)} />
        {badSite(url) && <FieldDescription>{SITE_HINT}</FieldDescription>}
      </Field>
      <div className="flex gap-3">
        <Button size="sm" type="submit" disabled={!name.trim() || badSite(url)}>
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
  // true for + Add a shop, or the shop your records came from that it starts from
  const [adding, setAdding] = useState<boolean | { name: string; url: string }>(false)
  const [removing, setRemoving] = useState<Shop | null>(null)
  const latest = useRef(settings)
  latest.current = settings
  // a change writes the whole list, read from the latest settings so a change elsewhere isn't lost
  const write = (fn: (list: Shop[]) => Shop[]) => saveSettings({ shops: fn(shopsOf(latest.current)) })
  // the ones you hid from Not on your list yet, by name
  const hidden = Array.isArray(settings.shopsHidden) ? settings.shopsHidden.filter((x): x is string => typeof x === 'string') : []
  const all = unlistedShops(records, shops)
  const unlisted = all.filter((u) => !hidden.includes(u.name.toLowerCase()))
  const hiddenN = all.length - unlisted.length
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
          key={typeof adding === 'object' ? adding.name : ''}
          from={typeof adding === 'object' ? adding : undefined}
          onCancel={() => setAdding(false)}
          onAdd={(s) => {
            write((all) => [...all, s])
            // one started from your records opens, for the details the quick form doesn't ask for
            if (typeof adding === 'object') setOpenId(s.id)
            setAdding(false)
          }}
        />
      ) : (
        <Button size="sm" variant="outline" className="self-start" onClick={() => setAdding(true)}>
          + Add a shop
        </Button>
      )}
      {all.length > 0 && (
        <Fieldset>
          <FieldsetLegend>Not on your list yet</FieldsetLegend>
          <ul className="flex flex-col gap-4">
            {unlisted.map((u) => (
              <li key={u.name} className="flex items-baseline gap-3 text-sm">
                <span className="min-w-0 flex-1 break-words">
                  <span className="text-foreground-intense">{u.name}</span>
                  <span className="text-foreground-muted"> · {u.count === 1 ? '1 record' : u.count + ' records'}</span>
                </span>
                <span className="-me-3 flex shrink-0">
                  <Button size="sm" variant="ghost" aria-label={`Add ${u.name}`} onClick={() => setAdding({ name: u.name, url: u.url })}>
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-foreground-muted"
                    aria-label={`Hide ${u.name}`}
                    onClick={() => saveSettings({ shopsHidden: [...hidden, u.name.toLowerCase()] })}
                  >
                    Hide
                  </Button>
                </span>
              </li>
            ))}
            {hiddenN > 0 && (
              <li className="text-foreground-muted flex items-baseline gap-1 text-sm">
                {hiddenN} hidden ·
                <Button size="sm" variant="ghost" className="-ms-2" onClick={() => saveSettings({ shopsHidden: [] })}>
                  Show them
                </Button>
              </li>
            )}
          </ul>
        </Fieldset>
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
