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

  it('Got it starts from where it was seen and its price, and marks that sighting bought', async () => {
    const { fake, user } = setup({ sightings: [{ id: 'a', shopId: 'ns', shop: 'Northside', d: today(), price: '28' }] })
    await user.click(await screen.findByRole('button', { name: /Open Hunt/ }))
    await screen.findByRole('heading', { name: 'Hunt' })
    await user.click(screen.getByRole('button', { name: 'Got it' }))
    expect((screen.getByRole('combobox', { name: 'Bought from' }) as HTMLInputElement).value).toBe('Northside')
    expect((screen.getByRole('textbox', { name: 'Paid' }) as HTMLInputElement).value).toBe('28')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(rec(fake)).toMatchObject({ status: 'own', shop: 'Northside', paid: '28', sightings: [{ id: 'a', bought: today() }] }))
  })
})

describe('Settings → Shops: Seen here and I saw… (#152)', () => {
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: 'Settings' }))
    const sheet = await screen.findByRole('dialog', { name: 'Settings' })
    await user.click(within(sheet).getByRole('tab', { name: 'Shops' }))
    return sheet
  }

  it("counts a shop's leads on its row, lists what was seen there, and logs several records from one visit", async () => {
    const seed = sample()
    seed.records.h = { ...hunt, sightings: [{ id: 'a', shopId: 'ns', shop: 'Northside', d: today(), price: '28' }] }
    seed.records.p = { ...hunt, title: 'Visit One', artist: 'Band', added: 21 }
    seed.records.q = { ...hunt, title: 'Visit Two', artist: 'Band', added: 22 }
    seed.docs['settings/site'] = { shops: [NS] }
    const fake = fakeClaude(seed)
    render(
      <RuntimeProvider claude={fake.claude}>
        <App />
      </RuntimeProvider>,
    )
    const user = userEvent.setup()
    const sheet = await open(user)
    const row = await within(sheet).findByRole('button', { name: /Northside.*1 seen/ })
    await user.click(row)
    const seen = within(sheet).getByRole('group', { name: 'Seen here' })
    expect(within(seen).getByText('Hunt')).toBeTruthy()
    await user.click(within(seen).getByRole('button', { name: 'I saw…' }))
    const pick = within(seen).getByRole('group', { name: 'Which records you want did they have?' })
    await user.click(within(pick).getByRole('checkbox', { name: /Visit One/ }))
    await user.click(within(pick).getByRole('checkbox', { name: /Visit Two/ }))
    await user.click(within(seen).getByRole('button', { name: 'Log 2 records' }))
    const R = fake.store.records as Record<string, Record<string, unknown>>
    await waitFor(() => expect(R.q.sightings).toEqual([expect.objectContaining({ shopId: 'ns', shop: 'Northside', d: today() })]))
    expect(R.p.sightings).toEqual([expect.objectContaining({ shopId: 'ns' })])
    expect(await within(seen).findByText('Logged 2 records seen at Northside.')).toBeTruthy()
    expect(within(seen).getByText('Visit Two')).toBeTruthy()
  })

  it("offers nothing at an online shop with no sightings", async () => {
    const seed = sample()
    seed.records.h = { ...hunt }
    seed.docs['settings/site'] = { shops: [NS, { id: 'rt', name: 'Rough Trade', kind: 'online', url: 'https://www.roughtrade.com/' }] }
    render(
      <RuntimeProvider claude={fakeClaude(seed).claude}>
        <App />
      </RuntimeProvider>,
    )
    const user = userEvent.setup()
    const sheet = await open(user)
    await user.click(await within(sheet).findByRole('button', { name: /Rough Trade/ }))
    expect(within(sheet).queryByRole('group', { name: 'Seen here' })).toBeNull()
  })
})
