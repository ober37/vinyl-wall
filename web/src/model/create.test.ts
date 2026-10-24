import { describe, expect, it } from 'vitest'
import { coverPatch, dupeOf, hasArtistInfo, newDoc, NOT_ARTIST } from './create'
import { toForm } from './edit'
import { shrinkImage, type ImageApi } from './image'

const form = (kind: 'own' | 'ordered' | 'wish', x: Record<string, string> = {}) => ({ ...toForm({ id: '', status: kind }), title: 'Aja', artist: 'Steely Dan', ...x })

describe('a new record', () => {
  it('is what production writes, per kind', () => {
    expect(newDoc(form('own'), 'own', null, 5)).toMatchObject({ title: 'Aja', artist: 'Steely Dan', status: 'own', notes: [], added: 5, priority: 2, needsEnrich: true })
    expect(newDoc(form('ordered'), 'ordered', null, 5)).toMatchObject({ status: 'ordered', orderStatus: 'ordered', priority: 2 })
    expect(newDoc(form('wish'), 'wish', null, 5)).toMatchObject({ status: 'wish', priority: 2 })
    expect(newDoc(form('own'), 'own', null)).not.toHaveProperty('needsSync')
  })
  it('is looked up unless it has a cover, year and label', () => {
    expect(newDoc(form('own', { year: '1977', label: 'ABC' }), 'own', 'a1')).not.toHaveProperty('needsEnrich')
    expect(newDoc(form('own', { year: '1977', label: 'ABC' }), 'own', null).needsEnrich).toBe(true)
    expect(newDoc(form('own', { year: '1977' }), 'own', 'a1').needsEnrich).toBe(true)
    expect(newDoc(form('own'), 'own', 'a1').coverAsset).toBe('a1')
  })
  it('opens the same album added in the last two minutes instead of hanging it twice', () => {
    const recs = [{ id: 'x', title: 'AJA', artist: 'steely dan', added: 1000 }]
    expect(dupeOf(recs, { title: 'Aja', artist: 'Steely Dan' }, 1000 + 119000)?.id).toBe('x')
    expect(dupeOf(recs, { title: 'Aja', artist: 'Steely Dan' }, 1000 + 121000)).toBeUndefined()
  })
})

describe('covers and artists', () => {
  it('an uploaded cover stops the lookup and is no longer auto-filled', () => {
    expect(coverPatch({ id: 'r', autoFilled: ['coverAsset', 'year'] }, 'a9')).toEqual({ coverAsset: 'a9', needsEnrich: false, autoFilled: ['year'] })
  })
  it('Not this artist is offered for a matched artist or a summary', () => {
    const ids = new Set(['mb-1'])
    expect(hasArtistInfo({ id: 'r', artistRef: 'mb-1' }, ids)).toBe(true)
    expect(hasArtistInfo({ id: 'r', about: { summary: 's' } }, ids)).toBe(true)
    expect(hasArtistInfo({ id: 'r', artistRef: 'mb-2' }, ids)).toBe(false)
    expect(hasArtistInfo({ id: 'r', artistRef: 'mb-1', aboutBlocked: true }, ids)).toBe(false)
    expect(NOT_ARTIST).toEqual({ artistRef: '', about: null, aboutBlocked: true })
  })
})

describe('shrinking an image', () => {
  const file = (size: number) => new File([new Uint8Array(size)], 'cover.png', { type: 'image/png' })
  const api = (w: number, h: number, out: number | null): ImageApi => ({
    bitmap: async () => ({ width: w, height: h }),
    encode: async () => (out === null ? null : new Blob([new Uint8Array(out)], { type: 'image/jpeg' })),
  })
  it('keeps a small image as it is', async () => {
    const f = file(1000)
    expect(await shrinkImage(f, 500, 0.82, api(400, 400, 10))).toBe(f)
  })
  it('scales a big one to a JPEG', async () => {
    const out = await shrinkImage(file(900000), 500, 0.82, api(1400, 1400, 50000))
    expect([out.name, out.type, out.size]).toEqual(['cover.jpg', 'image/jpeg', 50000])
  })
  it("keeps the original when the JPEG isn't smaller or it can't be read", async () => {
    const f = file(300000)
    expect(await shrinkImage(f, 500, 0.82, api(1400, 1400, 400000))).toBe(f)
    expect(await shrinkImage(f, 500, 0.82, { bitmap: async () => Promise.reject(new Error('HEIC')), encode: async () => null })).toBe(f)
  })
})
