import { useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { Field, FieldLabel } from '@appica/ui-react/field'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Input } from '@appica/ui-react/input'
import { kindOf, type Rec } from '../model/record'
import { movePatch, wantedCopies } from '../model/status'
import { useRuntime } from '../runtime/runtime'

// View mode's status buttons: Ordered it / Got it on the hunt (asking what was paid first), It arrived on an order
export function StatusActions({ r, onMoved }: { r: Rec; onMoved: (msg: string) => void }) {
  const { mutate } = useRuntime()
  const [ask, setAsk] = useState<'ordered' | 'own' | null>(null)
  const [paid, setPaid] = useState('')
  const [shop, setShop] = useState('')
  const [busy, setBusy] = useState(false)
  const k = kindOf(r)
  if (k === 'own' || (k === 'wish' && wantedCopies(r) > 1)) return null

  const move = async (to: 'ordered' | 'own', det?: { paid: string; shop: string }) => {
    setBusy(true)
    let msg = ''
    const ok = await mutate(r.id, (latest) => {
      const m = movePatch(latest, to, det)
      msg = m?.msg || ''
      return m?.patch ?? null
    })
    setBusy(false)
    setAsk(null)
    if (ok) onMoved(msg)
  }
  const start = (to: 'ordered' | 'own') => {
    setPaid(String(r.paid || ''))
    setShop(String(r.shop || ''))
    setAsk(to)
  }

  if (ask)
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          move(ask, { paid: paid.trim().replace(/^\$\s*/, ''), shop: shop.trim() })
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
              <Input value={shop} onChange={(e) => setShop(e.target.value)} placeholder="e.g. Rough Trade" />
            </Field>
          </div>
          <div className="flex gap-2">
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

  return (
    <div className="flex flex-wrap gap-2">
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
