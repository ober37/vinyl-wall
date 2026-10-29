// Phase 7, step 2: production behaviours the React page has but no test asserted (docs/parity-map.md)
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../App'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'

type Seed = ReturnType<typeof sample>
type Opts = Parameters<typeof fakeClaude>[1]
// lookedUp: every record already looked up, so nothing shows as busy or starts the task on its own
function setup(edit: (s: Seed) => void = () => {}, opts: Opts = {}, lookedUp = true) {
  const seed = sample()
  if (lookedUp)
    for (const r of Object.values(seed.records))
      Object.assign(r, { coverAsset: 'c', runtime: r.runtime || 40, aboutAt: 1, aboutV: 3, about: { ...(r.about as object), summary: 's' } })
  edit(seed)
  const fake = fakeClaude(seed, opts)
  render(
    <RuntimeProvider claude={fake.claude}>
      <App />
    </RuntimeProvider>,
  )
  return { fake, user: userEvent.setup() }
}
type User = ReturnType<typeof userEvent.setup>
const open = async (user: User, title: string) => {
  await user.click(await screen.findByRole('button', { name: new RegExp('Open ' + title) }))
  await screen.findByRole('heading', { name: title })
}
const sleeves = () => screen.queryAllByTestId('sleeve').map((b) => b.getAttribute('data-id'))
const tabNames = () => screen.queryAllByRole('tab').map((t) => t.textContent! + (t.getAttribute('aria-selected') === 'true' ? '*' : ''))
const facts = (el: HTMLElement) => [...el.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent])
afterEach(() => localStorage.clear())

describe('the wall', () => {
  it('names every count for screen readers, hiding the words on phones except owned', async () => {
    setup()
    const counts = await screen.findByRole('group', { name: 'Show on the wall' })
    const words = within(counts)
      .getAllByRole('button')
      .map((b) => [b.querySelector('b')?.textContent, b.querySelector('span:not([aria-hidden])')!.className.includes('max-sm:sr-only')])
    expect(words).toEqual([['2', false], ['1', true], ['1', true], ['1', true]])
    expect(within(counts).getAllByRole('button').map((b) => b.textContent)).toEqual(['2 owned', '1 on the way', '1 top want', '1 someday'])
  })

  it('has no counts row on an empty wall', async () => {
    setup((s) => (s.records = {}), { canWrite: false })
    await screen.findByText('Nothing hanging yet.')
    expect(screen.queryByRole('group', { name: 'Show on the wall' })).toBeNull()
  })

  it('captions each sleeve with its title, artist, and year · label', async () => {
    setup()
    const kob = await screen.findByRole('button', { name: /^Open Kind of Blue/ })
    expect(within(kob).getByText('Kind of Blue')).toBeTruthy()
    expect(within(kob).getByText('Miles Davis')).toBeTruthy()
    expect(within(kob).getByText('1959 · Columbia')).toBeTruthy()
    expect(within(screen.getByRole('button', { name: /^Open Aja/ })).getByText('1977')).toBeTruthy()
  })

  it('tells a screen reader once when lookups start and once when they finish', async () => {
    const { fake } = setup(() => {}, {}, false)
    const news = () => document.querySelector('p.sr-only[role="status"]')?.textContent
    await waitFor(() => expect(news()).toBe('5 records syncing'))
    await act(async () => {
      for (const id of Object.keys(fake.records)) fake.remote(id, { aboutAt: 1, aboutV: 3, about: { summary: 's' } })
    })
    await waitFor(() => expect(news()).toBe('Sync finished'))
  })

  // #70: appica's tooltips only, so nothing on the wall or a record's sheet carries the browser's title
  it("uses no browser tooltips on the wall or a record's sheet", async () => {
    setup((s) => Object.assign(s.records.r3, { needsEnrich: true, notes: [{ d: '2026-01-01', t: 'See https://www.discogs.com/release/1' }] }))
    const user = userEvent.setup()
    await open(user, 'Blue Train')
    expect(document.querySelectorAll('[title]')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })

  // #70: no browser tooltip over the cover; the name says it, and the count beside the chips explains the dot
  it('says a sleeve waiting on its lookup is syncing in its name, with no tooltip over it', async () => {
    setup((s) => Object.assign(s.records.r3, { needsEnrich: true }))
    const busy = await screen.findByRole('button', { name: 'Open Blue Train by John Coltrane, syncing' })
    expect(busy.getAttribute('title')).toBeNull()
  })
})

describe('search', () => {
  it('closes on Escape, shows the whole wall again and puts focus back on Search', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Search the wall' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search the wall' }), 'coltrane')
    await waitFor(() => expect(sleeves()).toEqual(['r3']))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(sleeves()).toHaveLength(5)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Search the wall' }))
  })

  // production's × "Clear search" is a Clear text button here (an approved departure)
  it('Clear closes search and shows the whole wall', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Search the wall' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search the wall' }), 'coltrane')
    await waitFor(() => expect(sleeves()).toEqual(['r3']))
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(sleeves()).toHaveLength(5)
  })
})

describe('the welcome card', () => {
  it('Add a record opens the new-record sheet', async () => {
    const { user } = setup((s) => (s.records = {}))
    const card = (await screen.findByRole('heading', { name: 'Start your wall' })).closest('section')!
    await user.click(within(card).getByRole('button', { name: 'Add a record' }))
    expect(await screen.findByRole('dialog', { name: 'Add a record' })).toBeTruthy()
  })

  it('Set up equipment opens Equipment', async () => {
    const { user } = setup((s) => (s.records = {}))
    const card = (await screen.findByRole('heading', { name: 'Start your wall' })).closest('section')!
    await user.click(within(card).getByRole('button', { name: 'Set up equipment' }))
    expect(await screen.findByRole('dialog', { name: 'Equipment' })).toBeTruthy()
  })
})

describe('the record sheet', () => {
  it('closes on its Close button', async () => {
    const { user } = setup()
    await open(user, 'Kind of Blue')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  // production focuses Close; here the sheet itself takes focus (an approved departure)
  it('takes focus when it opens', async () => {
    const { user } = setup()
    await open(user, 'Kind of Blue')
    await waitFor(() => expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true))
  })

  it('closes on a click outside it', async () => {
    const { user } = setup()
    await open(user, 'Kind of Blue')
    await user.click(document.querySelector('[data-slot="drawer-backdrop"]')!)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('closes when its record is deleted elsewhere', async () => {
    const { fake, user } = setup()
    await open(user, 'Blue Train')
    await act(async () => {
      delete fake.records.r3
      fake.remote('r1', {})
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(sleeves()).not.toContain('r3')
  })

  it('heads the record with its cover, title, and artist · year · runtime', async () => {
    const { user } = setup()
    await open(user, 'Kind of Blue')
    const sheet = screen.getByRole('dialog', { name: 'Kind of Blue' })
    expect(sheet.querySelector('img')?.getAttribute('src')).toContain('c')
    expect(within(sheet).getByText('Miles Davis · 1959 · 46 min')).toBeTruthy()
  })

  it('has no separate list of plays in edit mode', async () => {
    const { user } = setup()
    await open(user, 'Kind of Blue')
    expect(screen.getByText('Blue in Green floated tonight.')).toBeTruthy()
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    expect(screen.queryByText('Blue in Green floated tonight.')).toBeNull()
  })
})

describe('the tabs', () => {
  it('keep one order, opening on the task tab: Listening on an owned record, Order on an order, Pressings on a hunt', async () => {
    const { user } = setup()
    await open(user, 'Kind of Blue')
    expect(tabNames()).toEqual(['About', 'Listening*', 'Notes 1', 'Research'])
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await open(user, 'Aja')
    expect(tabNames()).toEqual(['Order*', 'Notes'])
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await open(user, 'Abbey Road')
    expect(tabNames()).toEqual(['Pressings*', 'Notes', 'Search', 'Research'])
  })

  it('show a viewer Notes only when there are notes, with their count', async () => {
    const { user } = setup(() => {}, { canWrite: false })
    await open(user, 'Kind of Blue')
    expect(tabNames()).toEqual(['About', 'Listening*', 'Notes 1'])
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await open(user, 'Blue Train')
    // its label is in the fact line, so About has nothing and Listening stands alone
    expect(tabNames()).toEqual([])
    expect(screen.getByRole('group', { name: 'Listening' })).toBeTruthy()
  })

  it('show no tab bar when there is only one tab, and title its content', async () => {
    const { user } = setup(() => {}, { canWrite: false })
    await open(user, 'Aja')
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByRole('group', { name: 'Order' })).toBeTruthy()
  })

  it('open a sheet on its task tab again after it was closed on another', async () => {
    const { user } = setup()
    await open(user, 'Kind of Blue')
    await user.click(screen.getByRole('tab', { name: 'About' }))
    expect(tabNames()).toEqual(['About*', 'Listening', 'Notes 1', 'Research'])
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await open(user, 'Kind of Blue')
    expect(tabNames()).toEqual(['About', 'Listening*', 'Notes 1', 'Research'])
  })

  it('keep the tab chosen through Edit and Done', async () => {
    const { user } = setup()
    await open(user, 'Kind of Blue')
    await user.click(screen.getByRole('tab', { name: 'About' }))
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(tabNames()).toEqual(['About*', 'Listening', 'Notes 1', 'Research'])
  })

  it('move focus with the arrow keys, round from the last to the first', async () => {
    const { user } = setup()
    await open(user, 'Kind of Blue')
    await user.click(screen.getByRole('tab', { name: 'Research' }))
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'About' }))
    await user.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Research' }))
  })

  it('show the tab an arrow key moves to', async () => {
    const { user } = setup()
    await open(user, 'Kind of Blue')
    await user.click(screen.getByRole('tab', { name: 'About' }))
    await user.keyboard('{ArrowRight}')
    expect(tabNames()).toEqual(['About', 'Listening*', 'Notes 1', 'Research'])
  })

  it('put a hunt’s copies and Ordered it / Got it in Pressings, and Search elsewhere in Search', async () => {
    const { user } = setup()
    await open(user, 'Abbey Road')
    const pressings = screen.getByRole('tabpanel')
    expect(within(pressings).getByRole('button', { name: 'Ordered it' })).toBeTruthy()
    expect(within(pressings).getByRole('button', { name: 'Got it' })).toBeTruthy()
    expect(within(pressings).getByText('Half-speed reissue')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'Search' }))
    expect(within(screen.getByRole('tabpanel')).getByRole('link', { name: 'Every pressing on Discogs ↗' })).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'Research' }))
    expect(within(screen.getByRole('tabpanel')).queryByRole('link', { name: 'Every pressing on Discogs ↗' })).toBeNull()
  })

  it('give an owned record Pressings and Search while copies are still wanted', async () => {
    const { user } = setup((s) => Object.assign(s.records.r1, { moreCopies: [{ name: 'Mono', pressing: '1959 mono', budget: '200' }] }))
    await open(user, 'Kind of Blue')
    expect(tabNames()).toEqual(['About', 'Listening*', 'Pressings', 'Notes 1', 'Search', 'Research'])
    await user.click(screen.getByRole('tab', { name: 'Pressings' }))
    expect(within(screen.getByRole('tabpanel')).getByText('Mono')).toBeTruthy()
  })

  it('keep the plays on Listening and the written notes on Notes', async () => {
    const { user } = setup()
    await open(user, 'Kind of Blue')
    const listening = screen.getByRole('tabpanel')
    expect(within(listening).getByText('Blue in Green floated tonight.')).toBeTruthy()
    expect(within(listening).queryByText('Cleaned it before a spin.')).toBeNull()
    await user.click(screen.getByRole('tab', { name: /^Notes/ }))
    const notes = screen.getByRole('tabpanel')
    expect(within(notes).getByText('Cleaned it before a spin.')).toBeTruthy()
    expect(within(notes).queryByText(/Blue in Green floated|Played the whole album/)).toBeNull()
  })
})

describe('the About tab', () => {
  const about = async (user: User, title: string) => {
    await open(user, title)
    await user.click(screen.getByRole('tab', { name: 'About' }))
    return screen.getByRole('tabpanel')
  }
  const bought = new Date('2024-03-02T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', 2024'

  it('puts the album’s facts under its summary instead, and lists your copy with the grade in words', async () => {
    const { user } = setup((s) => Object.assign(s.records.r1.about as object, { recorded: 'New York · 1959' }))
    await open(user, 'Kind of Blue')
    // label · producers · genre, then where and when it was recorded; no full release date (the header has the year)
    expect(screen.getByText('Columbia · Produced by Teo Macero, Irving Townsend · Modal jazz, Cool jazz')).toBeTruthy()
    expect(screen.getByText('Recorded New York · 1959')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'About' }))
    const panel = screen.getByRole('tabpanel')
    expect(within(panel).queryByRole('group', { name: 'About the album' })).toBeNull()
    expect(facts(within(panel).getByRole('group', { name: 'Your copy' })).map(([k, v]) => (k === 'Runout' ? [k] : [k, v]))).toEqual([
      ['Pressing', '2015 Analogue Productions 45rpm 2LP'],
      ['Bought', `${bought} · A local record shop · $48`],
      ['Grade', 'Near mint vinyl · VG+ sleeve'],
      ['Runout'],
    ])
  })

  it('capitalises a lowercase genre, and shows the facts alone when there is no summary', async () => {
    const { user } = setup((s) => Object.assign(s.records.r1, { about: { label: 'Warner Bros. Records', genres: ['alternative rock', 'funk rock'] } }))
    await open(user, 'Kind of Blue')
    expect(screen.getByText('Warner Bros. Records · Alternative rock, funk rock')).toBeTruthy()
  })

  it('leads with the tracklist', async () => {
    const { user } = setup()
    const panel = await about(user, 'Kind of Blue')
    const tracks = within(panel).getByRole('group', { name: 'Tracklist' })
    expect(tracks.compareDocumentPosition(within(panel).getByRole('group', { name: 'Your copy' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('puts the catalog in your copy when there is no runout, the label in the fact line', async () => {
    const { user } = setup((s) => Object.assign(s.records.r3, { catalog: 'BLP 1577' }))
    const panel = await about(user, 'Blue Train')
    expect(facts(within(panel).getByRole('group', { name: 'Your copy' }))).toEqual([['Catalog', 'BLP 1577']])
    expect(screen.getByText('Blue Note')).toBeTruthy()
  })

  it('links the shop you bought from to its website', async () => {
    const { user } = setup((s) => Object.assign(s.records.r1, { shopUrl: 'https://www.amoeba.com' }))
    const copy = within(await about(user, 'Kind of Blue')).getByRole('group', { name: 'Your copy' })
    expect(within(copy).getByRole('link', { name: 'A local record shop ↗' }).getAttribute('href')).toBe('https://www.amoeba.com/')
  })

  it('shows 8 of a long tracklist, then Show all', async () => {
    const tracks = Array.from({ length: 17 }, (_, i) => ({ pos: String(i + 1), title: `Track ${i + 1}`, dur: '3:00' }))
    const { user } = setup((s) => Object.assign(s.records.r1.about as object, { tracks }))
    const list = within(await about(user, 'Kind of Blue')).getByRole('group', { name: 'Tracklist' })
    expect(within(list).getAllByText(/^Track \d+$/)).toHaveLength(8)
    await user.click(within(list).getByRole('button', { name: 'Show all 17 tracks' }))
    expect(within(list).getAllByText(/^Track \d+$/)).toHaveLength(17)
    expect(within(list).queryByRole('button', { name: /Show all/ })).toBeNull()
  })

  it('shows all of a tracklist of 12', async () => {
    const tracks = Array.from({ length: 12 }, (_, i) => ({ pos: String(i + 1), title: `Track ${i + 1}`, dur: '3:00' }))
    const { user } = setup((s) => Object.assign(s.records.r1.about as object, { tracks }))
    const list = within(await about(user, 'Kind of Blue')).getByRole('group', { name: 'Tracklist' })
    expect(within(list).getAllByText(/^Track \d+$/)).toHaveLength(12)
    expect(within(list).queryByRole('button', { name: /Show all/ })).toBeNull()
  })

  it('appears only when there is album info, your copy or tracks to show', async () => {
    const { user } = setup((s) => {
      Object.assign(s.records.r3, { label: '' })
      Object.assign(s.records.r7, { about: { summary: 's', tracks: [{ pos: 'A1', title: 'Come Together' }] } })
    })
    await open(user, 'Blue Train')
    expect(screen.queryByRole('tab', { name: 'About' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await open(user, 'Pet Sounds')
    expect(screen.queryByRole('tab', { name: 'About' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await open(user, 'Abbey Road')
    expect(screen.getByRole('tab', { name: 'About' })).toBeTruthy()
  })
})

describe('viewers', () => {
  it('have no Settings button', async () => {
    setup(() => {}, { canWrite: false })
    await screen.findAllByTestId('sleeve')
    expect(screen.queryByRole('button', { name: /^Settings/ })).toBeNull()
  })
})

describe('when the wall can’t show', () => {
  const app = (claude: Window['claude'] | undefined) =>
    render(
      <RuntimeProvider claude={claude}>
        <App />
      </RuntimeProvider>,
    )

  it('says it is loading until the records arrive', async () => {
    app(fakeClaude(sample()).claude)
    expect(screen.getByText('Loading the wall…')).toBeTruthy()
    await screen.findAllByTestId('sleeve')
    expect(screen.queryByText('Loading the wall…')).toBeNull()
  })

  it('says the page runs inside claude.ai', () => {
    app(undefined)
    expect(screen.getByText('This page runs inside claude.ai.')).toBeTruthy()
  })

  it('asks to be opened signed in when there is no data', async () => {
    app({ use: async () => null } as unknown as Window['claude'])
    expect(await screen.findByText('Open this page signed in to claude.ai to see the wall.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add a record' })).toBeNull()
  })
})
