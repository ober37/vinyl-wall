import { useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { Field, FieldLabel } from '@appica/ui-react/field'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Input } from '@appica/ui-react/input'
import { kindOf, type Rec } from '../model/record'
import { buyHosts, pickable, wantCopies } from '../model/copies'
import { gotPatch } from '../model/owned'
import { shopOf, shopSite, shopsOf } from '../model/shops'
import { movedCopy, movePatch, type Paid } from '../model/status'
import { useRuntime } from '../runtime/runtime'
import { CopyPicker } from './Copies'
import { ShopInput } from './ShopInput'
import { Tip } from '../wall/Tip'

// View mode's status buttons: Ordered it / Got it on the hunt (asking which copy when it hunts several, then what was
// paid), It arrived on an order
export function StatusActions({ r, onMoved }: { r: Rec; onMoved: (msg: string) => void }) {
  const { mutate } = useRuntime()
  const [pick, setPick] = useState<'ordered' | 'own' | null>(null)
  const [ask, setAsk] = useState<'ordered' | 'own' | null>(null)
  const [ci, setCi] = useState(0)
  const [busy, setBusy] = useState(false)
  const k = kindOf(r)
  if (k === 'own') return null

  const move = async (to: 'ordered' | 'own', det?: Paid) => {
    setBusy(true)
    let msg = ''
    const ok = await mutate(r.id, (latest) => {
      const m = movePatch(latest, to, det, ci)
      msg = m?.msg || ''
      return m?.patch ?? null
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

  if (ask)
    return (
      <PaidForm
        shopLabel={ask === 'own' ? 'Bought from' : 'From'}
        hosts={k === 'wish' ? buyHosts(movedCopy(r, ci).buyLinks) : []}
        init={{ paid: String(r.paid || ''), shop: String(r.shop || '') }}
        busy={busy}
        onSave={(det) => move(ask, det)}
        onCancel={() => setAsk(null)}
      />
    )

  return (
    <div className="flex flex-wrap gap-3">
      {k === 'ordered' ? (
        <Button disabled={busy} onClick={() => move('own')}>
          It arrived
        </Button>
      ) : (
        <>
          <Button disabled={busy} onClick={() => start('ordered')}>
            Ordered it
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => start('own')}>
            Got it
          </Button>
        </>
      )}
    </div>
  )
}

// What did you pay, and where from: a copy sold in several places asks which one it came from; one with a single link
// uses it without asking (the move does)
export function PaidForm({ shopLabel, hosts, init, busy, onSave, onCancel }: {
  shopLabel: string
  hosts: [string, string][]
  init: { paid: string; shop: string }
  busy: boolean
  onSave: (det: Paid) => void
  onCancel: () => void
}) {
  const { settings } = useRuntime()
  const [paid, setPaid] = useState(init.paid)
  const [shop, setShop] = useState(init.shop)
  const [url, setUrl] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        // with no link of the copy's to go by, a shop on your list gives its website (#99)
        const site = url || (hosts.length ? '' : shopSite(shopsOf(settings), shop))
        onSave({ paid: paid.trim().replace(/^\$\s*/, ''), shop: shop.trim(), ...(site ? { shopUrl: site } : {}) })
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

// Got this copy (#121): a copy an owned record still wants, bought; asks what was paid and where, then it joins your copies
export function GotCopy({ r, ci, onMoved }: { r: Rec; ci: number; onMoved: (msg: string) => void }) {
  const { mutate } = useRuntime()
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!ask)
    return (
      <Button size="sm" variant="outline" className="self-start" onClick={() => setAsk(true)}>
        Got this copy
      </Button>
    )
  const save = async (det: Paid) => {
    setBusy(true)
    let msg = ''
    const ok = await mutate(r.id, (latest) => {
      const m = gotPatch(latest, ci, det)
      msg = m?.msg || ''
      return m?.patch ?? null
    })
    setBusy(false)
    setAsk(false)
    if (ok) onMoved(msg)
  }
  return (
    <PaidForm
      shopLabel="Bought from"
      hosts={buyHosts(wantCopies(r)[ci]?.buyLinks ?? [])}
      init={{ paid: '', shop: '' }}
      busy={busy}
      onSave={save}
      onCancel={() => setAsk(false)}
    />
  )
}
