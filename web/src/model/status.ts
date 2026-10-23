// Moving a record between owned, ordered and wanted, as moveStatus in app/vinyl-wall.html does it: each move writes the
// status, a dated note, and the dates and order state that go with it.
import { notesOf } from './notes'
import { kindOf, pressingText, today, type Kind, type Rec } from './record'

export type Paid = { paid: string; shop: string }

// a hunt's copies that have anything in them; production asks which one was got when there's more than one.
// That picker isn't in this prototype, so such records don't offer the move.
export function wantedCopies(r: Rec): number {
  const s = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')
  const first = [s(r.copyName), pressingText(r), s(r.label), s(r.catalog), s(r.budget)].some(Boolean) ? 1 : 0
  const more = (Array.isArray(r.moreCopies) ? r.moreCopies : []).filter(
    (c) => c && typeof c === 'object' && ['name', 'pressing', 'label', 'catalog', 'budget'].some((k) => (c as Record<string, unknown>)[k]),
  ).length
  return first + more
}

// what a move writes, from the latest copy of the record; null when it's already there
export function movePatch(r: Rec, to: Kind, det?: Paid): { patch: Record<string, unknown>; msg: string } | null {
  const from = kindOf(r)
  if (to === from) return null
  const t = today()
  const notes = notesOf(r)
  const patch: Record<string, unknown> = { status: to }
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
