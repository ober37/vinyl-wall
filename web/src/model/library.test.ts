import { describe, expect, it } from 'vitest'
import { artistFill, doneMessage, fillPatch, gearFill, planImport, planSummary, setupFill, type Plan } from './library'

// #90: what an import fills in on what the wall already has
describe('fillPatch', () => {
  const wall = { id: 'w', title: 'Aja', artist: 'Steely Dan', status: 'own', year: '1977', label: '', notes: [{ d: '2026-01-01', t: 'Got it' }] }

  it('fills only what the wall leaves empty, and the wall always wins', () => {
    const p = fillPatch(wall, { title: 'AJA', artist: 'Steely Dan', status: 'own', year: '1980', label: 'ABC', catalog: 'AB-1006', runtime: 40 })
    expect(p).toEqual({ label: 'ABC', catalog: 'AB-1006', runtime: 40 })
  })

  it('takes nothing that is itself empty', () => {
    expect(fillPatch(wall, { title: 'Aja', artist: 'Steely Dan', status: 'own', label: '', catalog: null, why: [] })).toEqual({})
  })

  it("brings in notes the wall lacks, after its own, and never drops one", () => {
    const p = fillPatch(wall, { title: 'Aja', artist: 'Steely Dan', notes: [{ d: '2026-02-01', t: 'Played it' }, { d: '2026-01-01', t: 'Got it' }] })
    expect(p.notes).toEqual([{ d: '2026-01-01', t: 'Got it' }, { d: '2026-02-01', t: 'Played it' }])
    expect(fillPatch(wall, { title: 'Aja', artist: 'Steely Dan', notes: [] })).not.toHaveProperty('notes')
  })

  it('brings in research the wall lacks, by id', () => {
    const p = fillPatch({ ...wall, researchLog: [{ id: 'a', question: 'q' }] }, { title: 'Aja', researchLog: [{ id: 'a', question: 'other' }, { id: 'b' }] })
    expect(p.researchLog).toEqual([{ id: 'a', question: 'q' }, { id: 'b' }])
  })

  it("fills a status's own fields only when the wall and the file agree on the status", () => {
    const owned = { title: 'Aja', artist: 'Steely Dan', status: 'own', paid: '30', mediaGrade: 'NM', matrix: 'A1' }
    expect(fillPatch(wall, owned)).toMatchObject({ paid: '30', mediaGrade: 'NM', matrix: 'A1' })
    const wanted = { ...wall, status: 'wish' }
    expect(fillPatch(wanted, owned)).toEqual({ matrix: 'A1' })
  })

  it('adds wanted copies whose pressing or Discogs release is new, on a hunt both agree on', () => {
    const hunt = { id: 'h', title: 'Aja', artist: 'Steely Dan', status: 'wish', pressing: 'MoFi', moreCopies: [{ name: 'Orig', pressing: '1977 ABC', discogsId: 5 }] }
    const p = fillPatch(hunt, {
      title: 'Aja', artist: 'Steely Dan', status: 'wish', pressing: 'MoFi',
      moreCopies: [{ pressing: '1977 abc' }, { discogsId: 5 }, { name: 'UK', pressing: 'UK first' }, { name: 'nothing' }],
    })
    expect((p.moreCopies as { pressing: string }[]).map((c) => c.pressing)).toEqual(['1977 ABC', 'UK first'])
    expect(fillPatch({ ...hunt, status: 'own' }, { title: 'Aja', status: 'wish', moreCopies: [{ pressing: 'UK first' }] })).not.toHaveProperty('moreCopies')
  })

  it('gives a record without a cover the file’s, unless its cover was removed', () => {
    expect(fillPatch(wall, { title: 'Aja', coverAsset: 'k9' })).toEqual({ coverAsset: 'k9' })
    expect(fillPatch({ ...wall, coverAsset: 'mine' }, { title: 'Aja', coverAsset: 'k9' })).toEqual({})
    expect(fillPatch({ ...wall, coverBlocked: true }, { title: 'Aja', coverAsset: 'k9' })).toEqual({})
  })

  it('brings album info only to a record with none, and not over Not this artist', () => {
    const info = { title: 'Aja', about: { summary: 'S' }, aboutAt: '2026-01-01', aboutV: 3, artistRef: 'mb-1' }
    expect(fillPatch(wall, info)).toEqual({ about: { summary: 'S' }, aboutAt: '2026-01-01', aboutV: 3, artistRef: 'mb-1' })
    expect(fillPatch({ ...wall, about: { summary: 'Mine' } }, info)).toEqual({})
    expect(fillPatch({ ...wall, aboutBlocked: true }, info)).toEqual({})
  })

  it("keeps a filled field marked as looked up when the file's lookup filled it", () => {
    const p = fillPatch({ ...wall, autoFilled: ['year'] }, { title: 'Aja', label: 'ABC', catalog: 'X', autoFilled: ['label', 'year'] })
    expect(p.autoFilled).toEqual(['year', 'label'])
  })

  it("takes the file's Discogs release with how it was matched", () => {
    expect(fillPatch(wall, { title: 'Aja', discogsId: 42, discogsMatch: 'master main release' })).toEqual({ discogsId: 42, discogsMatch: 'master main release' })
  })
})

describe('equipment, setups and artists', () => {
  it("adds only the plays a piece of equipment lacks, and counts each play's minutes once", () => {
    const g = { id: 'g', type: 'stylus', name: 'VM95E', minutes: 46, plays: [{ d: '2026-01-01', id: 'r1', title: 'Aja', min: 46 }] }
    const f = { type: 'stylus', name: 'Other', shop: 'Shop', minutes: 92, plays: [{ d: '2026-01-01', id: 'r1', title: 'Aja', min: 46 }, { d: '2026-01-02', id: 'r1', title: 'Aja', min: 23 }] }
    const p = gearFill(g, f)
    expect(p).toMatchObject({ shop: 'Shop', minutes: 69 })
    expect(p.plays).toHaveLength(2)
    expect(gearFill({ ...g, ...p }, f)).toEqual({})
  })

  it("fills a setup's empty name or note", () => {
    expect(setupFill({ id: 's', name: 'Den', note: '' }, { name: 'Other', note: 'Main' })).toEqual({ note: 'Main' })
  })

  it("fills an artist's empty lookup fields", () => {
    expect(artistFill({ id: 'a', name: 'X', summary: '' }, { name: 'Y', summary: 'S', links: [{ kind: 'website', url: 'https://x.example' }], bogus: 1 })).toEqual({
      summary: 'S',
      links: [{ kind: 'website', url: 'https://x.example' }],
    })
  })
})

describe('planImport with what the wall already has', () => {
  const w = {
    records: [
      { id: 'w1', title: 'Aja', artist: 'Steely Dan', status: 'own', year: '' },
      { id: 'w2', title: 'Tusk', artist: 'Fleetwood Mac', status: 'own', year: '1979' },
      { id: 'w3', title: 'Rumours', artist: 'Fleetwood Mac', status: 'own', deleted: true },
    ],
    artists: [],
    gear: [{ id: 'g1', type: 'stylus', name: 'VM95E' }],
    setups: [{ id: 's1', name: 'Den' }],
  }
  const file = (records: object, more: object = {}) => JSON.stringify({ vinylWall: 1, records, ...more })

  it('fills what records lack, skips the ones with nothing new and the deleted, and says so', () => {
    const p = planImport(
      file({ a: { title: 'AJA', artist: 'Steely Dan', year: '1977' }, b: { title: 'Tusk', artist: 'Fleetwood Mac', year: '1980' }, c: { title: 'Rumours', artist: 'Fleetwood Mac', year: '1977' }, d: { title: 'Mirage', artist: 'Fleetwood Mac' } }),
      w,
    ) as Plan
    expect(p.recs.map(([id]) => id)).toEqual(['d'])
    expect(p.fills.recs.map(([id]) => id)).toEqual(['w1'])
    expect(p.skipped).toBe(2)
    expect(planSummary(p)).toBe('Adds 1 record. Fills in missing details on 1 record you already have. Skips 2 records that have nothing new.')
    expect(doneMessage(p, [{ needsEnrich: true }])).toBe(
      "Added 1 record. Filled in missing details on 1 record. We'll look up covers or album info for 1 record. This takes a few minutes.",
    )
  })

  it('fills a record once, even when the file has it twice', () => {
    const p = planImport(file({ a: { title: 'Aja', artist: 'Steely Dan', year: '1977' }, b: { title: 'Aja', artist: 'Steely Dan', label: 'ABC' } }), w) as Plan
    expect(p.fills.recs).toHaveLength(1)
    expect(p.skipped).toBe(1)
  })

  it('fills equipment and setups already here, and a file with only fills says so', () => {
    const p = planImport(file({}, { gear: { g1: { type: 'stylus', name: 'X', shop: 'Shop' } }, setups: { s1: { name: 'Den', note: 'Main' } } }), w) as Plan
    expect([p.fills.gear.length, p.fills.setups.length]).toEqual([1, 1])
    expect(planSummary(p)).toBe('Fills in missing details on 1 piece of equipment and 1 setup you already have.')
    expect(doneMessage(p, [])).toBe('Filled in missing details on 1 piece of equipment and 1 setup.')
  })

  it('brings in the artist of album info it fills in', () => {
    const p = planImport(
      file({ a: { title: 'Aja', artist: 'Steely Dan', about: { summary: 'S' }, artistRef: 'mb-sd' } }, { artists: { 'mb-sd': { name: 'Steely Dan' }, 'mb-x': { name: 'X' } } }),
      w,
    ) as Plan
    expect(p.artists.map(([id]) => id)).toEqual(['mb-sd'])
  })

  it('has nothing to do once a file is in', () => {
    expect(planImport(file({ b: { title: 'Tusk', artist: 'Fleetwood Mac', year: '1980' } }), w)).toBe('Everything in this file is already on the wall.')
  })
})
