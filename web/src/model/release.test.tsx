// #75: a wanted copy's release date
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CopiesView } from '../sheet/Copies'
import { copiesPatch, pickPatch, releaseText, stillCopies, wantCopies } from './copies'
import { patchFor, toForm } from './edit'
import { importable } from './library'
import { today, type Rec } from './record'
import { movePatch } from './status'

const preorder: Rec = {
  id: 'p', title: 'Tango in the Night', artist: 'Fleetwood Mac', status: 'wish', notes: [],
  copyName: 'Anniversary', pressing: '2027 reissue', releaseDate: '2099-11-20',
  moreCopies: [{ name: 'Original', pressing: '1987 Warner', releaseDate: '' }],
}

describe('release date', () => {
  it('reads as "Out …" before, "Out today" on, "Out now" for 30 days after, then nothing', () => {
    const now = today()
    const y = now.slice(0, 4)
    expect(releaseText(`${y}-12-31`, `${y}-01-01`)).toMatch(/^Out Dec 31$/)
    expect(releaseText('2099-11-20', now)).toMatch(/^Out Nov 20, 2099$/)
    expect(releaseText('2026-11-20', '2026-11-20')).toBe('Out today')
    expect(releaseText('2026-11-20', '2026-12-20')).toBe('Out now')
    expect(releaseText('2026-11-20', '2026-12-21')).toBe('')
    expect(releaseText('', now)).toBe('')
    expect(releaseText('Nov 2026', now)).toBe('')
  })

  it("is the copy's own, and a malformed one reads as none", () => {
    const C = wantCopies({ ...preorder, moreCopies: [{ name: 'x', releaseDate: 'soon' }] })
    expect(C[0].releaseDate).toBe('2099-11-20')
    expect(C[1].releaseDate).toBe('')
    // a copy with only a date is still a copy
    expect(stillCopies({ id: 'o', status: 'wish', releaseDate: '2099-01-01', notes: [] })).toHaveLength(1)
  })

  it('travels with copy edits and picks', () => {
    expect(copiesPatch(preorder, wantCopies(preorder)).releaseDate).toBe('2099-11-20')
    const f = toForm(preorder)
    expect(f.releaseDate).toBe('2099-11-20')
    const more = [{ ...f.moreCopies![0], releaseDate: '2099-02-02' }]
    expect(patchFor(preorder, f, { ...f, releaseDate: '', moreCopies: more })).toMatchObject({ releaseDate: '', moreCopies: [{ releaseDate: '2099-02-02' }] })
    expect(pickPatch(preorder, 0)).toMatchObject({ releaseDate: '2099-11-20' })
  })

  it("an upcoming one makes the order a pre-order expected that day; the copy's date goes once it's had", () => {
    expect(movePatch(preorder, 'ordered', undefined, 0)!.patch).toMatchObject({ orderStatus: 'preorder', eta: '2099-11-20', releaseDate: '' })
    const out = movePatch({ ...preorder, releaseDate: '2001-01-01' }, 'ordered', undefined, 0)!.patch
    expect(out).toMatchObject({ orderStatus: 'ordered', releaseDate: '' })
    expect(out.eta).toBeUndefined()
    expect(movePatch(preorder, 'own', undefined, 0)!.patch).toMatchObject({ releaseDate: '' })
    // the other copy picked: no pre-order, and the date that was the first copy's goes
    const other = movePatch(preorder, 'ordered', undefined, 1)!.patch
    expect(other).toMatchObject({ orderStatus: 'ordered', releaseDate: '' })
    expect(other.moreCopies).toEqual([expect.objectContaining({ name: 'Anniversary', releaseDate: '2099-11-20' })])
  })

  it('comes across in an import, and a malformed one is dropped', () => {
    expect(importable({ title: 'a', status: 'wish', releaseDate: '2099-11-20' }).releaseDate).toBe('2099-11-20')
    expect(importable({ title: 'a', status: 'wish', releaseDate: 'soon' }).releaseDate).toBe('')
    expect((importable({ title: 'a', moreCopies: [{ name: 'x', releaseDate: '2099-01-01' }] }).moreCopies as { releaseDate: string }[])[0].releaseDate).toBe('2099-01-01')
  })

  it('shows on the copy card while it means something', () => {
    const v = render(<CopiesView r={{ ...preorder, moreCopies: [] }} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByText('Release')).toBeTruthy()
    expect(screen.getByText('Out Nov 20, 2099')).toBeTruthy()
    v.unmount()
    render(<CopiesView r={{ ...preorder, releaseDate: '2001-01-01', moreCopies: [] }} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.queryByText('Release')).toBeNull()
  })
})
