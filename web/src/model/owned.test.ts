import { describe, expect, it } from 'vitest'
import { exportFile, fillPatch, importable, planImport } from './library'
import { copyRec, gotPatch, moreOwned, ownedRecs, ownedTitle } from './owned'
import { movePatch } from './status'
import type { Rec } from './record'

// several owned pressings on one record (#121)
const stereo = { name: 'Stereo', pressing: '1966 stereo', label: '', catalog: 'BST 81577', matrix: '', discogsId: 31, mediaGrade: 'NM', sleeveGrade: '', paid: '35', shop: '', shopUrl: '', acquired: '2023-01-02', runtime: '' }
const rec: Rec = { id: 'r', title: 'Blue Train', artist: 'John Coltrane', status: 'own', discogsId: 30, pressing: '1957 mono', ownedCopies: [stereo, 'junk', null] }

describe('owned copies', () => {
  it('reads the copies after the first, skipping anything that is not one', () => {
    expect(moreOwned(rec)).toEqual([stereo])
    expect(ownedRecs(rec).map((c, i) => ownedTitle(c, i))).toEqual(['1957 mono', 'Stereo'])
    expect(ownedRecs({ ...rec, status: 'wish' })).toEqual([])
  })

  it("a copy's release reads as synced only when the task keeps its item", () => {
    const synced = { ...rec, discogsSync: { at: '2026-10-30 10:00 UTC', ownedInsts: [{ rid: 31, instanceId: 7 }] } }
    expect(copyRec(synced, moreOwned(synced)[0]).discogsSync).toEqual({ state: 'synced', where: 'collection', at: '2026-10-30 10:00 UTC' })
    expect(copyRec(rec, moreOwned(rec)[0]).discogsSync).toEqual({})
  })

  it('moving to the hunt and back keeps the other copies', () => {
    const away = movePatch(rec, 'wish')!.patch
    expect(away).not.toHaveProperty('ownedCopies')
    expect(movePatch({ ...rec, ...away }, 'own')!.patch).not.toHaveProperty('ownedCopies')
  })

  it('Got this copy only acts on a copy still wanted on an owned record', () => {
    expect(gotPatch(rec, 1, { paid: '', shop: '' })).toBeNull()
    expect(gotPatch({ ...rec, status: 'wish', moreCopies: [{ name: 'x' }] }, 1, { paid: '', shop: '' })).toBeNull()
  })

  it('a library file carries the other copies, and fills in only the ones the wall lacks', () => {
    expect(importable({ ...rec }).ownedCopies).toEqual([stereo])
    const mono2 = { ...stereo, name: 'Mono, second', pressing: '1957 mono', discogsId: 30, acquired: '2024-06-01' }
    const p = fillPatch({ ...rec, ownedCopies: [stereo] }, { ...rec, ownedCopies: [stereo, mono2] })
    expect(p.ownedCopies).toEqual([stereo, mono2])
    expect(fillPatch({ ...rec, ownedCopies: [stereo] }, { ...rec, ownedCopies: [stereo] })).not.toHaveProperty('ownedCopies')
    expect(fillPatch({ ...rec, status: 'wish' }, { ...rec, ownedCopies: [stereo] })).not.toHaveProperty('ownedCopies')
  })

  it("a file's own first copy comes in too when the file holds several and the wall lacks it", () => {
    const wall = { ...rec, discogsId: 31, pressing: '1966 stereo', copyName: 'Stereo', acquired: '2023-01-02', ownedCopies: [] }
    const p = fillPatch(wall, { ...rec, acquired: '2020-05-01', ownedCopies: [stereo] })
    expect((p.ownedCopies as { pressing: string; discogsId: number }[]).map((c) => [c.pressing, c.discogsId])).toEqual([['1957 mono', 30]])
  })

  it('names a copy with only a release by it, as a copy wanted is named', () => {
    expect(ownedTitle({ id: 'x', discogsId: 41 }, 1)).toBe('Discogs release 41')
    expect(ownedTitle({ id: 'x' }, 1)).toBe('Copy 2')
  })

  it('a file holding other copies is vinylWall 2, so an older wall refuses it; this one reads it', () => {
    const file = (records: Rec[]) => exportFile({ records, gear: [], setups: [], artists: [], settings: {}, app: 'x' })
    expect(file([{ ...rec, ownedCopies: [] }]).vinylWall).toBe(1)
    const f = file([rec])
    expect(f.vinylWall).toBe(2)
    const plan = planImport(JSON.stringify(f), { records: [], artists: [], gear: [], setups: [] })
    expect(typeof plan).not.toBe('string')
  })
})
