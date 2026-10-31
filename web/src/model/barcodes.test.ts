// #88: each copy's barcodes stay with it, and a shop's barcode page opens that pressing
import { describe, expect, it } from 'vitest'
import { copiesPatch, copyBarcode, pickPatch, wantCopies } from './copies'
import { stored, toForm } from './edit'
import type { Rec } from './record'

const hunt = {
  id: 'h', title: 'Nevermind', artist: 'Nirvana', status: 'wish', notes: [], added: 1,
  pressing: 'US original', discogsId: 7097051, barcodes: { rid: 7097051, codes: ['720642442517', '0720642442517'] },
  moreCopies: [{ name: 'Reissue', pressing: '2021 reissue', discogsId: 5, barcodes: { rid: 5, codes: ['602547670233'] } }],
} as unknown as Rec

describe('barcodes (#88)', () => {
  it('reads each copy’s own barcodes, the first UPC or EAN of its own release', () => {
    const [a, b] = wantCopies(hunt)
    expect(copyBarcode(a)).toBe('720642442517')
    expect(copyBarcode(b)).toBe('602547670233')
    expect(copyBarcode({ ...a, barcodes: { rid: 7097051, codes: ['12345678', '4006381333931'] } })).toBe('4006381333931')
    expect(copyBarcode({ ...a, barcodes: { rid: 7097051, codes: ['12345678'] } })).toBe('12345678')
  })

  it('never uses barcodes beside a release they didn’t come from', () => {
    const [a] = wantCopies({ ...hunt, discogsId: 99 } as Rec)
    expect(copyBarcode(a)).toBe('')
    expect(copyBarcode({ ...a, barcodes: undefined })).toBe('')
  })

  it('never uses barcodes beside a release the sync guessed, only one chosen or matched by catalog', () => {
    expect(copyBarcode(wantCopies({ ...hunt, discogsMatch: 'vinyl: earliest original pressing' } as Rec)[0])).toBe('')
    expect(copyBarcode(wantCopies({ ...hunt, discogsMatch: 'master main release' } as Rec)[0])).toBe('')
    expect(copyBarcode(wantCopies({ ...hunt, discogsMatch: 'catalog+pressing' } as Rec)[0])).toBe('720642442517')
    expect(copyBarcode(wantCopies({ ...hunt, discogsMatch: 'set by you' } as Rec)[0])).toBe('720642442517')
  })

  it('keeps barcodes with their copy when copies are saved, picked or moved', () => {
    const [a, b] = wantCopies(hunt)
    expect(copiesPatch(hunt, [b, a])).toMatchObject({ discogsId: 5, barcodes: b.barcodes, moreCopies: [{ discogsId: 7097051, barcodes: a.barcodes }] })
    expect(pickPatch(hunt, 1)).toMatchObject({ discogsId: 5, barcodes: b.barcodes, moreCopies: [{ discogsId: 7097051, barcodes: a.barcodes }] })
    expect((stored(toForm(hunt)).moreCopies as { barcodes?: unknown }[])[0].barcodes).toEqual(b.barcodes)
  })
})
