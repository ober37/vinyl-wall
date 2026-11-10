import { useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { Checkbox } from '@appica/ui-react/checkbox'
import { Field, FieldLabel } from '@appica/ui-react/field'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Input } from '@appica/ui-react/input'
import { kindOf, type Rec } from '../model/record'
import { buyHosts, pickable, wantCopies } from '../model/copies'
import { arrivedPatch, gotCopyPatch, orderCopyPatch } from '../model/copyOrders'
import { atShow, sameSite, shopOf, shopSite, shopsOf, shopSuggest, type Shop } from '../model/shops'
import { boughtPatch, recentSighting, seenAt } from '../model/sightings'
import { movedCopy, movePatch, type Paid } from '../model/status'
import { useRuntime } from '../runtime/runtime'
import { CopyPicker } from './Copies'
import { ShopInput } from './ShopInput'
import { SeenForm } from './Sightings'
import { Tip } from '../wall/Tip'

// View mode's status buttons on the hunt: Ordered it / Got it (asking which copy when it hunts several, then what was
// paid), and Seen it, which leaves it on the hunt (#152). An order's It arrived is in its fold on the Order tab (#139)
export function StatusActions({ r, onMoved }: { r: Rec; onMoved: (msg: string) => void }) {
  const { mutate, settings } = useRuntime()
  const [pick, setPick] = useState<'ordered' | 'own' | null>(null)
  const [ask, setAsk] = useState<'ordered' | 'own' | null>(null)
  const [ci, setCi] = useState(0)
  const [busy, setBusy] = useState(false)
  const [seen, setSeen] = useState(false)
  const k = kindOf(r)
  if (k !== 'wish') return null

  const move = async (to: 'ordered' | 'own', det?: Paid) => {
    setBusy(true)
    let msg = ''
    const ok = await mutate(r.id, (latest) => {
      const m = movePatch(latest, to, det, ci)
      msg = m?.msg || ''
      // got it where it was seen: that sighting was bought (#152)
      return m && { ...m.patch, ...(to === 'own' && det ? boughtPatch(latest, det.shop, shopsOf(settings)) : {}) }
    })
    setBusy(false)
    setAsk(null)
    if (ok) onMoved(msg)
  }
  const askPaid = (to: 'ordered' | 'own') => {
    setPick(null)
    setAsk(to)
  }
  const start = (to: 'ordered' | 'own') => {
    setCi(0)
    if (pickable(r).length > 1) setPick(to)
    else askPaid(to)
  }

  if (pick)
    return (
      <CopyPicker
        r={r}
        to={pick}
        onPick={(i) => {
          setCi(i)
          askPaid(pick)
        }}
        onCancel={() => setPick(null)}
      />
    )

  if (seen)
    return (
      <SeenForm
        r={r}
        onDone={(msg) => {
          setSeen(false)
          if (msg) onMoved(msg)
        }}
      />
    )

  if (ask)
    return (
      <PaidForm
        shopLabel={ask === 'own' ? 'Bought from' : 'From'}
        bought={ask === 'own'}
        hosts={buyHosts(movedCopy(r, ci).buyLinks)}
        init={prefill(r, shopsOf(settings))}
        busy={busy}
        onSave={(det) => move(ask, det)}
        onCancel={() => setAsk(null)}
      />
    )

  return (
    <div className="flex flex-wrap gap-3">
      <Button disabled={busy} onClick={() => start('ordered')}>
        Ordered it
      </Button>
      <Button variant="outline" disabled={busy} onClick={() => start('own')}>
        Got it
      </Button>
      <Button variant="outline" disabled={busy} onClick={() => setSeen(true)}>
        Seen it
      </Button>
    </div>
  )
}

// the paid form starts from the record's shop and price, else where it was seen lately and the price seen there (#152)
function prefill(r: Rec, list: Shop[]) {
  const seen = recentSighting(r)
  return { paid: String(r.paid || (!r.shop && seen?.price) || ''), shop: String(r.shop || (seen ? seenAt(seen, list) : '')) }
}

// What did you pay, and where from: a copy sold in several places asks which one it came from; one with a single link
// uses it without asking (the move does). Bought (in hand, not on order): it can be new and sealed, and a shop not on your
// list can be added to it (#151)
export function PaidForm({ shopLabel, bought, hosts, init, busy, onSave, onCancel }: {
  shopLabel: string
  bought?: boolean
  hosts: [string, string][]
  init: { paid: string; shop: string }
  busy: boolean
  onSave: (det: Paid) => void
  onCancel: () => void
}) {
  const { settings, saveSettings } = useRuntime()
  const [paid, setPaid] = useState(init.paid)
  const [shop, setShop] = useState(init.shop)
  const [url, setUrl] = useState('')
  const [sealed, setSealed] = useState(false)
  const [add, setAdd] = useState(false)
  const list = shopsOf(settings)
  const name = shop.trim()
  // a shop that's on neither your list nor its suggestions, and not a show's merch booth (#117)
  const unlisted = bought && !!name && !list.some((s) => s.name.toLowerCase() === name.toLowerCase()) && !shopSuggest(list, name).length && !atShow(name)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        // a shop on your list gives its website (#99), unless the copy's only link is a page on it (#151)
        const listed = shopSite(list, name)
        const site = url || (hosts.length === 1 && sameSite(hosts[0][1], listed) ? hosts[0][1] : listed)
        if (unlisted && add) saveSettings({ shops: [...list, { id: Math.random().toString(36).slice(2, 12), name: name.slice(0, 80), kind: 'local' }] })
        onSave({ paid: paid.trim().replace(/^\$\s*/, ''), shop: name, ...(site ? { shopUrl: site } : {}), ...(bought && sealed ? { sealed } : {}) })
      }}
    >
      <Fieldset>
        <FieldsetLegend>What did you pay?</FieldsetLegend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Paid</FieldLabel>
            <Input value={paid} onChange={(e) => setPaid(e.target.value)} inputMode="decimal" startSlot={<span aria-hidden="true">$</span>} autoFocus />
          </Field>
          <Field>
            <FieldLabel>{shopLabel}</FieldLabel>
            <ShopInput value={shop} onChange={setShop} placeholder="e.g. Rough Trade" />
          </Field>
        </div>
        {bought && (
          <div className="flex flex-col gap-3">
            {unlisted && (
              <label className="text-foreground flex items-center gap-2 text-sm">
                <Checkbox checked={add} onCheckedChange={(v) => setAdd(!!v)} />
                Add {name} to your shops
              </label>
            )}
            <label className="text-foreground flex items-center gap-2 text-sm">
              <Checkbox checked={sealed} onCheckedChange={(v) => setSealed(!!v)} />
              New, sealed (graded Mint)
            </label>
          </div>
        )}
        {hosts.length > 1 && (
          <div role="group" aria-labelledby="fromQ" className="flex flex-col gap-2">
            <p id="fromQ" className="text-foreground-muted text-sm">
              From one of these?
            </p>
            <div className="flex flex-wrap gap-2">
              {/* the full address tells two links on one site apart; on phones, which never show it, "(2)" follows the
                  order of the record's buy links */}
              {hosts.map(([h, u], i) => (
                <Tip key={u + i} label={u}>
                  <Button
                    type="button"
                    size="sm"
                    variant={url === u ? 'primary' : 'outline'}
                    aria-pressed={url === u}
                    onClick={() => {
                      const on = url !== u
                      setUrl(on ? u : '')
                      // a website on your shops list gives that shop's name, linking the record to it (#89)
                      if (on && !shop.trim()) setShop(shopOf({ shopUrl: u }, shopsOf(settings))?.name || h.replace(/ \(\d+\)$/, ''))
                    }}
                  >
                    {h}
                  </Button>
                </Tip>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-3">
          <Button type="submit" size="sm" disabled={busy}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </Fieldset>
    </form>
  )
}

// A copy an owned or ordered record still wants: Ordered this copy (it goes on order, #139) or Got this copy (#121: it joins
// your copies, or becomes an ordered record's own). Each asks what was paid and where, as the hunt's do. onOrdered: the
// copy's gone on order (the sheet shows it on the Order tab)
export function CopyActions({ r, ci, onMoved, onOrdered }: { r: Rec; ci: number; onMoved: (msg: string) => void; onOrdered?: () => void }) {
  const { mutate } = useRuntime()
  const [ask, setAsk] = useState<'ordered' | 'own' | null>(null)
  const [busy, setBusy] = useState(false)
  if (!ask)
    return (
      <div className="flex flex-wrap gap-3">
        <Button size="sm" onClick={() => setAsk('ordered')}>
          Ordered this copy
        </Button>
        <Button size="sm" variant="outline" onClick={() => setAsk('own')}>
          Got this copy
        </Button>
      </div>
    )
  const save = async (det: Paid) => {
    setBusy(true)
    let msg = ''
    const ok = await mutate(r.id, (latest) => {
      const m = ask === 'ordered' ? orderCopyPatch(latest, ci, det) : gotCopyPatch(latest, ci, det)
      msg = m?.msg || ''
      return m?.patch ?? null
    })
    setBusy(false)
    setAsk(null)
    if (ok) onMoved(msg)
    if (ok && ask === 'ordered') onOrdered?.()
  }
  return (
    <PaidForm
      shopLabel={ask === 'own' ? 'Bought from' : 'From'}
      bought={ask === 'own'}
      hosts={buyHosts(wantCopies(r)[ci]?.buyLinks ?? [])}
      init={{ paid: '', shop: '' }}
      busy={busy}
      onSave={save}
      onCancel={() => setAsk(null)}
    />
  )
}

// It arrived, on one order (0 the record's own, else a copy's index in wantCopies)
export function Arrived({ r, ci, onMoved }: { r: Rec; ci: number; onMoved: (msg: string) => void }) {
  const { mutate } = useRuntime()
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    let msg = ''
    const ok = await mutate(r.id, (latest) => {
      const m = arrivedPatch(latest, ci)
      msg = m?.msg || ''
      return m?.patch ?? null
    })
    setBusy(false)
    if (ok) onMoved(msg)
  }
  return (
    <Button size="sm" className="self-start" disabled={busy} onClick={go}>
      It arrived
    </Button>
  )
}
