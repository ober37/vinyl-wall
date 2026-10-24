// Moving a record between owned, ordered and wanted, as moveStatus in app/vinyl-wall.html does it: each move writes the
// status, a dated note, and the dates and order state that go with it.
import { notesOf } from './notes'
import { pickPatch } from './copies'
import { kindOf, today, type Kind, type Rec } from './record'

export type Paid = { paid: string; shop: string }

// what a move writes, from the latest copy of the record; null when it's already there. ci is the copy picked from a hunt
// with several (see pickable)
export function movePatch(r: Rec, to: Kind, det?: Paid, ci?: number): { patch: Record<string, unknown>; msg: string } | null {
  const from = kindOf(r)
  if (to === from) return null
  const t = today()
  const notes = notesOf(r)
  const patch: Record<string, unknown> = { status: to, ...(from === 'wish' ? pickPatch(r, ci ?? 0) : {}) }
  const said = det ? [det.paid ? '$' + det.paid : '', det.shop ? 'from ' + det.shop : ''].filter(Boolean).join(' ') : ''
  let msg = 'Moved back to the hunt.'
  if (to === 'own') {
    patch.acquired = t
    if (from === 'ordered') {
      patch.orderStatus = 'delivered'
      notes.push({ d: t, t: 'Arrived' + (r.shop ? ' from ' + r.shop : '') + '. Hung it on the wall.' })
    } else notes.push({ d: t, t: said ? 'Found it · ' + said : 'Found it. Moved to the wall.' })
    msg = 'Moved to the wall. Acquired today.'
  }
  if (to === 'ordered') {
    Object.assign(patch, { orderStatus: 'ordered', orderDate: t })
    notes.push({ d: t, t: said ? 'Ordered · ' + said : 'Ordered.' })
    msg = 'Marked as ordered today.'
  }
  // what was entered goes into the record too; another shop drops the old one's website
  if (det) {
    if (det.paid !== (r.paid || '')) patch.paid = det.paid
    if (det.shop !== (r.shop || '')) {
      patch.shop = det.shop
      if (r.shopUrl) patch.shopUrl = ''
    }
  }
  if (to !== 'wish') patch.notes = notes
  return { patch, msg }
}
