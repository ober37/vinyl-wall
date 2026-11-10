// #151: the paid form for a record bought in person: your shops on a click, one typed another way found, a new shop
// added to your list, and new and sealed
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../App'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'

const NORTHSIDE = { id: 'ns', name: 'Northside Trading Post in Lakeview, IL', kind: 'local', url: 'https://northsidetrading.example/', place: 'Lakeview, IL' }
const ONLINE = 'https://www.bigvinyl.example/products/anniversary-lp'
const hunt = { title: 'Hunt', artist: 'Band', status: 'wish', copyName: 'Anniversary', buyLinks: [ONLINE], budget: '35', notes: [], added: 20 }

function setup() {
  const seed = sample()
  seed.records.h = hunt
  seed.docs['settings/site'] = { shops: [NORTHSIDE] }
  const fake = fakeClaude(seed)
  render(
    <RuntimeProvider claude={fake.claude}>
      <App />
    </RuntimeProvider>,
  )
  return { fake, user: userEvent.setup() }
}
type U = ReturnType<typeof userEvent.setup>
const gotIt = async (user: U) => {
  await user.click(await screen.findByRole('button', { name: /Open Hunt/ }))
  await screen.findByRole('heading', { name: 'Hunt' })
  await user.click(screen.getByRole('button', { name: 'Got it' }))
  return screen.getByRole('combobox', { name: 'Bought from' })
}
const rec = (fake: ReturnType<typeof fakeClaude>) => (fake.store.records as Record<string, Record<string, unknown>>).h

describe('Found it, bought in person (#151)', () => {
  it('lists your shops on a click, finds one typed another way, and takes its website, not the online link', async () => {
    const { fake, user } = setup()
    const box = await gotIt(user)
    await user.click(box)
    expect(await screen.findByRole('option', { name: NORTHSIDE.name })).toBeTruthy()
    await user.type(box, 'Northside Trading Lakeview')
    // it's on your list, so not offered as a new one
    expect(screen.queryByRole('checkbox', { name: /to your shops/ })).toBeNull()
    await user.click(await screen.findByRole('option', { name: NORTHSIDE.name }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(rec(fake)).toMatchObject({ status: 'own', shop: NORTHSIDE.name, shopUrl: NORTHSIDE.url, buyLinks: [], budget: '35' }))
  })

  it('adds a shop not on your list, as a local one, and grades a sealed copy Mint', async () => {
    const { fake, user } = setup()
    const box = await gotIt(user)
    await user.type(box, 'Corner Groove')
    await user.click(screen.getByRole('checkbox', { name: 'Add Corner Groove to your shops' }))
    await user.click(screen.getByRole('checkbox', { name: /New, sealed/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(rec(fake)).toMatchObject({ status: 'own', shop: 'Corner Groove', mediaGrade: 'M', sleeveGrade: 'M' }))
    // not the copy's online link
    expect(rec(fake).shopUrl ?? '').toBe('')
    expect((fake.store.settings.site as { shops: { name: string; kind: string }[] }).shops).toEqual([NORTHSIDE, expect.objectContaining({ name: 'Corner Groove', kind: 'local' })])
  })

  it("doesn't offer a show's merch booth, or either box on an order", async () => {
    const { user } = setup()
    const box = await gotIt(user)
    await user.type(box, 'Tour merch table')
    expect(screen.queryByRole('checkbox', { name: /to your shops/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Ordered it' }))
    await user.type(screen.getByRole('combobox', { name: 'From' }), 'Corner Groove')
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})
