// Copies on order (#139): the orders a record has, the hang tag, and each move an order makes
import { describe, expect, it } from 'vitest'
import { stillCopies } from './copies'
import { arrivedPatch, cancelPatch, gotCopyPatch, hangTag, orderCopyPatch, ordersOf } from './copyOrders'
import { stored, toForm } from './edit'
import { exportFile, importable } from './library'
import { today, type Rec } from './record'

const want = { name: 'Blue vinyl', pressing: '2024 Rhino', label: 'Rhino', catalog: 'R1 2038', budget: '40', discogsId: 51, buyLinks: ['https://www.roughtrade.com/blue'] }
const placed = { ...want, orderStatus: 'shipped', orderDate: '2026-10-01', eta: '2026-11-04', paid: '38', shop: 'Rough Trade', shopUrl: '', orderNum: 'RT-9', carrier: 'UPS', tracking: '1Z1', orderNotes: '' }
const owned: Rec = { id: 'o', title: 'Blue', artist: 'Joni Mitchell', status: 'own', copyName: 'Reprise first', discogsId: 50, paid: '30', shop: 'Reckless', acquired: '2020-01-01', moreCopies: [want], notes: [] }
const ordered: Rec = {
  id: 'd', title: 'Blue', artist: 'Joni Mitchell', status: 'ordered', copyName: 'Indie exclusive', discogsId: 52, orderStatus: 'ordered', orderDate: '2026-10-20',
  eta: '2026-11-20', shop: 'Bandcamp', paid: '35', tracking: '9400', carrier: 'USPS', moreCopies: [placed, want], notes: [],
}

describe('the orders a record has', () => {
  it("lists an ordered record's own order first, then each copy on order, read as an ordered record of that copy", () => {
    const L = ordersOf(ordered)
    expect(L.map((o) => o.ci)).toEqual([0, 1])
    expect(L[1].rec).toMatchObject({ status: 'ordered', copyName: 'Blue vinyl', discogsId: 51, tracking: '1Z1', carrier: 'UPS', shop: 'Rough Trade', discogsMatch: '' })
    expect(ordersOf({ ...owned, moreCopies: [placed] }).map((o) => o.ci)).toEqual([1])
    expect(ordersOf({ ...owned, status: 'wish', moreCopies: [placed] })).toEqual([])
  })

  it('keeps copies on order out of the copies still wanted', () => {
    expect(stillCopies(ordered).map(([, i]) => i)).toEqual([2])
  })

  it("tags an owned record's copies on order by how many, and an ordered record by the order expected first", () => {
    expect(hangTag({ ...owned, moreCopies: [placed] })).toEqual({ text: '+1 on order', tone: 'ship' })
    expect(hangTag(ordered)?.text).toBe('Shipped · Nov 4')
    expect(hangTag({ ...ordered, moreCopies: [] })?.text).toBe('Ordered · Nov 20')
    expect(hangTag(owned)).toBeNull()
  })
})

describe('Ordered this copy', () => {
  it('puts a copy still wanted on order today, with what was paid and where, and says where it went', () => {
    const m = orderCopyPatch(owned, 1, { paid: '38', shop: 'Rough Trade' })!
    const c = (m.patch.moreCopies as Record<string, unknown>[])[0]
    expect(c).toMatchObject({ name: 'Blue vinyl', orderStatus: 'ordered', orderDate: today(), eta: '', paid: '38', shop: 'Rough Trade', shopUrl: 'https://www.roughtrade.com/blue' })
    expect((m.patch.notes as { t: string }[]).at(-1)).toEqual({ d: today(), t: 'Ordered another copy · $38 from Rough Trade' })
    expect(m.msg).toBe('Marked as ordered today.')
  })

  it("makes a pre-order of a copy not out yet, its release date the order's expected date", () => {
    const m = orderCopyPatch({ ...owned, moreCopies: [{ ...want, releaseDate: '2099-03-01' }] }, 1, { paid: '', shop: '' })!
    expect((m.patch.moreCopies as Record<string, unknown>[])[0]).toMatchObject({ orderStatus: 'preorder', eta: '2099-03-01', releaseDate: '' })
  })

  it('does nothing on a hunt, or to a copy already on order', () => {
    expect(orderCopyPatch({ ...owned, status: 'wish' }, 1, { paid: '', shop: '' })).toBeNull()
    expect(orderCopyPatch(ordered, 1, { paid: '', shop: '' })).toBeNull()
  })
})

describe('It arrived, on one order', () => {
  it("adds an owned record's copy to your copies, with what the order cost and where from", () => {
    const m = arrivedPatch({ ...owned, moreCopies: [placed, want] }, 1)!
    expect(m.patch.ownedCopies).toEqual([expect.objectContaining({ name: 'Blue vinyl', discogsId: 51, paid: '38', shop: 'Rough Trade', acquired: today() })])
    expect(m.patch.moreCopies).toEqual([want])
    expect((m.patch.notes as { t: string }[]).at(-1)).toEqual({ d: today(), t: 'Another copy arrived from Rough Trade.' })
    expect(m.msg).toBe('Added to your copies. Arrived today.')
  })

  it("moves an ordered record to the wall with the copy that came first, its own order now a copy on order", () => {
    const m = arrivedPatch(ordered, 1)!
    expect(m.patch).toMatchObject({ status: 'own', copyName: 'Blue vinyl', discogsId: 51, paid: '38', shop: 'Rough Trade', acquired: today(), orderStatus: '', tracking: '' })
    const [first, rest] = m.patch.moreCopies as Record<string, unknown>[]
    expect(first).toMatchObject({ name: 'Indie exclusive', discogsId: 52, orderStatus: 'ordered', eta: '2026-11-20', shop: 'Bandcamp', paid: '35', tracking: '9400' })
    expect(rest).toEqual(want)
    expect(m.msg).toBe('Moved to the wall. Your other order is still on the way.')
    // read back, the record is owned with one order still on its way
    const after = { ...ordered, ...m.patch } as Rec
    expect(ordersOf(after).map((o) => o.copy.name)).toEqual(['Indie exclusive'])
  })

  it("hangs an ordered record's own order as before, leaving a copy's order on its way", () => {
    const m = arrivedPatch(ordered, 0)!
    expect(m.patch).toMatchObject({ status: 'own', acquired: today() })
    expect(ordersOf({ ...ordered, ...m.patch } as Rec).map((o) => o.ci)).toEqual([1])
  })
})

describe('Got this copy, on an ordered record', () => {
  it('makes the copy the record\'s own, on the wall, and keeps its order as a copy on order', () => {
    const m = gotCopyPatch(ordered, 2, { paid: '25', shop: 'Siren' })!
    expect(m.patch).toMatchObject({ status: 'own', copyName: 'Blue vinyl', paid: '25', shop: 'Siren', shopUrl: 'https://www.roughtrade.com/blue' })
    expect((m.patch.moreCopies as Record<string, unknown>[]).map((c) => [c.name, c.orderStatus])).toEqual([
      ['Indie exclusive', 'ordered'],
      ['Blue vinyl', 'shipped'],
    ])
    expect(m.msg).toBe('Moved to the wall. Your order is still on the way.')
  })
})

describe('Cancelled, still want it', () => {
  it("takes a copy's order off, leaving it a copy you want", () => {
    const m = cancelPatch(ordered, 1)!
    expect((m.patch.moreCopies as Record<string, unknown>[])[0]).toEqual(want)
    expect(m.msg).toBe('Back to the copies you want.')
  })

  it("swaps the record's own order for a copy's, so the record stays on order", () => {
    const m = cancelPatch(ordered, 0)!
    expect(m.patch).toMatchObject({ copyName: 'Blue vinyl', discogsId: 51, orderStatus: 'shipped', tracking: '1Z1', shop: 'Rough Trade' })
    expect((m.patch.moreCopies as Record<string, unknown>[])[0]).toMatchObject({ name: 'Indie exclusive', discogsId: 52 })
    expect((m.patch.moreCopies as Record<string, unknown>[])[0].orderStatus).toBeUndefined()
    expect(m.patch.status).toBeUndefined()
  })

  it('sends a record with no other order back to the hunt', () => {
    expect(cancelPatch({ ...ordered, moreCopies: [want] }, 0)!.patch.status).toBe('wish')
  })
})

describe('a copy on order, kept', () => {
  it('through the edit form', () => {
    const o = stored(toForm(ordered)).moreCopies as Record<string, unknown>[]
    expect(o[0]).toMatchObject({ orderStatus: 'shipped', tracking: '1Z1', paid: '38' })
    expect(o[1].orderStatus).toBeUndefined()
  })

  it('in a library file, marked so an older wall refuses it', () => {
    const f = exportFile({ records: [ordered], gear: [], setups: [], artists: [], settings: {}, app: 'x' })
    expect(f.vinylWall).toBe(3)
    expect((importable(f.records.d).moreCopies as Record<string, unknown>[])[0]).toMatchObject({ orderStatus: 'shipped', tracking: '1Z1' })
    expect(exportFile({ records: [owned], gear: [], setups: [], artists: [], settings: {}, app: 'x' }).vinylWall).toBe(1)
  })
})
