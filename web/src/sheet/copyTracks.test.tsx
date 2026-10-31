import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../App'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'
import { openOrders } from './openCopies'

// each pressing's own tracklist and runtime, and which copy a play was (#138)
const ALBUM = [
  { pos: 'A1', title: 'One', dur: '10:00' },
  { pos: 'A2', title: 'Two', dur: '10:00' },
  { pos: 'B1', title: 'Three', dur: '10:00' },
  { pos: 'B2', title: 'Four', dur: '10:00' },
]
const DELUXE = [...ALBUM, { pos: 'C1', title: 'Bonus Demo', dur: '6:00' }, { pos: 'C2', title: 'Bonus Live', dur: '6:00' }]
const REC = {
  title: 'Deluxe test', artist: 'Band', status: 'own', added: 9, runtime: 40, copyName: 'Original', discogsId: 1,
  about: { tracks: ALBUM, tracksSource: 'discogs', tracksUrl: 'https://www.discogs.com/release/1' },
  ownedCopies: [
    { name: 'Deluxe 2LP', discogsId: 99, releaseTracks: { rid: 99, tracks: DELUXE, runtime: 52 } },
    { name: 'Same', discogsId: 98, releaseTracks: { rid: 98, tracks: ALBUM, runtime: 40 } },
    { name: 'Typed', runtime: '45' },
  ],
  moreCopies: [
    { name: 'Wanted deluxe', discogsId: 99, releaseTracks: { rid: 99, tracks: DELUXE, runtime: 52 } },
    { name: 'Ordered deluxe', discogsId: 99, releaseTracks: { rid: 99, tracks: DELUXE, runtime: 52 }, orderStatus: 'shipped' },
  ],
  notes: [{ d: '2026-01-02', t: 'Played the whole album (~40 min)' }],
}

function setup(rec: Record<string, unknown> = REC, setups?: Record<string, Record<string, unknown>>) {
  const data = sample()
  data.records.d = rec
  const fake = fakeClaude({ ...data, collections: setups ? { setups } : {} }, {})
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
const close = async (user: U) => {
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Deluxe test' })).toBeNull())
}
const notes = (fake: ReturnType<typeof fakeClaude>) => fake.records.d.notes as Record<string, unknown>[]
const pickCopy = async (user: U, name: string) => {
  await user.click(screen.getByRole('combobox', { name: 'Which copy' }))
  await user.click(await screen.findByRole('option', { name }))
}

describe('a tracklist per copy (#138)', () => {
  it("About keeps the album's tracklist; a copy whose tracks differ folds its own, a typed runtime shows when it differs", async () => {
    const { user } = setup()
    await open(user, 'Deluxe test')
    await user.click(screen.getByRole('tab', { name: 'About' }))
    const panel = screen.getByRole('tabpanel')
    expect(within(within(panel).getByRole('group', { name: 'Tracklist' })).queryByText('Bonus Demo')).toBeNull()
    const g = within(panel).getByRole('group', { name: 'Your copies' })
    for (const b of within(g).getAllByRole('button', { expanded: false })) await user.click(b)
    const own = within(g).getByRole('button', { name: /6 tracks · 52 min/ })
    expect(within(g).getAllByRole('button', { name: /tracks ·/ })).toHaveLength(1)
    await user.click(own)
    expect(within(g).getByText('Bonus Demo')).toBeTruthy()
    expect(within(g).getByRole('link', { name: /this copy's Discogs release/ }).getAttribute('href')).toBe('https://www.discogs.com/release/99')
    expect(within(g).getByText('45 min')).toBeTruthy()
  })

  it('a wanted copy and one on order show their own tracklist too', async () => {
    const { user } = setup()
    await open(user, 'Deluxe test')
    await user.click(screen.getByRole('tab', { name: 'Pressings' }))
    for (const b of within(screen.getByRole('tabpanel')).getAllByRole('button', { expanded: false })) await user.click(b)
    expect(within(screen.getByRole('tabpanel')).getByRole('button', { name: /6 tracks · 52 min/ })).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'Order' }))
    await openOrders(user)
    expect(within(screen.getByRole('tabpanel')).getByRole('button', { name: /6 tracks · 52 min/ })).toBeTruthy()
  })
})

describe('Log a play on one of several copies (#138)', () => {
  it("logs the chosen copy's runtime, names it in the history, and starts there next time", async () => {
    const { fake, user } = setup()
    await open(user, 'Deluxe test')
    expect(screen.getByRole('combobox', { name: 'Which copy' }).textContent).toBe('Original')
    await pickCopy(user, 'Deluxe 2LP')
    await user.click(screen.getByRole('button', { name: 'Log play' }))
    await waitFor(() => expect(notes(fake).at(-1)).toMatchObject({ t: 'Played the whole album (~52 min)', copy: 'Deluxe 2LP' }))
    // the journal names it, and so does the play's row
    expect(await screen.findByText(/Whole album · Deluxe 2LP/)).toBeTruthy()
    await close(user)
    await open(user, 'Deluxe test')
    expect(screen.getByRole('combobox', { name: 'Which copy' }).textContent).toBe('Deluxe 2LP')
  })

  it("ticks the chosen copy's tracks; another copy clears them, and one without its own uses the album's and says so", async () => {
    const { fake, user } = setup()
    await open(user, 'Deluxe test')
    await pickCopy(user, 'Deluxe 2LP')
    await user.click(screen.getByRole('button', { name: 'Tracks' }))
    expect(screen.getByText('Tick the tracks you played.')).toBeTruthy()
    await user.click(screen.getByRole('checkbox', { name: /Bonus Demo/ }))
    await pickCopy(user, 'Typed')
    expect(screen.queryByRole('checkbox', { name: /Bonus Demo/ })).toBeNull()
    expect(screen.getByText("Tick the tracks you played, from the album's tracklist.")).toBeTruthy()
    await user.click(screen.getByRole('checkbox', { name: /Three/ }))
    await user.click(screen.getByRole('button', { name: 'Log 1 track' }))
    await waitFor(() => expect(notes(fake).at(-1)).toMatchObject({ t: 'Played 1 track (~10 min)', tracks: ['B1'], copy: 'Typed' }))
  })

  it('sits Which copy and Played on side by side; a single copy has no Which copy', async () => {
    const { user } = setup(REC, { den: { name: 'Den', added: 1 }, lr: { name: 'Living room', added: 2 } })
    await open(user, 'Deluxe test')
    const which = screen.getByRole('combobox', { name: 'Which copy' })
    const on = screen.getByRole('combobox', { name: 'Played on' })
    expect(which.closest('.grid')).toBe(on.closest('.grid'))
    await close(user)
    await open(user, 'Kind of Blue')
    expect(screen.queryByRole('combobox', { name: 'Which copy' })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Played on' })).toBeTruthy()
  })
})

describe("a copy's runtime in edit (#138)", () => {
  it("copies after the first get a Runtime field, blank meaning the album's", async () => {
    const { fake, user } = setup()
    await open(user, 'Deluxe test')
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const g = screen.getByRole('group', { name: 'Your copies' })
    for (const b of within(g).getAllByRole('button', { expanded: false })) await user.click(b)
    const rt = within(g).getAllByRole('textbox', { name: 'Runtime (min)' })
    expect(rt).toHaveLength(3)
    expect(rt[0].getAttribute('placeholder')).toBe("40 (the album's)")
    await user.type(rt[0], '55')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect((fake.records.d.ownedCopies as Record<string, unknown>[])[0]).toMatchObject({ name: 'Deluxe 2LP', runtime: '55' }))
  })
})
