// Copies on order on the record sheet and the wall (#139)
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../App'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'
import { openCopies, openOrders } from './openCopies'

function setup(extra: Record<string, Record<string, unknown>>) {
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
const open = async (user: U, title: string) => {
  await user.click(await screen.findByRole('button', { name: new RegExp('Open ' + title) }))
  await screen.findByRole('heading', { name: title })
}
const btn = (name: string | RegExp) => screen.getByRole('button', { name })

const want = { name: 'Blue vinyl', pressing: '2024 Rhino', budget: '40', discogsId: 51 }
const placed = { ...want, orderStatus: 'shipped', orderDate: '2026-10-01', eta: '2026-11-04', paid: '38', shop: 'Rough Trade', carrier: 'UPS', tracking: '1Z1' }
const blue = { title: 'Hejira', artist: 'Joni Mitchell', status: 'own', copyName: 'Reprise first', discogsId: 50, notes: [], added: 20 }

describe('ordering another copy', () => {
  it("orders a copy an owned record still wants: it leaves Pressings for the Order tab, and the sheet and wall say so", async () => {
    const { fake, user } = setup({ b1: { ...blue, moreCopies: [want] } })
    await open(user, 'Hejira')
    expect(screen.queryByRole('tab', { name: 'Order' })).toBeNull()
    await user.click(screen.getByRole('tab', { name: 'Pressings' }))
    await user.click(btn(/^Blue vinyl/))
    await user.click(btn('Ordered this copy'))
    await user.type(screen.getByRole('textbox', { name: 'Paid' }), '38')
    await user.type(screen.getByRole('combobox', { name: 'From' }), 'Rough Trade')
    await user.click(btn('Save'))
    await waitFor(() => expect((fake.records.b1.moreCopies as Record<string, unknown>[])[0].orderStatus).toBe('ordered'))
    expect(screen.getByText('Marked as ordered today.')).toBeTruthy()
    expect(screen.getByText('1 on order')).toBeTruthy()
    // the sheet shows where it went
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Order' }).getAttribute('aria-selected')).toBe('true'))
    expect(btn(/^Blue vinyl Ordered/)).toBeTruthy()
    // the sheet closed, the wall's tag says one is on order
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.getByRole('button', { name: /Open Hejira/ }).textContent).toContain('+1 on order'))
  })

  it('offers both on an ordered record, and It arrived in each order', async () => {
    const { fake, user } = setup({ b2: { ...blue, status: 'ordered', orderStatus: 'ordered', moreCopies: [placed, want] } })
    await open(user, 'Hejira')
    expect(screen.getByRole('tab', { name: 'Orders' }).getAttribute('aria-selected')).toBe('true')
    await openOrders(user)
    expect(screen.getAllByRole('button', { name: 'It arrived' })).toHaveLength(2)
    // the order expected first is listed first: the copy's, due Nov 4
    await user.click(screen.getAllByRole('button', { name: 'It arrived' })[0])
    await waitFor(() => expect(fake.records.b2.status).toBe('own'))
    expect(fake.records.b2).toMatchObject({ copyName: 'Blue vinyl', shop: 'Rough Trade' })
    expect(screen.getByText('Moved to the wall. Your other order is still on the way.')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'Pressings' }))
    await user.click(btn(/^Blue vinyl/))
    expect(btn('Ordered this copy')).toBeTruthy()
    expect(btn('Got this copy')).toBeTruthy()
  })
})

describe('edit mode: the copies you ordered', () => {
  it("lists an owned record's copy on order with its Order details, and Cancelled, still want it takes the order off", async () => {
    const { fake, user } = setup({ b3: { ...blue, moreCopies: [placed] } })
    await open(user, 'Hejira')
    await user.click(btn('Edit'))
    const g = screen.getByRole('group', { name: 'The copy you ordered' })
    expect(within(g).getByRole('button', { name: 'Blue vinyl Shipped, expected Nov 4' })).toBeTruthy()
    await openCopies(user)
    expect((within(g).getByRole('textbox', { name: 'Tracking #' }) as HTMLInputElement).value).toBe('1Z1')
    expect(within(screen.getByRole('group', { name: 'The copies you still want' })).getByText('None yet.')).toBeTruthy()
    await user.click(within(g).getByRole('button', { name: 'Cancelled, still want it' }))
    await waitFor(() => expect((fake.records.b3.moreCopies as Record<string, unknown>[])[0].orderStatus).toBeUndefined())
    expect(screen.queryByRole('group', { name: /you ordered/ })).toBeNull()
  })
})
