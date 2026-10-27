import { useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { Field, FieldLabel } from '@appica/ui-react/field'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Input } from '@appica/ui-react/input'
import { kindOf, type Rec } from '../model/record'
import { buyHosts, pickable } from '../model/copies'
import { shopOf, shopSite, shopsOf } from '../model/shops'
import { movedCopy, movePatch } from '../model/status'
import { useRuntime } from '../runtime/runtime'
import { CopyPicker } from './Copies'
import { ShopInput } from './ShopInput'
import { Tip } from '../wall/Tip'

// View mode's status buttons: Ordered it / Got it on the hunt (asking which copy when it hunts several, then what was
// paid), It arrived on an order
export function StatusActions({ r, onMoved }: { r: Rec; onMoved: (msg: string) => void }) {
  const { mutate, settings } = useRuntime()
  const [pick, setPick] = useState<'ordered' | 'own' | null>(null)
  const [ask, setAsk] = useState<'ordered' | 'own' | null>(null)
  const [ci, setCi] = useState(0)
  const [paid, setPaid] = useState('')
  const [shop, setShop] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const k = kindOf(r)
  if (k === 'own') return null

  const move = async (to: 'ordered' | 'own', det?: { paid: string; shop: string; shopUrl?: string }) => {
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
    setPaid(String(r.paid || ''))
    setShop(String(r.shop || ''))
    setUrl('')
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

  if (ask) {
    // a copy sold in several places asks which one it came from; one with a single link uses it without asking
    const hosts = k === 'wish' ? buyHosts(movedCopy(r, ci).buyLinks) : []
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          // with no link of the copy's to go by, a shop on your list gives its website (#99)
          const site = url || (hosts.length ? '' : shopSite(shopsOf(settings), shop))
          move(ask, { paid: paid.trim().replace(/^\$\s*/, ''), shop: shop.trim(), ...(site ? { shopUrl: site } : {}) })
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
              <FieldLabel>{ask === 'own' ? 'Bought from' : 'From'}</FieldLabel>
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
            <Button type="button" size="sm" variant="ghost" onClick={() => setAsk(null)}>
              Cancel
            </Button>
          </div>
        </Fieldset>
      </form>
    )
  }

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
