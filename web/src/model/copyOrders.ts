// Copies on order (#139): a copy still wanted on an owned or ordered record can be ordered too, with an order of its own.
// The record's own order (an ordered record's) comes first, then each copy's, in the order the copies were added. When a
// copy's arrival or a cancelled order leaves the record with a copy of another kind in its own fields, the two change
// places, so the record's own fields stay its copy as the rest of the page and the Discogs sync read them.
import { notesOf } from './notes'
import { buyHosts, copyAlbum, copyOrdered, ORDER_KEYS, wantCopies, type Copy } from './copies'
import { emptyOwned, gotPatch, type OwnCopy } from './owned'
import { kindOf, OSTAT, orderStatusOf, shortDate, tagOf, today, type Rec, type Tag } from './record'
import { movePatch, type Paid } from './status'

const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined)
// moreCopies as wantCopies reads them, so an index into wantCopies (less one) points at the same one
const rawMore = (r: Rec) => (Array.isArray(r.moreCopies) ? r.moreCopies : []).filter((x) => !!obj(x)) as Record<string, unknown>[]
const said = (det: { paid?: string; shop?: string }) => [det.paid ? '$' + det.paid : '', det.shop ? 'from ' + det.shop : ''].filter(Boolean).join(' ')
const noOrder = Object.fromEntries(ORDER_KEYS.map((k) => [k, '']))

// one order: ci 0 is the record's own, any other a copy's index in wantCopies. rec reads as an ordered record of that copy
// alone (its pressing, its order, its Discogs release), so the Order tab's card and links show it as they show the record's
export type Order = { ci: number; copy: Copy; rec: Rec }

export function ordersOf(r: Rec): Order[] {
  const k = kindOf(r)
  if (k === 'wish') return []
  const C = wantCopies(r)
  const L: Order[] = k === 'ordered' ? [{ ci: 0, copy: C[0], rec: r }] : []
  C.forEach((c, i) => {
    if (i && copyOrdered(c))
      L.push({
        ci: i,
        copy: c,
        rec: {
          ...r,
          ...noOrder,
          status: 'ordered',
          copyName: c.name, pressing: c.pressing, label: c.label, catalog: c.catalog, budget: c.budget, discogsId: c.discogsId, buyLinks: c.buyLinks,
          releaseDate: c.releaseDate,
          ...copyAlbum(r, c),
          ...Object.fromEntries(ORDER_KEYS.map((x) => [x, c[x] ?? ''])),
          discogsMatch: '',
          moreCopies: undefined,
          ownedCopies: undefined,
        },
      })
  })
  return L
}

// the orders the Order tab lists, the one expected first at the top (one with no date last), as the hang tag names it
export const ordersDue = (r: Rec) => [...ordersOf(r)].sort((a, b) => String(a.rec.eta || '9999').localeCompare(String(b.rec.eta || '9999')))
// the hang tag's words for orders, short enough for the tag: an ordered record's order expected first ("Shipped · Nov 4"),
// as a single order's has always read; an owned record's copies on order "+1 on order" (where they're at is on the sheet)
export function ordersTag(r: Rec): string {
  const L = ordersDue(r)
  if (!L.length) return ''
  if (kindOf(r) === 'own') return `+${L.length} on order`
  const o = L[0].rec
  return OSTAT[orderStatusOf(o)] + (o.eta ? ' · ' + shortDate(String(o.eta)) : '')
}

// the record's own copy as one of moreCopies, with its order when it has one
function leadAsCopy(r: Rec, withOrder: boolean): Record<string, unknown> {
  const { barcodes, ...c } = wantCopies(r)[0]
  const order = withOrder ? { ...Object.fromEntries(ORDER_KEYS.map((k) => [k, String(r[k] ?? '')])), orderStatus: orderStatusOf(r) } : {}
  return { ...c, discogsId: c.discogsId, ...(barcodes ? { barcodes } : {}), ...order }
}
// a copy into the record's own fields (its order, if any, as the record's)
function copyAsLead(c: Copy, withOrder: boolean): Record<string, unknown> {
  return {
    copyName: c.name, pressing: c.pressing, label: c.label, catalog: c.catalog, budget: c.budget, discogsId: c.discogsId || '', buyLinks: c.buyLinks,
    releaseDate: c.releaseDate,
    ...(c.barcodes ? { barcodes: c.barcodes } : {}),
    ...noOrder,
    ...(withOrder ? Object.fromEntries(ORDER_KEYS.map((k) => [k, c[k] ?? ''])) : {}),
  }
}

// Ordered this copy: a copy still wanted on an owned or ordered record goes on order today, with what was paid and where.
// A pre-order's release date becomes its expected date, as a hunt's does (#75)
export function orderCopyPatch(r: Rec, ci: number, det: Paid): { patch: Record<string, unknown>; msg: string } | null {
  const more = rawMore(r)
  const c = wantCopies(r)[ci]
  if (kindOf(r) === 'wish' || ci < 1 || !c || ci > more.length || copyOrdered(c)) return null
  const t = today()
  const L = buyHosts(c.buyLinks)
  const pre = c.releaseDate > t
  const order = {
    ...noOrder,
    orderStatus: pre ? 'preorder' : 'ordered',
    orderDate: t,
    eta: pre ? c.releaseDate : '',
    paid: det.paid,
    shop: det.shop,
    shopUrl: det.shopUrl || (L.length === 1 ? L[0][1] : ''),
  }
  const notes = notesOf(r)
  notes.push({ d: t, t: said(det) ? 'Ordered another copy · ' + said(det) : 'Ordered another copy.' })
  // as a hunt's Ordered it says it; the sheet then shows the Order tab
  return {
    patch: { moreCopies: more.map((x, j) => (j === ci - 1 ? { ...x, ...order, releaseDate: '' } : x)), notes },
    msg: 'Marked as ordered today.',
  }
}

// a copy that's come (bought, or arrived) as one of the copies you own
const owned = (c: Copy, det: { paid?: string; shop?: string; shopUrl?: string }): OwnCopy => ({
  ...emptyOwned(),
  name: c.name, pressing: c.pressing, label: c.label, catalog: c.catalog, discogsId: c.discogsId,
  ...(c.barcodes ? { barcodes: c.barcodes } : {}),
  ...(c.releaseTracks ? { releaseTracks: c.releaseTracks } : {}),
  paid: det.paid || '', shop: det.shop || '', shopUrl: det.shopUrl || '',
  acquired: today(),
})

// An ordered record's copy that's come before its own order: the record moves to the wall with that copy as its own, and
// its order becomes a copy on order
function swapIn(r: Rec, ci: number, det: { paid?: string; shop?: string; shopUrl?: string }, note: string) {
  const more = rawMore(r)
  const c = wantCopies(r)[ci]
  const notes = notesOf(r)
  notes.push({ d: today(), t: note })
  const o = owned(c, det)
  return {
    patch: {
      ...copyAsLead(c, false),
      status: 'own',
      paid: o.paid, shop: o.shop, shopUrl: o.shopUrl, acquired: o.acquired,
      moreCopies: [leadAsCopy(r, true), ...more.filter((_, j) => j !== ci - 1)],
      notes,
    },
    msg: 'Moved to the wall. Your other order is still on the way.',
  }
}

// Got this copy, on an owned record (it joins your copies) or an ordered one (it becomes the record's, which moves to the wall)
export function gotCopyPatch(r: Rec, ci: number, det: Paid): { patch: Record<string, unknown>; msg: string } | null {
  if (kindOf(r) === 'own') return gotPatch(r, ci, det)
  const c = wantCopies(r)[ci]
  if (kindOf(r) !== 'ordered' || ci < 1 || !c || ci > rawMore(r).length || copyOrdered(c)) return null
  const L = buyHosts(c.buyLinks)
  const d = { ...det, shopUrl: det.shopUrl || (L.length === 1 ? L[0][1] : '') }
  return { ...swapIn(r, ci, d, said(det) ? 'Found it · ' + said(det) : 'Found it. Moved to the wall.'), msg: 'Moved to the wall. Your order is still on the way.' }
}

// It arrived, on one order: the record's own moves it to the wall as before (its other orders stay on order); a copy's
// joins your copies, or on an ordered record becomes the record's own
export function arrivedPatch(r: Rec, ci: number): { patch: Record<string, unknown>; msg: string } | null {
  if (ci === 0) return kindOf(r) === 'ordered' ? movePatch(r, 'own') : null
  const more = rawMore(r)
  const c = wantCopies(r)[ci]
  if (!c || ci > more.length || !copyOrdered(c)) return null
  const det = { paid: c.paid, shop: c.shop, shopUrl: c.shopUrl }
  if (kindOf(r) === 'ordered') return swapIn(r, ci, det, 'Arrived' + (c.shop ? ' from ' + c.shop : '') + '. Hung it on the wall.')
  if (kindOf(r) !== 'own') return null
  const notes = notesOf(r)
  notes.push({ d: today(), t: 'Another copy arrived' + (c.shop ? ' from ' + c.shop : '') + '.' })
  return {
    patch: {
      ownedCopies: [...(Array.isArray(r.ownedCopies) ? r.ownedCopies : []), owned(c, det)],
      moreCopies: more.filter((_, j) => j !== ci - 1),
      notes,
    },
    msg: 'Added to your copies. Arrived today.',
  }
}

// Cancelled, still want it: the order comes off and the copy is one you want again. The record's own order, while a copy is
// on order, changes places with the first of those (the record stays ordered); with none, the record goes back to the hunt
export function cancelPatch(r: Rec, ci: number): { patch: Record<string, unknown>; msg: string } | null {
  const more = rawMore(r)
  if (ci === 0) {
    if (kindOf(r) !== 'ordered') return null
    const next = ordersOf(r)[1]
    if (!next) return movePatch(r, 'wish')
    return {
      patch: {
        ...copyAsLead(next.copy, true),
        moreCopies: more.map((x, j) => (j === next.ci - 1 ? leadAsCopy(r, false) : x)),
      },
      msg: 'Back to the copies you want. Your other order is still on the way.',
    }
  }
  const c = wantCopies(r)[ci]
  if (!c || ci > more.length || !copyOrdered(c)) return null
  return {
    patch: { moreCopies: more.map((x, j) => (j === ci - 1 ? Object.fromEntries(Object.entries(x).filter(([k]) => !(ORDER_KEYS as readonly string[]).includes(k))) : x)) },
    msg: 'Back to the copies you want.',
  }
}

// the hang tag on the wall and in the share picture: a record's orders when it has any (an owned record's copies on order
// too), else as tagOf has it
export function hangTag(r: Rec): Tag | null {
  const t = ordersTag(r)
  return t ? { text: t, tone: 'ship' } : tagOf(r)
}
