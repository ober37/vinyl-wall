import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../App'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'
import { openCopies } from './openCopies'

function setup(opts: Parameters<typeof fakeClaude>[1] = {}, extra: Record<string, Record<string, unknown>> = {}) {
  const data = sample()
  Object.assign(data.records, extra)
  const fake = fakeClaude(data, opts)
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

const tracked = {
  r9: {
    title: 'Rumours', artist: 'Fleetwood Mac', status: 'ordered', orderStatus: 'shipped', eta: '2026-10-30', copyName: 'Rhino high fidelity',
    pressing: '2024 Rhino High Fidelity', label: 'Warner', catalog: 'R1 3010', budget: '45', shop: 'Rhino', shopUrl: 'https://www.rhino.com',
    orderDate: '2026-10-01', orderNum: 'RH-1', carrier: 'UPS', tracking: '1Z999', orderNotes: 'Signature needed', notes: [], added: 9,
  },
}

describe('the Order tab', () => {
  it('opens first on an ordered record: the copy as one card, where it is, and its Discogs links', async () => {
    const { user } = setup({}, tracked)
    await open(user, 'Rumours')
    expect(screen.getByRole('tab', { name: 'Order' }).getAttribute('aria-selected')).toBe('true')
    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getByRole('heading', { name: 'Rhino high fidelity' })).toBeTruthy()
    expect(within(panel).getByText(/^Shipped, expected Oct 30/)).toBeTruthy()
    expect(within(panel).getByRole('link', { name: 'Track ↗' }).getAttribute('href')).toBe('https://www.ups.com/track?tracknum=1Z999')
    expect(within(panel).getByRole('link', { name: 'Rhino ↗' }).getAttribute('href')).toBe('https://www.rhino.com/')
    expect(within(panel).getByText('Up to $45')).toBeTruthy()
    expect(within(panel).getByText('Signature needed')).toBeTruthy()
    expect(within(panel).getByRole('link', { name: 'Find the edition ↗' })).toBeTruthy()
  })

  it("shows what was paid instead of the budget, and no tracking link without a number", async () => {
    const { user } = setup()
    await open(user, 'Aja')
    const panel = screen.getByRole('tabpanel')
    // named as the copy is everywhere else: an order with no name or pressing is Copy 1 (#121)
    expect(within(panel).getByRole('heading', { name: 'Copy 1' })).toBeTruthy()
    expect(within(panel).queryByRole('link', { name: 'Track ↗' })).toBeNull()
    expect(within(panel).getByText('Rough Trade')).toBeTruthy()
  })
})

describe('edit mode: the order', () => {
  it('edits the order in the copy ordered, as its Order details, folded with where it is at (#121)', async () => {
    const { fake, user } = setup({}, tracked)
    await open(user, 'Rumours')
    await user.click(btn('Edit'))
    const g = screen.getByRole('group', { name: 'The copy you ordered' })
    expect(screen.queryByRole('group', { name: 'The order' })).toBeNull()
    await openCopies(user)
    expect(within(g).getByRole('button', { name: /^Order details/ }).getAttribute('aria-expanded')).toBe('true')
    const track = within(g).getByRole('textbox', { name: 'Tracking #' })
    await user.clear(track)
    await user.type(track, '1Z000')
    expect(within(g).getByRole('textbox', { name: 'Order notes' })).toBeTruthy()
    await user.click(within(g).getByRole('combobox', { name: 'Order status' }))
    await user.click(await screen.findByRole('option', { name: 'Delayed' }))
    await user.click(btn('Done'))
    await waitFor(() => {
      const all = Object.assign({}, ...updates(fake, 'r9'))
      expect(all).toMatchObject({ tracking: '1Z000', orderStatus: 'delayed', needsSync: true })
    })
  })

  it('has no Order notes box when the order has none', async () => {
    const { user } = setup()
    await open(user, 'Aja')
    await user.click(btn('Edit'))
    await openCopies(user)
    const g = screen.getByRole('group', { name: 'The copy you ordered' })
    expect(within(g).getByRole('combobox', { name: 'From' })).toHaveProperty('value', 'Rough Trade')
    expect(within(g).queryByRole('textbox', { name: 'Order notes' })).toBeNull()
  })
})

describe('listening stats and badges', () => {
  it("shows a record's plays at a glance, and the badges it has earned in the header", async () => {
    const { user } = setup()
    await open(user, 'Kind of Blue')
    const stats = screen.getByText('Plays').closest('dl')!
    expect(within(stats).getByText('3')).toBeTruthy()
    expect(within(stats).getByText('1.9')).toBeTruthy()
    const badges = screen.getByRole('list', { name: 'Badges' })
    expect(within(badges).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Most played ever', 'Top this month'])
    // view mode only (the header's Edit comes first; the plays have their own)
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    expect(screen.queryByRole('list', { name: 'Badges' })).toBeNull()
  })

  it('a record with no plays has no stats or badges', async () => {
    const { user } = setup()
    await open(user, 'Blue Train')
    expect(screen.queryByText('Plays')).toBeNull()
    expect(screen.queryByRole('list', { name: 'Badges' })).toBeNull()
    expect(screen.getByText('No plays logged yet.')).toBeTruthy()
  })
})
