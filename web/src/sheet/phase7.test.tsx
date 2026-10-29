// Phase 7: the pieces the parity audit found missing or different from 0.9.4 (docs/parity-map.md)
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'

type C = Record<string, Record<string, unknown>>
// the wall's filter is remembered in this browser; one test's filter isn't the next one's
afterEach(() => localStorage.clear())
const ARTISTS: C = {
  'mb-miles': {
    name: 'Miles Davis',
    summary: 'Miles Davis was an American jazz trumpeter.\n\nHe led bands for five decades.',
    source: 'claude',
    wiki: 'https://en.wikipedia.org/wiki/Miles_Davis',
    links: [
      { kind: 'facebook', url: 'https://facebook.com/milesdavis' },
      { kind: 'website', url: 'https://milesdavis.com' },
      { kind: 'x', url: 'https://x.com/milesdavis' },
      { kind: 'instagram', url: 'https://instagram.com/milesdavis' },
      { kind: 'spotify', url: 'https://open.spotify.com/artist/miles' },
      { kind: 'youtube', url: 'https://youtube.com/milesdavis' },
      { kind: 'website', url: 'https://second.example' },
      { kind: 'myspace', url: 'https://myspace.com/miles' },
      { kind: 'bandcamp', url: 'javascript:alert(1)' },
    ],
  },
}

function setup(edit: (s: ReturnType<typeof sample>) => void = () => {}, opts: Parameters<typeof fakeClaude>[1] = {}, collections: Record<string, C> = {}) {
  const seed = sample()
  Object.assign(seed.records.r1, { artistRef: 'mb-miles', aboutAt: 1, aboutV: 3 })
  edit(seed)
  const fake = fakeClaude({ ...seed, collections: { artists: ARTISTS, ...collections } }, opts)
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
const about = async (user: User, title: string) => {
  await open(user, title)
  await user.click(screen.getByRole('tab', { name: 'About' }))
  return screen.getByRole('tabpanel')
}
const section = (panel: HTMLElement, name: string) => within(panel).getByRole('group', { name })
const links = (el: HTMLElement) => within(el).queryAllByRole('link').map((a) => a.textContent)

describe('About the artist', () => {
  it('names the artist, with the summary, its credit, and five links in order before Show all', async () => {
    const { user } = setup()
    const s = section(await about(user, 'Kind of Blue'), 'About the artist')
    expect(within(s).getByRole('heading', { name: 'Miles Davis' })).toBeTruthy()
    expect(within(s).getByText('Miles Davis was an American jazz trumpeter.')).toBeTruthy()
    expect(within(s).queryByText('He led bands for five decades.')).toBeNull()
    expect(within(s).getByText(/Summary by Claude/)).toBeTruthy()
    // http(s) only, one per kind, known kinds, in a fixed order
    expect(links(s)).toEqual(['Wikipedia ↗', 'Website ↗', 'Instagram ↗', 'YouTube ↗', 'Spotify ↗', 'X ↗'])
    await user.click(within(s).getByRole('button', { name: 'Show all 6 links' }))
    expect(links(s)).toEqual(['Wikipedia ↗', 'Website ↗', 'Instagram ↗', 'YouTube ↗', 'Spotify ↗', 'X ↗', 'Facebook ↗'])
    // More and the links open on their own
    expect(within(s).queryByText('He led bands for five decades.')).toBeNull()
    await user.click(within(s).getByRole('button', { name: 'More' }))
    expect(within(s).getByText('He led bands for five decades.')).toBeTruthy()
  })

  it('credits a summary that is not Claude’s to where it came from', async () => {
    const { user } = setup((s) => Object.assign(s.records.r1, { artistRef: 'd' }), {}, { artists: { d: { name: 'X', summary: 'From Discogs.', source: 'discogs' } } })
    const s = section(await about(user, 'Kind of Blue'), 'About the artist')
    expect(within(s).getByText('From Discogs')).toBeTruthy()
    expect(links(s)).toEqual([])
  })

  it('brings the About tab when it is all there is to show', async () => {
    const { user } = setup((s) => Object.assign(s.records.r3, { label: '', artistRef: 'mb-miles', aboutAt: 1, aboutV: 3 }))
    const panel = await about(user, 'Blue Train')
    expect(within(panel).getAllByRole('group')).toHaveLength(1)
    expect(within(panel).getByRole('group', { name: 'About the artist' })).toBeTruthy()
  })

  it('is not shown when Not this artist was used', async () => {
    const { user } = setup((s) => Object.assign(s.records.r1, { aboutBlocked: true }))
    await open(user, 'Kind of Blue')
    const tab = screen.queryByRole('tab', { name: 'About' })
    if (tab) await user.click(tab)
    expect(screen.queryByRole('group', { name: 'About the artist' })).toBeNull()
  })
})

describe('the About tab', () => {
  it('lists the tracks by side with their times, and where the list came from', async () => {
    const { user } = setup((s) => Object.assign(s.records.r1.about as object, { tracksSource: 'discogs', tracksUrl: 'https://www.discogs.com/release/7140383' }))
    const s = section(await about(user, 'Kind of Blue'), 'Tracklist')
    expect(within(s).getAllByText(/^Side [A-D]/).map((x) => x.textContent)).toEqual(['Side A · 9:22', 'Side B · 15:23', 'Side C · 11:33', 'Side D · 9:26'])
    expect(within(s).getByRole('link', { name: 'your Discogs pressing ↗' })).toBeTruthy()
  })

  it('names MusicBrainz when the tracks came from there', async () => {
    const { user } = setup()
    const s = section(await about(user, 'Kind of Blue'), 'Tracklist')
    expect(within(s).getByText('From MusicBrainz')).toBeTruthy()
  })

  it('puts the recording dates on their own line', async () => {
    const { user } = setup((s) => Object.assign(s.records.r1.about as object, { recorded: 'Columbia 30th Street Studio, New York · March 2 and April 22, 1959' }))
    const s = section(await about(user, 'Kind of Blue'), 'About the album')
    expect(within(s).getByText(/30th Street/).textContent).toBe('Columbia 30th Street Studio, New York\nMarch 2 and April 22, 1959')
  })

  it('folds your copy’s runout behind its sides and catalog, with your pressing’s Discogs links', async () => {
    const { user } = setup()
    const s = section(await about(user, 'Kind of Blue'), 'Your copy')
    expect(within(s).queryByText('Side A: AAPJ 8163-45 A')).toBeNull()
    await user.click(within(s).getByRole('button', { name: /2 sides · Cat\. AAPJ 8163-45/ }))
    expect(within(s).getByText('Side A: AAPJ 8163-45 A')).toBeTruthy()
    expect(links(s)).toEqual(['Your pressing ↗', 'What it sells for ↗', 'Other pressings ↗'])
  })
})

describe('Copy runout for a Discogs submission', () => {
  it('needs only a runout, and selects the text when the clipboard is blocked', async () => {
    const { user } = setup((s) => Object.assign(s.records.r1, { discogsId: '' }))
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('blocked'))
    await open(user, 'Kind of Blue')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await user.click(screen.getByRole('button', { name: 'Copy runout for a Discogs submission' }))
    const box = (await screen.findByRole('textbox', { name: 'Runout for a Discogs submission' })) as HTMLTextAreaElement
    expect(box.value).toMatch(/^Matrix \/ Runout: Side A: AAPJ 8163-45 A/)
    expect(screen.getByText("Selected: copy it with your device's copy command")).toBeTruthy()
    expect(document.activeElement).toBe(box)
    // it follows what's typed, and leaves the cursor where it's typed
    const b = screen.getByRole('textbox', { name: 'Side B' })
    await user.clear(b)
    await user.type(b, 'NEW')
    expect(box.value).toMatch(/Side B: NEW/)
    expect(document.activeElement).toBe(b)
    vi.restoreAllMocks()
  })
})

describe('back to 0.9.4', () => {
  it('shows each play’s length as ● ◐ ◔', async () => {
    const { user } = setup()
    await open(user, 'Kind of Blue')
    expect(screen.getAllByText(/^[●◐◔]$/).map((x) => x.textContent)).toEqual(['●', '◐'])
  })

  it('says a record on Discogs is coming off it too', async () => {
    const { user } = setup()
    await open(user, 'Pet Sounds')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await user.click(screen.getByRole('button', { name: 'Remove from the wall…' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('Removed. Taking it off Discogs too.')).toBeTruthy()
  })

  it('shows Looking it up… in the runtime field while a lookup waits', async () => {
    const { user } = setup((s) => Object.assign(s.records.r3, { needsEnrich: true }))
    await open(user, 'Blue Train')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    expect(screen.getByRole('textbox', { name: 'Runtime (min)' }).getAttribute('placeholder')).toBe('Looking it up…')
  })

  it('labels the example records on the wall', async () => {
    setup((s) => Object.assign(s.records.r3, { example: true }))
    const sleeve = await screen.findByRole('button', { name: /Open Blue Train/ })
    expect(within(sleeve).getByText('Example')).toBeTruthy()
    expect(within(screen.getByRole('button', { name: /Open Kind of Blue/ })).queryByText('Example')).toBeNull()
  })

  it('hides Search on an empty wall, and says when the filter narrows a search to nothing', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Search the wall' }))
    await user.type(screen.getByRole('searchbox'), 'zzz')
    expect(await screen.findByText('Nothing on the wall matches “zzz”.')).toBeTruthy()
    await user.clear(screen.getByRole('searchbox'))
    await user.click(screen.getByRole('button', { name: /on the way/ }))
    await user.type(screen.getByRole('searchbox'), 'zzz')
    expect(await screen.findByText('Nothing on the wall matches “zzz” with this filter.')).toBeTruthy()
  })

  it('has no Search with nothing hanging', async () => {
    render(
      <RuntimeProvider claude={fakeClaude({ records: {} }, { canWrite: false }).claude}>
        <App />
      </RuntimeProvider>,
    )
    await screen.findByText('Nothing hanging yet.')
    expect(screen.queryByRole('button', { name: 'Search the wall' })).toBeNull()
  })
})

describe('the design checklist pass', () => {
  it('shows a viewer no busy dots or lookup line, which only an editor can act on', async () => {
    const { user } = setup((s) => Object.assign(s.records.r3, { needsEnrich: true }), { canWrite: false })
    const sleeve = await screen.findByRole('button', { name: /Open Blue Train/ })
    expect(sleeve.getAttribute('aria-label')).not.toMatch(/syncing/)
    await open(user, 'Blue Train')
    expect(screen.queryByText(/^Looking up/)).toBeNull()
  })

  it('names a viewer’s lone Search tab, with no empty Pressings or Research', async () => {
    const { user } = setup(() => {}, { canWrite: false })
    await open(user, 'Pet Sounds')
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByRole('group', { name: 'Search elsewhere' })).toBeTruthy()
  })

  it('tells an editor how to add the copy a hunt is after', async () => {
    const { user } = setup()
    await open(user, 'Pet Sounds')
    expect(screen.getByText("No copies yet. Add the pressing you're after in Edit.")).toBeTruthy()
  })

  it('opens the new task tab after a status move', async () => {
    const { user } = setup()
    await open(user, 'Aja')
    await user.click(screen.getByRole('tab', { name: /Notes/ }))
    await user.click(screen.getByRole('button', { name: 'It arrived' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Listening' }).getAttribute('aria-selected')).toBe('true'))
  })

  it('puts Hang it after the details once they are open', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Add a record' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add a record' })
    const order = () => {
      const hang = within(sheet).getByRole('button', { name: 'Hang it' })
      const more = within(sheet).getByRole('button', { name: 'Add details now' })
      return more.compareDocumentPosition(hang) & Node.DOCUMENT_POSITION_FOLLOWING ? 'after' : 'before'
    }
    expect(order()).toBe('before')
    await user.click(within(sheet).getByRole('button', { name: 'Add details now' }))
    expect(order()).toBe('after')
  })
})
