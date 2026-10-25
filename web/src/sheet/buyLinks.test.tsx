// #58: where to buy each copy you want
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../App'
import { buyHosts, wantCopies } from '../model/copies'
import { stored, toForm } from '../model/edit'
import { importable } from '../model/library'
import type { Rec } from '../model/record'
import { movePatch } from '../model/status'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'

function setup(extra: Record<string, Record<string, unknown>> = {}) {
  const data = sample()
  Object.assign(data.records, extra)
  const fake = fakeClaude(data, {})
  render(
    <RuntimeProvider claude={fake.claude}>
      <App />
    </RuntimeProvider>,
  )
  return { fake, user: userEvent.setup() }
}
type U = ReturnType<typeof userEvent.setup>
type Fake = ReturnType<typeof fakeClaude>
const open = async (user: U, title: string) => {
  await user.click(await screen.findByRole('button', { name: new RegExp('Open ' + title) }))
  await screen.findByRole('heading', { name: title })
}
const btn = (name: string | RegExp) => screen.getByRole('button', { name })
const updates = (fake: Fake, id: string) => fake.calls.filter((c) => c.op === 'update' && c.path === 'records/' + id).map((c) => c.data!)

const RT = 'https://www.roughtrade.com/lp-7'
const hunt: Rec = {
  id: 'h', title: 'Hunt', status: 'wish', copyName: 'Store exclusive', pressing: 'LP + 7"', budget: '45', buyLinks: [RT, 'javascript:alert(1)'],
  moreCopies: [{ name: 'Black', pressing: 'Black vinyl', buyLinks: ['band.example/shop', 'https://www.roughtrade.com/black'] }],
}

describe('buy links: the data', () => {
  it('names each link by its site, numbers repeats, and drops ones that won’t link', () => {
    expect(buyHosts([RT, 'javascript:alert(1)', 'roughtrade.com/x', 'band.example'])).toEqual([
      ['roughtrade.com', RT], ['roughtrade.com (2)', 'https://roughtrade.com/x'], ['band.example', 'https://band.example/'],
    ])
    expect(wantCopies({ id: 'x', buyLinks: [RT, 3, null] }).map((c) => c.buyLinks)).toEqual([[RT]])
  })

  it('saves a copy’s links without blank lines, made linkable', () => {
    const f = toForm(hunt)
    expect(f.buyLinks).toEqual(hunt.buyLinks)
    const o = stored({ ...f, buyLinks: [' roughtrade.com/a ', '', 'not a link'], moreCopies: [{ ...f.moreCopies![0], buyLinks: ['', 'x.com'] }] })
    expect(o.buyLinks).toEqual(['https://roughtrade.com/a', 'not a link'])
    expect((o.moreCopies as { buyLinks: string[] }[])[0].buyLinks).toEqual(['https://x.com/'])
  })

  it('imports only text links', () => {
    expect(importable({ title: 'A', buyLinks: [RT, 5] }).buyLinks).toEqual([RT])
  })

  it('a copy’s only link becomes the shop website on a move, even when the shop name changes', () => {
    const one: Rec = { id: 'o', status: 'wish', copyName: 'X', buyLinks: [RT], shop: 'Old', shopUrl: 'https://old.example' }
    expect(movePatch(one, 'ordered', { paid: '40', shop: 'Rough Trade' })!.patch.shopUrl).toBe(RT)
    // a website already there stays, as long as the shop is the same
    expect(movePatch(one, 'own', { paid: '40', shop: 'Old' })!.patch).not.toHaveProperty('shopUrl')
    // a link that won't open doesn't count; several links: only the one picked
    expect(movePatch(hunt, 'own', { paid: '', shop: '' }, 0)!.patch.shopUrl).toBe(RT)
    expect(movePatch(hunt, 'own', { paid: '', shop: '' }, 1)!.patch).not.toHaveProperty('shopUrl')
    expect(movePatch(hunt, 'own', { paid: '', shop: '', shopUrl: 'https://www.roughtrade.com/black' }, 1)!.patch).toMatchObject({
      shopUrl: 'https://www.roughtrade.com/black', copyName: 'Black',
    })
  })
})

describe('buy links: the sheet', () => {
  it('shows each copy’s links by site, opening in a new tab', async () => {
    const { user } = setup({ h: { ...hunt, moreCopies: [] } })
    await open(user, 'Hunt')
    const g = screen.getByRole('group', { name: 'The copy you want' })
    const a = within(g).getByRole('link', { name: 'roughtrade.com ↗' })
    expect(a.getAttribute('href')).toBe(RT)
    expect(a.getAttribute('target')).toBe('_blank')
    expect(within(g).getAllByRole('link')).toHaveLength(1)
  })

  it('edits the links a line each, and says which line won’t link', async () => {
    const { fake, user } = setup({ h: { ...hunt, buyLinks: [], moreCopies: [] } })
    await open(user, 'Hunt')
    await user.click(btn('Edit'))
    const box = screen.getByRole('textbox', { name: 'Where to buy' })
    await user.type(box, 'roughtrade.com/a{Enter}foo bar')
    await user.tab()
    expect(screen.getByText('“foo bar” isn\'t a web address, so it won\'t link')).toBeTruthy()
    await user.click(btn('Done'))
    await waitFor(() => expect(updates(fake, 'h').at(-1)).toMatchObject({ buyLinks: ['https://roughtrade.com/a', 'foo bar'] }))
  })

  it('Got it on a copy sold in several places asks which one it came from', async () => {
    const { fake, user } = setup({ h: hunt })
    await open(user, 'Hunt')
    await user.click(btn('Got it'))
    await user.click(btn(/Got: Black/))
    const g = screen.getByRole('group', { name: 'From one of these?' })
    await user.click(within(g).getByRole('button', { name: 'roughtrade.com' }))
    expect(within(g).getByRole('button', { name: 'roughtrade.com' }).getAttribute('aria-pressed')).toBe('true')
    expect((screen.getByRole('textbox', { name: 'Bought from' }) as HTMLInputElement).value).toBe('roughtrade.com')
    await user.click(btn('Save'))
    await waitFor(() =>
      expect(updates(fake, 'h').at(-1)).toMatchObject({
        status: 'own', copyName: 'Black', shop: 'roughtrade.com', shopUrl: 'https://www.roughtrade.com/black',
      }),
    )
  })
})
