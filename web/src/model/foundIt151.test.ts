// #151: buying a wanted copy in person, at a shop that isn't the one in the copy's buy link
import { describe, expect, it } from 'vitest'
import { pickPatch } from './copies'
import { gotCopyPatch, orderCopyPatch } from './copyOrders'
import type { Rec } from './record'
import { shopSuggest, type Shop } from './shops'
import { movePatch } from './status'

const ONLINE = 'https://www.bigvinyl.example/products/anniversary-lp'
const NORTHSIDE: Shop = { id: 'ns', name: 'Northside Trading Post in Lakeview, IL', kind: 'local', url: 'https://northsidetrading.example/', place: 'Lakeview, IL' }
const SHOPS: Shop[] = [
  NORTHSIDE,
  { id: 'rt', name: 'Rough Trade', kind: 'online', url: 'https://www.roughtrade.com/' },
  { id: 'dg', name: 'Dusty Groove', kind: 'local', url: 'https://www.dustygroove.com/', place: 'Chicago, IL' },
]
// the issue's repro: a guessed first copy, and a second with one online buy link
const hunt: Rec = {
  id: 'h', title: 'Hunt', status: 'wish', discogsId: 111, discogsMatch: 'vinyl: earliest original pressing', barcodes: { rid: 111, codes: ['012345678905'] },
  pressing: '2001 original', budget: '60',
  moreCopies: [{ name: '25th anniversary', pressing: '2026 reissue', discogsId: 222, budget: '35', buyLinks: [ONLINE] }],
}
const owned: Rec = { id: 'o', title: 'Owned', status: 'own', moreCopies: [{ name: 'Reissue', buyLinks: [ONLINE] }] }
const ordered: Rec = { id: 'd', title: 'Ordered', status: 'ordered', orderStatus: 'ordered', moreCopies: [{ name: 'Reissue', buyLinks: [ONLINE] }] }
const det = { paid: '32', shop: 'Northside Trading Post in Lakeview, IL' }

describe('Found it at another shop (#151 item 1)', () => {
  it("doesn't take the copy's link to another shop as the shop's website", () => {
    expect(movePatch(hunt, 'own', det, 1)!.patch.shopUrl ?? '').toBe('')
    expect(movePatch(hunt, 'own', { ...det, shopUrl: NORTHSIDE.url }, 1)!.patch.shopUrl).toBe(NORTHSIDE.url)
    expect(gotCopyPatch(owned, 1, det)!.patch.ownedCopies).toMatchObject([{ shopUrl: '' }])
    expect(gotCopyPatch(ordered, 1, det)!.patch.shopUrl).toBe('')
    expect(orderCopyPatch(owned, 1, det)!.patch.moreCopies).toMatchObject([{ shopUrl: '' }])
  })
  it("still takes it when no shop is typed, or the shop typed is the link's", () => {
    expect(movePatch(hunt, 'own', { paid: '', shop: '' }, 1)!.patch.shopUrl).toBe(ONLINE)
    expect(movePatch(hunt, 'own', { paid: '', shop: 'Big Vinyl' }, 1)!.patch.shopUrl).toBe(ONLINE)
    expect(gotCopyPatch(owned, 1, { paid: '', shop: 'bigvinyl.example' })!.patch.ownedCopies).toMatchObject([{ shopUrl: ONLINE }])
  })
})

describe('a shop on your list, typed another way (#151 item 2)', () => {
  it('suggests it by its words, ignoring in and the, with the last word partly typed', () => {
    expect(shopSuggest(SHOPS, 'Northside Trading Lakeview, IL')).toEqual([NORTHSIDE.name])
    expect(shopSuggest(SHOPS, 'Northside Trading Post in Lakeview')).toEqual([NORTHSIDE.name])
    expect(shopSuggest(SHOPS, 'northside trad')).toEqual([NORTHSIDE.name])
    expect(shopSuggest(SHOPS, 'Northside Records')).toEqual([])
  })
  it('lists every shop, local first, before anything is typed, and none once one is named exactly', () => {
    expect(shopSuggest(SHOPS, '')).toEqual(['Dusty Groove', NORTHSIDE.name, 'Rough Trade'])
    expect(shopSuggest(SHOPS, 'rough trade')).toEqual([])
  })
})

describe('the copy that moves aside (#151 item 4)', () => {
  it("loses a release the sync guessed, and its barcodes; the record's release is then one you chose", () => {
    const p = pickPatch(hunt, 1)
    expect(p).toMatchObject({ discogsId: 222, discogsMatch: '' })
    expect(p.moreCopies).toEqual([expect.objectContaining({ pressing: '2001 original', discogsId: '' })])
    expect((p.moreCopies as object[])[0]).not.toHaveProperty('barcodes')
  })
  it('keeps a release someone chose', () => {
    const p = pickPatch({ ...hunt, discogsMatch: 'set by you' }, 1)
    expect(p.moreCopies).toEqual([expect.objectContaining({ discogsId: 111 })])
  })
})

describe('an owned copy (#151 items 5 and 6)', () => {
  it('has no buy links, keeps its budget', () => {
    const p = movePatch(hunt, 'own', det, 1)!.patch
    expect(p).toMatchObject({ buyLinks: [], budget: '35' })
    const lone = movePatch({ id: 'x', status: 'wish', buyLinks: [ONLINE], budget: '20' }, 'own', det)!.patch
    expect(lone.buyLinks).toEqual([])
    expect(lone).not.toHaveProperty('budget')
    expect(movePatch({ id: 'x', status: 'wish', buyLinks: [ONLINE] }, 'ordered', det)!.patch).not.toHaveProperty('buyLinks')
  })
  it('new and sealed is graded Mint', () => {
    expect(movePatch(hunt, 'own', { ...det, sealed: true }, 1)!.patch).toMatchObject({ mediaGrade: 'M', sleeveGrade: 'M' })
    expect(movePatch(hunt, 'own', det, 1)!.patch).not.toHaveProperty('mediaGrade')
    expect(gotCopyPatch(owned, 1, { ...det, sealed: true })!.patch.ownedCopies).toMatchObject([{ mediaGrade: 'M', sleeveGrade: 'M' }])
    expect(gotCopyPatch(ordered, 1, { ...det, sealed: true })!.patch).toMatchObject({ mediaGrade: 'M', sleeveGrade: 'M', buyLinks: [] })
  })
})
