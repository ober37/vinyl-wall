// #152: Seen it on a wanted record, the list on its Pressings tab, and the wall's seen chip
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../App'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'
import { today } from '../model/record'

const NS = { id: 'ns', name: 'Northside', kind: 'local' }
const hunt = { title: 'Hunt', artist: 'Band', status: 'wish', priority: 2, notes: [], added: 20 }

function setup(extra: Record<string, unknown> = {}) {
  const seed = sample()
  seed.records.h = { ...hunt, ...extra }
  seed.docs['settings/site'] = { shops: [NS] }
  const fake = fakeClaude(seed)
  render(
    <RuntimeProvider claude={fake.claude}>
      <App />
    </RuntimeProvider>,
  )
  return { fake, user: userEvent.setup() }
}
const rec = (fake: ReturnType<typeof fakeClaude>) => (fake.store.records as Record<string, Record<string, unknown>>).h

describe('Seen it (#152)', () => {
  it('logs a sighting at a shop on your list, leaves the record on the hunt, and the wall can show just those', async () => {
    const { fake, user } = setup()
    await user.click(await screen.findByRole('button', { name: /Open Hunt/ }))
    await screen.findByRole('heading', { name: 'Hunt' })
    await user.click(screen.getByRole('button', { name: 'Seen it' }))
    const box = screen.getByRole('combobox', { name: 'Seen at' })
    await user.click(box)
    await user.click(await screen.findByRole('option', { name: 'Northside' }))
    await user.type(screen.getByRole('textbox', { name: 'Price' }), '28')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(rec(fake).sightings).toEqual([expect.objectContaining({ shopId: 'ns', shop: 'Northside', price: '28' })]))
    expect(rec(fake).status).toBe('wish')
    const seen = await screen.findByRole('group', { name: 'Seen in shops' })
    expect(within(seen).getByText('Northside')).toBeTruthy()
    expect(within(seen).getByText('today')).toBeTruthy()
  })

  it("tags a record seen lately and the seen chip shows just those; an old sighting doesn't count", async () => {
    const seed = sample()
    seed.records.h = { ...hunt, sightings: [{ id: 'a', shop: 'Northside', d: today() }] }
    seed.records.o = { ...hunt, title: 'Old', sightings: [{ id: 'b', shop: 'Northside', d: '2020-01-01' }] }
    render(
      <RuntimeProvider claude={fakeClaude(seed).claude}>
        <App />
      </RuntimeProvider>,
    )
    const user = userEvent.setup()
    expect(await screen.findByRole('button', { name: /Open Hunt by Band, Seen today/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Open Old by Band, Want/ })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /1 records? seen/ }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Open Old/ })).toBeNull())
    expect(screen.getAllByTestId('sleeve')).toHaveLength(1)
  })

  it('shows the shop under its new name after a rename', async () => {
    // logged at "Northside", since renamed on the list (same id)
    const seed = sample()
    seed.records.h = { ...hunt, sightings: [{ id: 'a', shopId: 'ns', shop: 'Northside', d: '2026-01-02' }] }
    seed.docs['settings/site'] = { shops: [{ ...NS, name: 'Northside Records' }] }
    render(
      <RuntimeProvider claude={fakeClaude(seed).claude}>
        <App />
      </RuntimeProvider>,
    )
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Open Hunt/ }))
    await user.click(await screen.findByRole('tab', { name: 'Pressings' }))
    const seen = await screen.findByRole('group', { name: 'Seen in shops' })
    expect(within(seen).getByText('Northside Records')).toBeTruthy()
  })

  it('takes one off', async () => {
    const { fake, user } = setup({ sightings: [{ id: 'a', shopId: 'ns', shop: 'Northside', d: '2026-01-02' }] })
    await user.click(await screen.findByRole('button', { name: /Open Hunt/ }))
    await user.click(await screen.findByRole('tab', { name: 'Pressings' }))
    await user.click(await screen.findByRole('button', { name: /Remove seen at Northside/ }))
    await waitFor(() => expect(rec(fake).sightings).toEqual([]))
  })
})
