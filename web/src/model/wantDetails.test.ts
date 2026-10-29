// #67: + Want fills the copy from what the research found about the pressing
import { describe, expect, it } from 'vitest'
import { wantCopies } from './copies'
import type { Rec } from './record'
import { alreadyWanted, detailsFor, strList, undoWantPatch, wantPatch, type Research } from './research'

const P = '2018 American Recordings reissue'
const entry: Research = {
  pressings: [`${P}: the inexpensive everyday black copy`, '1994 original: the one collectors chase'],
  pressingDetails: [
    { pressing: P, name: '2018 reissue', label: 'American Recordings', catalog: '19075865591', budget: '$28', link: 'roughtrade.com/us/p/x', releaseDate: '2099-03-01' },
    { pressing: 'not listed', name: 'ignored' },
  ],
}
const hunt: Rec = { id: 'h', title: 'American Recordings', artist: 'Johnny Cash', status: 'wish', label: 'American', autoFilled: ['label', 'year'], notes: [] }
const apply = (r: Rec, p: Record<string, unknown>) => ({ ...r, ...p }) as Rec

describe('+ Want from research details', () => {
  it('reads only well-formed details, matched by the pressing', () => {
    expect(detailsFor(entry, P)).toEqual({ name: '2018 reissue', label: 'American Recordings', catalog: '19075865591', budget: '28',
      link: 'https://roughtrade.com/us/p/x', releaseDate: '2099-03-01' })
    expect(detailsFor(entry, '1994 original')).toEqual({})
    expect(detailsFor({ pressingDetails: [{ pressing: P, budget: 'cheap', link: 'not a link', releaseDate: 'March' }] }, P)).toEqual({})
    expect(detailsFor({ pressingDetails: 'junk' }, P)).toEqual({})
  })

  it("fills the record's first copy, and the pressing's label takes over from the album's looked-up one", () => {
    const { patch } = wantPatch(hunt, P, detailsFor(entry, P))
    expect(patch).toEqual({ pressing: P, copyName: '2018 reissue', label: 'American Recordings', catalog: '19075865591', budget: '28',
      buyLinks: ['https://roughtrade.com/us/p/x'], releaseDate: '2099-03-01', autoFilled: ['year'] })
  })

  it('Undo puts back everything + Want changed', () => {
    const { patch, undo } = wantPatch(hunt, P, detailsFor(entry, P))
    const back = undoWantPatch(apply(hunt, patch), undo)!
    expect(apply(apply(hunt, patch), back)).toMatchObject({ pressing: '', copyName: '', label: 'American', catalog: '', budget: '',
      buyLinks: [], releaseDate: '', autoFilled: ['label', 'year'] })
  })

  it('fills another copy the same way, and fills only what it has', () => {
    const chosen = { ...hunt, copyName: 'Original', pressing: '1994 original' }
    const { patch } = wantPatch(chosen, P, { name: '2018 reissue', catalog: '19075865591' })
    expect(wantCopies(apply(chosen, patch))[1]).toEqual({ name: '2018 reissue', pressing: P, label: '', catalog: '19075865591', budget: '',
      discogsId: '', buyLinks: [], releaseDate: '' })
  })

  it('stores the link only as where to buy the copy', () => {
    const chosen = { ...hunt, copyName: 'Original', pressing: '1994 original' }
    const { patch } = wantPatch(chosen, P, detailsFor(entry, P))
    expect((patch.moreCopies as Record<string, unknown>[])[0]).toEqual({ name: '2018 reissue', pressing: P, label: 'American Recordings',
      catalog: '19075865591', budget: '28', discogsId: '', buyLinks: ['https://roughtrade.com/us/p/x'], releaseDate: '2099-03-01' })
  })

  it('research without details works as before', () => {
    expect(wantPatch(hunt, '1994 original', detailsFor(entry, '1994 original')).patch).toEqual({ pressing: '1994 original' })
    expect(wantPatch(hunt, '1994 original').patch).toEqual({ pressing: '1994 original' })
  })

  it('still marks a pressing already wanted, and the text lines read as before', () => {
    const { patch } = wantPatch(hunt, P, detailsFor(entry, P))
    expect(alreadyWanted(apply(hunt, patch), strList(entry.pressings)[0])).toBe(true)
    expect(strList(entry.pressings)).toEqual(entry.pressings)
  })
})
