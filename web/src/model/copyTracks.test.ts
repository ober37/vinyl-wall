import { describe, expect, it } from 'vitest'
import { copyAlbum, ownTracks, wantCopies } from './copies'
import { arrivedPatch, ordersOf } from './copyOrders'
import { stored, toForm } from './edit'
import { gotPatch, ownedRecs, ownedTitle } from './owned'
import { lastCopy, playMin, playNote } from './plays'
import { playMonths, recordTracks, type Rec } from './record'

// each pressing's own tracklist and runtime (#138)
const ALBUM = [
  { pos: 'A1', title: 'One', dur: '10:00' },
  { pos: 'A2', title: 'Two', dur: '10:00' },
  { pos: 'B1', title: 'Three', dur: '10:00' },
  { pos: 'B2', title: 'Four', dur: '10:00' },
]
const DELUXE = [...ALBUM, { pos: 'C1', title: 'Bonus Demo', dur: '6:00' }, { pos: 'C2', title: 'Bonus Live', dur: '6:00' }]
const rec: Rec = {
  id: 'd',
  title: 'Deluxe test',
  artist: 'Band',
  status: 'own',
  runtime: 40,
  about: { tracks: ALBUM, tracksSource: 'discogs' },
  ownedCopies: [
    { name: 'Deluxe 2LP', discogsId: 99, releaseTracks: { rid: 99, tracks: DELUXE, runtime: 52 } },
    { name: 'Same', discogsId: 98, releaseTracks: { rid: 98, tracks: ALBUM, runtime: 40 } },
    { name: 'Typed', discogsId: '', runtime: '45' },
    { name: 'Moved', discogsId: 97, releaseTracks: { rid: 96, tracks: DELUXE, runtime: 52 } },
  ],
  notes: [],
}
const [album, deluxe, same, typed, moved] = ownedRecs(rec)

describe('a copy reads as its own pressing (#138)', () => {
  it("has its release's tracklist and runtime; one without its own has the album's", () => {
    expect(recordTracks(deluxe).map((t) => t.title)).toContain('Bonus Demo')
    expect(deluxe.runtime).toBe(52)
    expect(recordTracks(typed)).toEqual(ALBUM)
    expect(typed.runtime).toBe(45)
    // a tracklist from a release the copy has since left is read again, never used
    expect(recordTracks(moved)).toEqual(ALBUM)
    expect(moved.runtime).toBe(40)
  })

  it('a typed runtime wins over its release', () => {
    expect(copyAlbum(rec, { discogsId: 99, releaseTracks: { rid: 99, tracks: DELUXE, runtime: 52 }, runtime: '50' }).runtime).toBe(50)
  })

  it('shows its own tracklist only when its tracks or titles differ from the album', () => {
    expect(ownTracks(album, deluxe)).toBe(true)
    expect(ownTracks(album, same)).toBe(false)
    expect(ownTracks(album, typed)).toBe(false)
    const timed = ownedRecs({ ...rec, ownedCopies: [{ discogsId: 5, releaseTracks: { rid: 5, tracks: ALBUM.map((t) => ({ ...t, dur: '9:59' })) } }] })[1]
    expect(ownTracks(album, timed)).toBe(false)
  })

  it('a play of the deluxe copy counts its runtime, and says which copy it was', () => {
    expect(playMin(deluxe, 'full', [])).toBe(52)
    expect(playMin(album, 'full', [])).toBe(40)
    expect(playMin(deluxe, 'tracks', ['C1'])).toBe(6)
    const n = playNote(deluxe, 'full', '', [], '', 'Deluxe 2LP')
    expect(n).toMatchObject({ t: 'Played the whole album (~52 min)', copy: 'Deluxe 2LP' })
    expect(playNote(album, 'full', '', [])).not.toHaveProperty('copy')
  })

  it('the history names the copy, its tracks by its own titles; older plays keep their minutes', () => {
    const names = ownedRecs(rec).map((c, i): [string, Rec] => [ownedTitle(c, i), c])
    const r = {
      ...rec,
      notes: [
        { d: '2026-10-01', t: 'Played the whole album (~40 min)' },
        { d: '2026-10-02', t: 'Played 1 track (~6 min)', tracks: ['C1'], copy: 'Deluxe 2LP' },
      ],
    }
    const [m] = playMonths(r, names)
    expect(m.plays.map((p) => p.what)).toEqual(['1 track · Bonus Demo · Deluxe 2LP', 'Whole album'])
    expect(m.min).toBe(46)
    // one copy: no copy named
    expect(playMonths(r)[0].plays[0].what).toBe('1 track · C1')
  })

  it('starts Log a play on the copy last played', () => {
    const names = ['Mono', 'Deluxe 2LP', 'Same']
    expect(lastCopy({ ...rec, notes: [null, { t: 'Played the whole album (~40 min)', copy: 'Deluxe 2LP' }, { t: 'x' }] }, names)).toBe(1)
    expect(lastCopy({ ...rec, notes: [{ t: 'Played the whole album (~40 min)', copy: 'Gone' }] }, names)).toBe(0)
  })
})

describe("a copy's tracklist goes where the copy goes", () => {
  const T = { rid: 7, tracks: DELUXE, runtime: 52 }
  it('a wanted copy got, or an ordered one arrived, joins your copies with it', () => {
    const r: Rec = { id: 'w', status: 'own', notes: [], moreCopies: [{ name: 'Want', discogsId: 7, releaseTracks: T }, { name: 'On order', discogsId: 7, releaseTracks: T, orderStatus: 'shipped' }] }
    expect((gotPatch(r, 1, { paid: '', shop: '' })!.patch.ownedCopies as Rec[])[0].releaseTracks).toEqual(T)
    expect((arrivedPatch(r, 2)!.patch.ownedCopies as Rec[])[0].releaseTracks).toEqual(T)
  })

  it('an order reads its copy’s tracklist, and an edit keeps it', () => {
    const r: Rec = { id: 'o', status: 'own', runtime: 40, about: { tracks: ALBUM }, notes: [], moreCopies: [{ name: 'On order', discogsId: 7, releaseTracks: T, orderStatus: 'shipped' }] }
    expect(recordTracks(ordersOf(r)[0].rec)).toEqual(DELUXE)
    expect(wantCopies(r)[1].releaseTracks).toEqual(T)
    expect((stored(toForm(r)).moreCopies as Rec[])[0].releaseTracks).toEqual(T)
  })

  it('an owned copy keeps a typed runtime, and stores none when blank', () => {
    const f = toForm(rec)
    const o = stored(f).ownedCopies as Rec[]
    expect(o[2].runtime).toBe('45')
    expect(o[0]).not.toHaveProperty('runtime')
    expect(o[0].releaseTracks).toEqual({ rid: 99, tracks: DELUXE, runtime: 52 })
  })
})
