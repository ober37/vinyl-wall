// #156: every copy you own keeps the budget it was bought against
import { describe, expect, it } from 'vitest'
import { arrivedPatch, gotCopyPatch } from './copyOrders'
import { stored, toForm } from './edit'
import { moreOwned } from './owned'
import type { Rec } from './record'

const owned: Rec = {
  id: 'o', title: 'Owned', status: 'own', budget: '30', paid: '28',
  moreCopies: [
    { name: 'Half-speed', budget: '45' },
    { name: 'Japan', budget: '50', orderStatus: 'shipped', orderDate: '2026-11-01', paid: '48', shop: 'Rough Trade' },
  ],
  ownedCopies: [{ name: 'Player', paid: '12' }],
}

describe('owned copies keep their budget (#156)', () => {
  it('Got this copy and It arrived carry the copy\'s budget over', () => {
    expect((gotCopyPatch(owned, 1, { paid: '40', shop: '' })!.patch.ownedCopies as object[]).at(-1)).toMatchObject({ name: 'Half-speed', budget: '45' })
    expect((arrivedPatch(owned, 2)!.patch.ownedCopies as object[]).at(-1)).toMatchObject({ name: 'Japan', budget: '50' })
  })
  it('reads and saves a budget on every copy you own, the first too', () => {
    const r: Rec = { ...owned, ownedCopies: [{ name: 'Player', paid: '12', budget: '15' }] }
    expect(moreOwned(r)[0].budget).toBe('15')
    const f = toForm(r)
    expect(f.budget).toBe('30')
    f.budget = ' 35 '
    f.ownedCopies![0].budget = '18'
    expect(stored(f)).toMatchObject({ budget: '35', ownedCopies: [{ name: 'Player', budget: '18' }] })
  })
})
