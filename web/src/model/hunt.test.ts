import { describe, expect, it } from 'vitest'
import { AUTO_MATCH, copiesLegend, copiesPatch, copyTitle, firstCopyChosen, pickable, stillCopies, wantCopies } from './copies'
import type { Rec } from './record'
import { alreadyWanted, pinPatch, removeResearchPatch, researchEntries, resPrompt, undoWantPatch, wantPatch } from './research'
import { movePatch } from './status'

const hunt: Rec = {
  id: 'h', title: 'Abbey Road', artist: 'The Beatles', status: 'wish', priority: 1,
  copyName: 'UK first', pressing: 'UK first pressing (Discogs r99)', label: 'Apple', catalog: 'PCS 7088', budget: '150', discogsId: 99,
  moreCopies: [
    { name: 'Half-speed', pressing: '2019 half-speed', label: 'Apple', catalog: '', budget: '40', discogsId: '7' },
    { name: '', pressing: '', label: '', catalog: '', budget: '', discogsId: 8 },
    { name: '', pressing: '', label: '', catalog: '', budget: '' },
  ],
  notes: [],
}

describe('copies', () => {
  it('reads the first copy from the record and coerces the rest', () => {
    const C = wantCopies({ ...hunt, moreCopies: [{ name: 3, discogsId: 'x' }, 'junk', null] })
    expect(C).toHaveLength(2)
    expect(C[0]).toEqual({ name: 'UK first', pressing: 'UK first pressing', label: 'Apple', catalog: 'PCS 7088', budget: '150', discogsId: 99, buyLinks: [] })
    expect(C[1]).toEqual({ name: '3', pressing: '', label: '', catalog: '', budget: '', discogsId: '', buyLinks: [] })
  })

  it('titles a copy by name, pressing, release, or place', () => {
    const c = wantCopies(hunt)
    expect(copyTitle(c[0], 0)).toBe('UK first')
    expect(copyTitle({ ...c[1], name: '', pressing: '2019 half-speed\nAbbey Road Studios' }, 1)).toBe('2019 half-speed')
    expect(copyTitle(c[2], 2)).toBe('Discogs release 8')
    expect(copyTitle(c[3], 3)).toBe('Copy 4')
  })

  it("doesn't count a looked-up label or a matcher's release as a chosen copy", () => {
    const bare: Rec = { id: 'b', status: 'wish', label: 'Apple', autoFilled: ['label'], discogsId: 5 }
    for (const m of AUTO_MATCH) expect(firstCopyChosen({ ...bare, discogsMatch: m })).toBe(false)
    expect(firstCopyChosen({ ...bare, discogsMatch: 'import' })).toBe(true)
    expect(firstCopyChosen({ ...bare, discogsId: '', autoFilled: [] })).toBe(true)
    expect(firstCopyChosen({ ...bare, discogsId: '', autoFilled: [], about: { label: 'Apple' } })).toBe(false)
    expect(firstCopyChosen({ ...bare, discogsId: '', budget: '20' })).toBe(true)
  })

  it('lists the copies still wanted, and names them', () => {
    expect(stillCopies(hunt).map(([, i]) => i)).toEqual([0, 1])
    expect(copiesLegend(hunt)).toBe('The copies you want')
    const own = { ...hunt, status: 'own' }
    expect(stillCopies(own).map(([, i]) => i)).toEqual([1])
    expect(copiesLegend(own)).toBe('The copy you still want')
    expect(stillCopies({ id: 'e', status: 'wish', label: 'Apple', autoFilled: ['label'] })).toEqual([])
  })

  it('writes a list back: a hunt into its own fields, an owned record into moreCopies', () => {
    const [, ...rest] = wantCopies(hunt)
    expect(copiesPatch(hunt, rest)).toEqual({
      copyName: 'Half-speed', pressing: '2019 half-speed', label: 'Apple', catalog: '', budget: '40', discogsId: 7, buyLinks: [], moreCopies: rest.slice(1),
    })
    expect(copiesPatch({ ...hunt, status: 'own' }, wantCopies(hunt).slice(0, 2))).toEqual({ moreCopies: [wantCopies(hunt)[1]] })
  })
})

describe('moving a hunt with several copies', () => {
  it('offers only copies with something in them', () => {
    expect(pickable(hunt).map((c) => c.name)).toEqual(['UK first', 'Half-speed'])
    expect(pickable({ ...hunt, status: 'own' })).toEqual([])
  })

  it('makes the picked copy the record and keeps the other offered ones, dropping the rest (as production)', () => {
    const m = movePatch(hunt, 'own', { paid: '45', shop: 'Shop' }, 1)!
    expect(m.patch).toMatchObject({
      status: 'own', copyName: 'Half-speed', pressing: '2019 half-speed', label: 'Apple', catalog: '', budget: '40', discogsId: 7,
      moreCopies: [wantCopies(hunt)[0]], paid: '45', shop: 'Shop',
    })
    // the matcher's discogsMatch is left as it was, as production does
    expect(m.patch).not.toHaveProperty('discogsMatch')
  })

  it('leaves the copies alone with one copy, or when it isn\'t a hunt', () => {
    const one = { ...hunt, moreCopies: [] }
    expect(movePatch(one, 'ordered', undefined, 0)!.patch).not.toHaveProperty('moreCopies')
    expect(movePatch({ ...hunt, status: 'ordered' }, 'own')!.patch).not.toHaveProperty('moreCopies')
  })
})

describe('research', () => {
  const log = [
    { id: 'a1', at: '2026-10-01', headline: 'First pressings are rare.', summary: 'S.', pressings: ['2019 half-speed: best sound', 'Japan Odeon: quiet vinyl'] },
    { at: '2026-09-01', summary: 'An older look. More here.', pinned: true },
  ]
  const r: Rec = { ...hunt, researchLog: log }

  it('reads an older single research object as one entry', () => {
    expect(researchEntries({ id: 'x', research: { summary: 'Old' } })).toEqual([{ id: 'legacy', summary: 'Old' }])
    expect(researchEntries({ id: 'x', researchLog: [], research: null })).toEqual([])
  })

  it('pins one entry at a time, by id or place, and unpins', () => {
    expect(pinPatch(r, 'a1')).toEqual({ researchLog: [{ ...log[0], pinned: true }, { at: '2026-09-01', summary: 'An older look. More here.' }], research: null })
    expect(pinPatch(r, '1').researchLog[1]).not.toHaveProperty('pinned')
    expect(pinPatch({ id: 'x', research: { summary: 'Old' } }, 'legacy')).toEqual({ researchLog: [{ id: 'legacy', summary: 'Old', pinned: true }], research: null })
    expect(removeResearchPatch(r, 'a1')).toEqual({ researchLog: [log[1]], research: null })
  })

  it('knows a pressing already wanted', () => {
    expect(alreadyWanted(r, '2019 half-speed: best sound')).toBe(true)
    expect(alreadyWanted(r, 'Japan Odeon: quiet vinyl')).toBe(false)
    expect(alreadyWanted(r, 'Original with PCS 7088 on the label')).toBe(true)
  })

  it('+ Want adds another copy, and Undo takes back only that one', () => {
    const { patch, undo } = wantPatch(r, 'Japan Odeon')
    const more = patch.moreCopies as unknown[]
    expect(more).toHaveLength(4)
    expect(more[3]).toEqual({ name: '', pressing: 'Japan Odeon', label: '', catalog: '', budget: '', discogsId: '', buyLinks: [] })
    expect(undo).toEqual({ ci: 4, p: 'Japan Odeon', did: null })
    const after = { ...r, ...patch }
    expect(undoWantPatch(after, undo)).toEqual({ moreCopies: wantCopies(r).slice(1) })
    expect(undoWantPatch({ ...after, moreCopies: [...more.slice(0, 3), { pressing: 'Edited' }] }, undo)).toBeNull()
  })

  it("+ Want fills an unchosen first copy, setting aside the matcher's release until Undo", () => {
    const bare: Rec = { id: 'b', status: 'wish', label: 'Apple', autoFilled: ['label'], discogsId: 5, discogsMatch: 'catalog' }
    const { patch, undo } = wantPatch(bare, 'Japan Odeon')
    expect(patch).toEqual({ pressing: 'Japan Odeon', discogsId: '', discogsMatch: '' })
    expect(undoWantPatch({ ...bare, ...patch }, undo)).toEqual({ pressing: '', discogsId: 5, discogsMatch: 'catalog' })
    expect(wantPatch({ ...bare, discogsId: '' }, 'X').patch).toEqual({ pressing: 'X' })
  })

  it('hands Claude a prompt naming the record, the wall when it has an https address, and what is followed up', () => {
    expect(resPrompt(r, 'http://x')).toBe(
      'Research a record on my Vinyl Wall\nRecord: "Abbey Road" by The Beatles (record h)\n' +
        "Use the vinyl-wall skill, and save a summary to the record when we're done.\n\nMy question: ",
    )
    const f = resPrompt(r, 'https://claude.ai/artifact/x', log[1]).split('\n')
    expect(f[0]).toMatch(/^Follow up on my research from .+: "An older look"$/)
    expect(f[2]).toBe('Wall: https://claude.ai/artifact/x')
    expect(f.at(-1)).toBe('My follow-up: ')
  })
})
