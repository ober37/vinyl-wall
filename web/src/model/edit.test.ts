import { describe, expect, it } from 'vitest'
import { patchFor, toForm, withSync } from './edit'
import type { Rec } from './record'
import { aboutPending } from './task'

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

  it('writes only changed fields', () => {
    const f = toForm(owned)
    expect(patchFor(owned, f, { ...f, title: 'Kind of Blue ' })).toEqual({})
    expect(patchFor({ ...owned, about: undefined }, f, { ...f, title: 'Kind Of Blue' })).toEqual({ title: 'Kind Of Blue' })
    expect(patchFor(owned, f, { ...f, catalog: 'CS 8163' })).toEqual({ catalog: 'CS 8163' })
  })

  it('a new title or artist looks the album info up again', () => {
    const r = { ...owned, aboutAt: '2026-10-01', aboutV: 3, artistRef: 'mb-1', about: {} }
    const f = toForm(r)
    const reset = { aboutAt: '', aboutV: 0, artistRef: '', about: null }
    expect(patchFor(r, f, { ...f, title: 'Kind of Blue (Legacy)' })).toEqual({ title: 'Kind of Blue (Legacy)', ...reset })
    expect(patchFor(r, f, { ...f, artist: 'Miles Davis Sextet' })).toEqual({ artist: 'Miles Davis Sextet', ...reset })
    expect(aboutPending({ ...r, aboutAt: '', aboutV: 0, about: undefined })).toBe(true)
    expect(patchFor(r, f, { ...f, why: 'hi' })).toEqual({ why: 'hi' })
    // Not this artist was about the old match: it comes off (#63), but not for an edit that keeps the album
    expect(patchFor({ ...r, aboutBlocked: true }, f, { ...f, title: 'x' })).toEqual({ title: 'x', ...reset, aboutBlocked: false })
    expect(patchFor({ ...r, aboutBlocked: true }, f, { ...f, why: 'hi' })).toEqual({ why: 'hi' })
  })

  it('a new title or artist starts over a lookup that gave up', () => {
    const r = { ...owned, about: undefined, lookTries: 3, lookV: 1, lookedAt: Date.now() }
    const f = toForm(r)
    expect(patchFor(r, f, { ...f, title: 'Kind of Blue (Legacy)' })).toEqual({ title: 'Kind of Blue (Legacy)', lookTries: 0 })
    expect(patchFor(r, f, { ...f, why: 'hi' })).toEqual({ why: 'hi' })
  })

  it('flags Discogs sync only for synced fields', () => {
    expect(withSync({ title: 'a' })).toEqual({ title: 'a', needsSync: true })
    expect(withSync({ catalog: 'a', notes: [] })).toEqual({ catalog: 'a', notes: [] })
    // a release written without how it was matched is the person's choice
    expect(withSync({ discogsId: 5 })).toEqual({ discogsId: 5, discogsMatch: 'set by you', needsSync: true })
    expect(withSync({ discogsId: '' })).toEqual({ discogsId: '', discogsMatch: '', needsSync: true })
    expect(withSync({ discogsId: 5, discogsMatch: 'catalog' })).toEqual({ discogsId: 5, discogsMatch: 'catalog', needsSync: true })
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
    // (a new title or artist also resets the album info: tested above)
    const p = patchFor({ ...owned, about: undefined }, f, { ...f, title: 'a', artist: 'b', why: 'c', shop: 'd', mediaGrade: 'NM' })
    for (const k of ['notes', 'about', 'moreCopies', 'status', 'discogsId', 'matrix']) expect(p).not.toHaveProperty(k)
  })

  it("gives a wanted record's form its copies and priority, stored in production's shapes", () => {
    const wish: Rec = { id: 'w', title: 'A', status: 'wish', label: 'Apple', pressing: 'UK first', discogsId: '12', priority: 1 }
    const f = toForm(wish)
    expect(f).toMatchObject({ label: 'Apple', pressing: 'UK first', copyName: '', budget: '', discogsId: 12, priority: '1', moreCopies: [] })
    expect(patchFor(wish, f, { ...f })).toEqual({})
    expect(patchFor(wish, f, { ...f, priority: '3' })).toEqual({ priority: 3 })
    expect(withSync(patchFor(wish, f, { ...f, label: 'EMI' }))).toEqual({ label: 'EMI' })
    expect(withSync(patchFor(wish, f, { ...f, budget: ' 40 ' }))).toEqual({ budget: '40', needsSync: true })
    const more = [{ name: 'x ', pressing: '', label: '', catalog: '', budget: '', discogsId: '' as const, buyLinks: [], releaseDate: '' }]
    expect(patchFor(wish, f, { ...f, moreCopies: more })).toEqual({ moreCopies: [{ ...more[0], name: 'x' }] })
  })

  it("gives an owned record's form only the copies it still wants", () => {
    const f = toForm({ ...owned, moreCopies: [{ name: 'UK', discogsId: 5 }, null] })
    expect(f.moreCopies).toEqual([{ name: 'UK', pressing: '', label: '', catalog: '', budget: '', discogsId: 5, buyLinks: [], releaseDate: '' }])
    expect(f).not.toHaveProperty('priority')
    expect(f).not.toHaveProperty('copyName')
  })
})
