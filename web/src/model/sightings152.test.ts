// #152: sightings on a wanted record, linked to the shop by id so a rename follows it
import { describe, expect, it } from 'vitest'
import { hangTag } from './copyOrders'
import { fillPatch, importable } from './library'
import type { Rec } from './record'
import { addSighting, agoText, recentSighting, removeSighting, seenAt, sightingsOf } from './sightings'
import type { Shop } from './shops'

const NS: Shop = { id: 'ns', name: 'Northside', kind: 'local' }
const want: Rec = { id: 'h', title: 'Hunt', artist: 'Band', status: 'wish', priority: 1 }
const day = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('sightings', () => {
  it("links a shop on your list by its id, keeps the name it had, and follows a rename", () => {
    const { sightings } = addSighting(want, { shop: 'northside', d: day(0), price: '28', pressing: '', note: ' used bin ' }, [NS])
    expect(sightings[0]).toMatchObject({ shopId: 'ns', shop: 'northside', price: '28', note: 'used bin' })
    expect(sightings[0]).not.toHaveProperty('pressing')
    const s = sightingsOf({ ...want, sightings })[0]
    expect(seenAt(s, [{ ...NS, name: 'Northside Records & Tapes' }])).toBe('Northside Records & Tapes')
    // removed from the list: the name it had
    expect(seenAt(s, [])).toBe('northside')
  })

  it("keeps a shop that isn't on your list by name", () => {
    const { sightings } = addSighting(want, { shop: 'Corner Groove', d: day(0) }, [NS])
    expect(sightings[0]).not.toHaveProperty('shopId')
    expect(seenAt(sightingsOf({ ...want, sightings })[0], [NS])).toBe('Corner Groove')
  })

  it('counts a sighting from the last 30 days on a wanted record only, and says when on the tag', () => {
    expect(recentSighting({ ...want, sightings: [{ shop: 'A', d: day(31) }] })).toBeUndefined()
    expect(recentSighting({ ...want, sightings: [{ shop: 'A', d: day(31) }, { shop: 'B', d: day(3) }] })?.shop).toBe('B')
    expect(recentSighting({ ...want, status: 'own', sightings: [{ shop: 'A', d: day(1) }] })).toBeUndefined()
    expect(hangTag({ ...want, sightings: [{ shop: 'A', d: day(3) }] })).toEqual({ text: 'Seen 3 days ago', tone: 'want' })
    expect(hangTag({ ...want, sightings: [{ shop: 'A', d: day(40) }] })?.text).toBe('Top want')
    expect(agoText(day(0))).toBe('today')
    expect(agoText(day(1))).toBe('yesterday')
  })

  it('takes one off by id, or by shop and day when one has no id', () => {
    const r = { ...want, sightings: [{ id: 'a', shop: 'A', d: day(1) }, { shop: 'B', d: day(2) }] }
    const [a, b] = sightingsOf(r)
    expect(removeSighting(r, a)?.sightings).toEqual([{ shop: 'B', d: day(2) }])
    expect(removeSighting(r, b)?.sightings).toEqual([{ id: 'a', shop: 'A', d: day(1) }])
    expect(removeSighting({ ...want, sightings: [] }, a)).toBeNull()
  })

  it('come in from a library file, and an import adds the ones the wall lacks', () => {
    expect(importable({ title: 'Hunt', sightings: [{ id: 'a', shop: 'A', d: '2026-01-01' }] })).toHaveProperty('sightings')
    const p = fillPatch({ ...want, sightings: [{ id: 'a', shop: 'A', d: '2026-01-01' }] }, { title: 'Hunt', artist: 'Band', sightings: [{ id: 'a', shop: 'A2', d: '2026-01-01' }, { id: 'b', shop: 'B', d: '2026-02-01' }] })
    expect(p.sightings).toEqual([{ id: 'a', shop: 'A', d: '2026-01-01' }, { id: 'b', shop: 'B', d: '2026-02-01' }])
  })
})
