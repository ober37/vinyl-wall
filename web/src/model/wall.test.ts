import { describe, expect, it } from 'vitest'
import { fkey, fold, shownList } from './filter'
import { tagOf, type Rec } from './record'
import { siteOf, stockDim } from './site'

const R = (id: string, x: Partial<Rec>): Rec => ({ id, title: id, artist: 'A', ...x })
const recs = [
  R('own', { title: 'Mötley Crüe', artist: 'Mötley Crüe', added: 1 }),
  R('ord', { status: 'ordered', eta: '2026-10-24', orderStatus: 'shipped' }),
  R('p1', { status: 'wish', priority: 1, budget: '40', moreCopies: [{ budget: '60' }] }),
  R('p2', { status: 'wish', label: 'Blue Note', year: '1957' }),
  R('p3', { status: 'wish', priority: 3 }),
]

describe('filter and search', () => {
  it('keys records by status and priority', () => {
    expect(recs.map(fkey)).toEqual(['own', 'ord', 'p1', 'p2', 'p3'])
  })
  it('folds accents and case', () => expect(fold('Mötley CRÜE')).toBe('motley crue'))
  it('counts, filters, and ignores a filter on a badge no record has', () => {
    const { n, list, on } = shownList(recs.slice(0, 2), ['ord', 'p1'], '')
    expect(n).toEqual({ own: 1, ord: 1 })
    expect(on).toEqual(['ord'])
    expect(list.map((r) => r.id)).toEqual(['ord'])
    expect(shownList(recs.slice(0, 2), ['p1'], '').list).toHaveLength(2)
  })
  it('needs every word in the title, artist, label or year', () => {
    expect(shownList(recs, [], 'motley').list.map((r) => r.id)).toEqual(['own'])
    expect(shownList(recs, [], 'blue 1957').list.map((r) => r.id)).toEqual(['p2'])
    expect(shownList(recs, [], 'blue 1958').list).toEqual([])
  })
})

describe('hang tags', () => {
  it('shows an order and a hunt, not an owned record', () => {
    expect(tagOf(recs[0])).toBeNull()
    expect(tagOf(recs[1])).toEqual({ text: 'Shipped · ' + new Date('2026-10-24T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), tone: 'ship' })
    expect(tagOf(recs[2])).toEqual({ text: 'Top want · ≤$60', tone: 'want' })
    expect(tagOf(recs[3])).toEqual({ text: 'Want', tone: 'paper' })
    expect(tagOf(recs[4])).toEqual({ text: 'Someday', tone: 'someday' })
  })
})

describe('settings', () => {
  it('defaults to the listening room on barnwood', () => {
    expect(siteOf(null)).toEqual({
      title: 'My Vinyl Wall',
      hang: 'barn',
      background: { kind: 'photo', url: 'backgrounds/listening-room.jpg', pos: undefined, dim: 83 },
    })
  })
  it('falls back from unknown values and bad asset ids', () => {
    expect(siteOf({ hang: 'nails', bg: { kind: 'preset', preset: 'moon' } })).toMatchObject({ hang: 'barn', background: { url: 'backgrounds/listening-room.jpg' } })
    expect(siteOf({ bg: { kind: 'photo', assetId: '../x' } }).background).toMatchObject({ url: 'backgrounds/listening-room.jpg' })
    expect(siteOf({ bg: { kind: 'photo', assetId: 'abc' }, dim: 40 }).background).toEqual({ kind: 'photo', url: '/_blob/abc', dim: 40 })
    expect(siteOf({ bg: { kind: 'preset', preset: 'grille' } }).background).toEqual({ kind: 'pattern', preset: 'grille' })
    expect(siteOf({ title: '  ' }).title).toBe('My Vinyl Wall')
  })
  it('maps a stock photo slider to the wash', () => {
    expect([0, 50, 100].map(stockDim)).toEqual([70, 83, 95])
  })
})
