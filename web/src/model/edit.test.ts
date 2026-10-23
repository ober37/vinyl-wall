import { describe, expect, it } from 'vitest'
import { patchFor, toForm } from './edit'
import type { Rec } from './record'

const owned: Rec = {
  id: 'r1', title: 'Kind of Blue', artist: 'Miles Davis', status: 'own', year: '1959', runtime: 46, label: 'Columbia',
  pressing: '2015 reissue (Discogs r7140383)', discogsId: 7140383, paid: '48', autoFilled: ['year', 'label'],
  notes: [{ d: '2026-01-01', t: 'x' }], about: { summary: 's' }, moreCopies: [],
}

describe('patchFor', () => {
  it('writes nothing when nothing changed', () => {
    const f = toForm(owned)
    expect(patchFor(owned, f, { ...f })).toEqual({})
  })

  it("doesn't strip the Discogs note from an untouched pressing", () => {
    const f = toForm(owned)
    expect(f.pressing).toBe('2015 reissue')
    expect(patchFor(owned, f, { ...f, why: 'hi' })).not.toHaveProperty('pressing')
  })

  it('writes only changed fields, and flags Discogs sync for synced ones', () => {
    const f = toForm(owned)
    expect(patchFor(owned, f, { ...f, title: 'Kind of Blue ' })).toEqual({})
    expect(patchFor(owned, f, { ...f, title: 'Kind Of Blue' })).toEqual({ title: 'Kind Of Blue', needsSync: true })
    expect(patchFor(owned, f, { ...f, catalog: 'CS 8163' })).toEqual({ catalog: 'CS 8163' })
  })

  it('stores production shapes', () => {
    const f = toForm(owned)
    expect(patchFor(owned, f, { ...f, paid: '$ 52' }).paid).toBe('52')
    expect(patchFor(owned, f, { ...f, runtime: '47 min' }).runtime).toBe(47)
    expect(patchFor(owned, f, { ...f, runtime: '' }).runtime).toBe('')
    expect(patchFor(owned, f, { ...f, shopUrl: 'roughtrade.com' }).shopUrl).toBe('https://roughtrade.com/')
    expect(patchFor(owned, f, { ...f, shopUrl: 'not a url' }).shopUrl).toBe('not a url')
  })

  it('drops a typed field from autoFilled', () => {
    const f = toForm(owned)
    expect(patchFor(owned, f, { ...f, year: '1960' })).toEqual({ year: '1960', autoFilled: ['label'] })
  })

  it('never writes fields the form does not own', () => {
    const f = toForm(owned)
    const p = patchFor(owned, f, { ...f, title: 'a', artist: 'b', why: 'c', shop: 'd', mediaGrade: 'NM' })
    for (const k of ['notes', 'about', 'moreCopies', 'status', 'discogsId', 'matrix']) expect(p).not.toHaveProperty(k)
  })

  it("gives a wanted record's form no copy fields", () => {
    const wish: Rec = { id: 'w', title: 'A', status: 'wish', label: 'Apple', pressing: 'UK first' }
    expect(Object.keys(toForm(wish)).sort()).toEqual(['artist', 'runtime', 'title', 'why', 'year'])
  })
})
