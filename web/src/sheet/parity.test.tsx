// Phase 7: the smoke test's scenarios and the parity map's untested rows, as a person sees them (docs/parity-map.md)
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { today } from '../model/record'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'
import { openCopies } from './openCopies'

type C = Record<string, Record<string, unknown>>
type Seed = ReturnType<typeof sample>
function setup(edit: (s: Seed) => void = () => {}, opts: Parameters<typeof fakeClaude>[1] = {}, collections: Record<string, C> = {}) {
  const seed = sample()
  edit(seed)
  const fake = fakeClaude({ ...seed, collections }, opts)
  render(
    <RuntimeProvider claude={fake.claude}>
      <App />
    </RuntimeProvider>,
  )
  return { fake, user: userEvent.setup() }
}
type User = ReturnType<typeof userEvent.setup>
type Fake = ReturnType<typeof fakeClaude>
const open = async (user: User, title: string) => {
  await user.click(await screen.findByRole('button', { name: new RegExp('Open ' + title) }))
  await screen.findByRole('heading', { name: title })
}
const close = async (user: User, title: string) => {
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('heading', { name: title })).toBeNull())
}
const btn = (name: string | RegExp) => screen.getByRole('button', { name })
const notes = (fake: Fake, id: string) => fake.records[id].notes as Record<string, unknown>[]
// the play in the history (or the note) that reads this way
const row = (text: RegExp) => {
  const found = within(screen.getByRole('tabpanel')).getAllByRole('listitem').filter((li) => text.test(li.textContent!))
  expect(found).toHaveLength(1)
  return found[0]
}
const month = (name: string | RegExp) => screen.getByRole('button', { name })
const monthName = (d: string) => new Date(d + 'T12:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
const thisMonth = today().slice(0, 8)
const lastYear = String(+today().slice(0, 4) - 1)
afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('the Listening tab', () => {
  it("shows the year of a play from another year as the last one", async () => {
    const { user } = setup((s) => (s.records.r3.notes = [{ d: lastYear + '-03-14', t: 'Played the whole album (~42 min)' }]))
    await open(user, 'Blue Train')
    const last = screen.getByText('Last').nextElementSibling!
    expect(last.textContent).toMatch(new RegExp(', ' + lastYear + '$'))
  })

  it('has no stats or Log play on an ordered record', async () => {
    const { user } = setup((s) => (s.records.r5.notes = [{ d: '2026-01-02', t: 'Played the whole album (~40 min)' }]))
    await open(user, 'Aja')
    expect(screen.queryByText('Plays')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Log play' })).toBeNull()
  })

  it('reads each play compactly, with its comment as thoughts, grouped by month, and nothing to delete in view', async () => {
    const { user } = setup()
    await open(user, 'Kind of Blue')
    expect(within(row(/Whole album · Living room/)).getByText('Side B hit different tonight.')).toBeTruthy()
    expect(within(row(/Side B · Den/)).getByText('Blue in Green floated tonight.')).toBeTruthy()
    const months = within(screen.getByRole('tabpanel')).getAllByRole('button').filter((b) => b.hasAttribute('aria-expanded'))
    // this month and the one 400 days back
    expect(months).toHaveLength(2)
    expect(months[0].textContent).toMatch(new RegExp('^' + monthName(today())))
    expect(screen.queryByRole('button', { name: 'Delete this play' })).toBeNull()
  })

  it('links the addresses in a play’s thoughts', async () => {
    const { user } = setup((s) => (s.records.r3.notes = [{ d: today(), t: 'Played the whole album (~42 min)', j: 'Read https://example.com/liner-notes.' }]))
    await open(user, 'Blue Train')
    expect(within(row(/Whole album/)).getByRole('link', { name: 'example.com/liner-notes' }).getAttribute('href')).toBe('https://example.com/liner-notes')
  })

  it('reads an older play’s mood as its vibe', async () => {
    const { user } = setup((s) => (s.records.r3.notes = [
      { d: today(), t: 'Played the whole album (~42 min)', mood: 'loved' },
      { d: today(), t: 'Played one side (~21 min)', side: 'A', mood: 'meh' },
    ]))
    await open(user, 'Blue Train')
    expect(within(row(/Whole album/)).getByText('Goosebumps')).toBeTruthy()
    expect(within(row(/Side A/)).getByText('Easy')).toBeTruthy()
  })
})

describe('months in the play history', () => {
  const plays = (s: Seed) =>
    (s.records.r3.notes = [
      { d: lastYear + '-03-14', t: 'Played the whole album (~42 min)' },
      { d: lastYear + '-05-02', t: 'Played one side (~21 min)', side: 'A' },
      { d: lastYear + '-05-09', t: 'Played the whole album (~42 min)' },
    ])

  it('opens the latest month when nothing was played this one, and folds the others to their plays and hours', async () => {
    const { user } = setup(plays)
    await open(user, 'Blue Train')
    expect(month(new RegExp('May ' + lastYear)).getAttribute('aria-expanded')).toBe('true')
    const march = month(new RegExp('March ' + lastYear))
    expect(march.getAttribute('aria-expanded')).toBe('false')
    expect(march.textContent).toContain('1 play · 0.7 h')
  })

  it('opens a folded month keeping the play card as it was, and folds it again when the record is opened again', async () => {
    const { user } = setup(plays)
    await open(user, 'Blue Train')
    await user.click(btn('Side'))
    await user.click(month(new RegExp('March ' + lastYear)))
    expect(month(new RegExp('March ' + lastYear)).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(/^Mar 14, /)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Side', pressed: true })).toBeTruthy()
    await close(user, 'Blue Train')
    await open(user, 'Blue Train')
    expect(month(new RegExp('March ' + lastYear)).getAttribute('aria-expanded')).toBe('false')
  })

  it('opens the current month when it has plays', async () => {
    const { user } = setup()
    await open(user, 'Kind of Blue')
    expect(month(new RegExp(monthName(today()))).getAttribute('aria-expanded')).toBe('true')
  })
})

describe('an older play', () => {
  it('offers + Thoughts when it has none, and Edit when it has some; Cancel writes nothing', async () => {
    const { fake, user } = setup((s) => (s.records.r3.notes = [{ d: today(), t: 'Played the whole album (~42 min)' }]))
    await open(user, 'Blue Train')
    await user.click(within(row(/Whole album/)).getByRole('button', { name: '+ Thoughts' }))
    const box = screen.getByRole('textbox', { name: 'Your thoughts' })
    expect(box.getAttribute('placeholder')).toBe('What stood out tonight?')
    await user.type(box, 'Not saved')
    await user.click(btn('Cancel'))
    expect(screen.queryByRole('textbox', { name: 'Your thoughts' })).toBeNull()
    expect(fake.calls).toEqual([])
    await user.click(within(row(/Whole album/)).getByRole('button', { name: '+ Thoughts' }))
    await user.type(screen.getByRole('textbox', { name: 'Your thoughts' }), 'Saved')
    await user.click(btn('Save'))
    expect(await within(row(/Whole album/)).findByRole('button', { name: 'Edit' })).toBeTruthy()
    expect(notes(fake, 'r3')[0]).toMatchObject({ j: 'Saved' })
  })

  it('moves to another day with its gear entry', async () => {
    const d = thisMonth + '01'
    const gear = { sty: { type: 'stylus', name: 'ATN-VM95E', setup: 'den', status: 'active', tracks: true, minutes: 23, plays: [{ d, id: 'r1', min: 23, setup: 'den' }], notes: [], added: 1 } }
    const { fake, user } = setup(() => {}, {}, { gear, setups: { den: { name: 'Den', added: 1 } } })
    await open(user, 'Kind of Blue')
    await user.click(within(row(/Side B · Den/)).getByRole('button', { name: 'Edit' }))
    const day = screen.getByRole('spinbutton', { name: 'day' })
    await user.click(day)
    await user.keyboard('15')
    await user.click(btn('Save'))
    await waitFor(() => expect(notes(fake, 'r1').find((n) => n.side === 'B')!.d).toBe(thisMonth + '15'))
    await waitFor(() => expect((fake.store.gear.sty.plays as { d: string }[])[0].d).toBe(thisMonth + '15'))
  })
})

describe('the vibe', () => {
  it('starts unset, Clear unsets it again, and a saved one shows in the play’s row', async () => {
    const { fake, user } = setup()
    await open(user, 'Kind of Blue')
    await user.click(within(row(/Side B · Den/)).getByRole('button', { name: 'Edit' }))
    await user.click(btn('Clear'))
    expect(btn('Set the vibe')).toBeTruthy()
    await user.click(btn('Save'))
    await waitFor(() => expect(notes(fake, 'r1').find((n) => n.side === 'B')).not.toHaveProperty('vibe'))
    expect(within(row(/Side B · Den/)).queryByText('Goosebumps')).toBeNull()

    await user.click(btn('Log play'))
    expect(await screen.findByRole('button', { name: 'Set the vibe' })).toBeTruthy()
    await user.click(btn('Set the vibe'))
    await user.click(btn('Save'))
    expect((await screen.findByText('Locked in')).closest('li')!.textContent).toMatch(/Whole album/)
  })
})

describe('Log a play', () => {
  const SETUPS: C = { den: { name: 'Den', added: 1 }, lr: { name: 'Living room', added: 2 } }

  it('remembers the setup it was played on', async () => {
    const { fake, user } = setup(() => {}, {}, { setups: SETUPS })
    await open(user, 'Blue Train')
    await user.click(screen.getByRole('combobox', { name: 'Played on' }))
    await user.click(await screen.findByRole('option', { name: 'Living room' }))
    await user.click(btn('Log play'))
    await waitFor(() => expect(notes(fake, 'r3').at(-1)!.t).toBe('Played the whole album on Living room (~42 min)'))
    expect(localStorage.getItem('rw.lastSetup')).toBe('lr')
    await close(user, 'Blue Train')
    await open(user, 'Kind of Blue')
    expect(screen.getByRole('combobox', { name: 'Played on' }).textContent).toBe('Living room')
  })

  it('hides the sides while picking tracks', async () => {
    const { user } = setup()
    await open(user, 'Kind of Blue')
    await user.click(btn('Side'))
    expect(screen.getByRole('group', { name: 'Which side' })).toBeTruthy()
    await user.click(btn('Tracks'))
    expect(screen.queryByRole('group', { name: 'Which side' })).toBeNull()
  })

  it('numbers each track on its side', async () => {
    const { user } = setup()
    await open(user, 'Kind of Blue')
    await user.click(btn('Tracks'))
    expect(screen.getAllByRole('checkbox').map((c) => c.closest('label')!.textContent)).toEqual([
      'So What 9:22',
      '1 - Freddie Freeloader 9:46',
      '2 - Blue in Green 5:37',
      'All Blues 11:33',
      'Flamenco Sketches 9:26',
    ])
  })
})

describe('notes written by hand', () => {
  it('skips a blank entry, and shows a play typed by hand as written', async () => {
    const { user } = setup((s) =>
      Object.assign(s.records.r3, {
        notes: [null, { d: 'March 3, 2024', t: 'Bought a second copy.' }, { d: '2026-01-02', t: "Played the whole album twice at Dave's (~40 min)" }],
      }),
    )
    await open(user, 'Blue Train')
    expect(within(screen.getByRole('tabpanel')).getByText(/Played the whole album twice at Dave's \(~40 min\)/)).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: /Notes/ }))
    expect(within(screen.getByRole('tabpanel')).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['March 3, 2024Bought a second copy.Edit'])
  })

  it('shows an odd date as written', async () => {
    const { user } = setup((s) => (s.records.r3.notes = [{ d: 'March 3, 2024', t: 'Bought a second copy.' }]))
    await open(user, 'Blue Train')
    await user.click(screen.getByRole('tab', { name: /Notes/ }))
    const items = within(screen.getByRole('tabpanel')).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(['March 3, 2024Bought a second copy.Edit'])
  })

  it('takes several lines, and Ctrl+Enter adds it', async () => {
    const { fake, user } = setup()
    await open(user, 'Blue Train')
    await user.click(screen.getByRole('tab', { name: /Notes/ }))
    const box = screen.getByRole('textbox', { name: 'Note' })
    await user.type(box, 'Line one{Enter}Line two')
    expect(fake.calls).toEqual([])
    await user.keyboard('{Control>}{Enter}{/Control}')
    await waitFor(() => expect(notes(fake, 'r3').map((n) => n.t)).toEqual(['Line one\nLine two']))
  })

  it.each([
    ['Blue Train', 'Add a note about this record…'],
    ['Aja', 'Shipping update, a note from the seller…'],
    ['Pet Sounds', 'A store you checked, a price you saw…'],
  ])('asks %s for the note that suits it', async (title, placeholder) => {
    const { user } = setup()
    await open(user, title)
    await user.click(screen.getByRole('tab', { name: /Notes/ }))
    expect(screen.getByRole('textbox', { name: 'Note' }).getAttribute('placeholder')).toBe(placeholder)
  })

  it('links only web addresses, keeping brackets and full stops right, and Edit shows the note as stored', async () => {
    const text =
      'Also (https://shop.example.com/x). Not javascript:alert(1)\nSee https://en.wikipedia.org/wiki/Ten_(Pearl_Jam_album) and HTTPS://example.org/care'
    const { user } = setup((s) => (s.records.r3.notes = [{ d: today(), t: text }]))
    await open(user, 'Blue Train')
    await user.click(screen.getByRole('tab', { name: /Notes/ }))
    const panel = screen.getByRole('tabpanel')
    const links = within(panel).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://shop.example.com/x',
      'https://en.wikipedia.org/wiki/Ten_(Pearl_Jam_album)',
      'HTTPS://example.org/care',
    ])
    expect(links[0].parentElement!.textContent).toBe('shop.example.com/x).')
    expect(links[2].textContent).toBe('example.org/care')
    expect(within(panel).getByText(/Not javascript:alert\(1\)/)).toBeTruthy()
    await user.click(within(panel).getByRole('button', { name: 'Edit' }))
    expect((screen.getByRole('textbox', { name: 'Edit note' }) as HTMLTextAreaElement).value).toBe(text)
  })
})

describe('removing a record', () => {
  it('says "Couldn\'t remove it" when the wall refuses', async () => {
    const { user } = setup(() => {}, { failWrites: true })
    await open(user, 'Blue Train')
    await user.click(btn('Edit'))
    await user.click(btn('Remove from the wall…'))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText(/^Couldn't remove it: /)).toBeTruthy()
  })
})

describe('moving a record', () => {
  it('says "Moved back to the hunt." when edit moves a record to the hunt', async () => {
    const { fake, user } = setup()
    await open(user, 'Aja')
    await user.click(btn('Edit'))
    await user.click(btn('Wanted'))
    await waitFor(() => expect(fake.records.r5.status).toBe('wish'))
    expect(await screen.findByText('Moved back to the hunt.')).toBeTruthy()
  })

  it('back to Want brings every copy back, the record’s own first', async () => {
    const { fake, user } = setup((s) =>
      Object.assign(s.records.r5, { copyName: 'Cisco 45', budget: '60', moreCopies: [{ name: 'Later', pressing: '', label: '', catalog: '', budget: '70' }] }),
    )
    await open(user, 'Aja')
    await user.click(btn('Edit'))
    await user.click(btn('Wanted'))
    await waitFor(() => expect(fake.records.r5.status).toBe('wish'))
    await user.click(btn('Done'))
    const g = await screen.findByRole('group', { name: 'The copies you want' })
    expect(within(g).getAllByRole('button').map((b) => b.textContent)).toEqual(['Cisco 45Up to $60', 'LaterUp to $70'])
  })

  it('Ordered it puts the cursor in Paid, drops the old shop’s website, and notes what was entered', async () => {
    const { fake, user } = setup((s) => Object.assign(s.records.r6, { shop: 'Amoeba', shopUrl: 'https://old.example' }))
    await open(user, 'Pet Sounds')
    await user.click(btn('Ordered it'))
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Paid' }))
    await user.type(screen.getByRole('textbox', { name: 'Paid' }), '$32')
    await user.clear(screen.getByRole('combobox', { name: 'From' }))
    await user.type(screen.getByRole('combobox', { name: 'From' }), 'Rough Trade')
    await user.click(btn('Save'))
    expect(await screen.findByText('Marked as ordered today.')).toBeTruthy()
    expect(fake.records.r6).toMatchObject({ status: 'ordered', paid: '32', shop: 'Rough Trade', shopUrl: '' })
    expect(notes(fake, 'r6').at(-1)).toEqual({ d: today(), t: 'Ordered · $32 from Rough Trade' })
  })

  it('switching to Edit drops what was being asked, unmoved', async () => {
    const { fake, user } = setup()
    await open(user, 'Pet Sounds')
    await user.click(btn('Got it'))
    expect(screen.getByRole('combobox', { name: 'Bought from' })).toBeTruthy()
    await user.click(btn('Edit'))
    await user.click(btn('Done'))
    expect(screen.queryByRole('textbox', { name: 'Paid' })).toBeNull()
    expect(btn('Got it')).toBeTruthy()
    expect(fake.records.r6.status).toBe('wish')
  })
})

describe('edit mode', () => {
  it('follows the view: the record (with its year and runtime), why, then your copy; grades in words', async () => {
    const { user } = setup()
    await open(user, 'Kind of Blue')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await openCopies(user)
    const [rec, why, copy] = ['The record', "Why it's on the wall", 'Your copy'].map((name) => screen.getByRole('group', { name }))
    expect(within(rec).getByRole('textbox', { name: /^Year released/ })).toBeTruthy()
    expect(within(rec).getByRole('textbox', { name: 'Runtime (min)' })).toBeTruthy()
    expect(rec.compareDocumentPosition(why) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(why.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'About the album' })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Vinyl' }).textContent).toBe('Near mint (NM)')
    expect(screen.getByRole('combobox', { name: 'Sleeve' }).textContent).toBe('Very good plus (VG+)')
    await user.click(screen.getByRole('combobox', { name: 'Vinyl' }))
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([
      'Not graded', 'Mint (M)', 'Near mint (NM)', 'Very good plus (VG+)', 'Very good (VG)', 'Good plus (G+)', 'Good (G)', 'Fair (F)', 'Poor (P)',
    ])
  })

  it('adds https:// to a shop website left without it, and says when one won’t link', async () => {
    const { fake, user } = setup()
    await open(user, 'Aja')
    await user.click(btn('Edit'))
    await openCopies(user)
    const site = screen.getByRole('textbox', { name: 'Shop website' })
    await user.type(site, 'roughtrade.com')
    await user.click(btn('Done'))
    await waitFor(() => expect(fake.records.r5.shopUrl).toBe('https://roughtrade.com/'))
    await user.click(btn('Edit'))
    await openCopies(user)
    await user.clear(screen.getByRole('textbox', { name: 'Shop website' }))
    await user.type(screen.getByRole('textbox', { name: 'Shop website' }), 'javascript:alert(1)')
    expect(screen.queryByText("Not a web address, so it won't link")).toBeNull()
    await user.tab()
    expect(screen.getByText("Not a web address, so it won't link")).toBeTruthy()
  })
})

describe('the copies a hunt wants', () => {
  it('folds a copy with nothing but its name into a row of its own', async () => {
    const { user } = setup((s) => Object.assign(s.records.r6, { copyName: 'Stereo', moreCopies: [{ name: 'Mono', pressing: '', label: '', catalog: '', budget: '' }] }))
    await open(user, 'Pet Sounds')
    const g = screen.getByRole('group', { name: 'The copies you want' })
    expect(within(g).getByText('Mono')).toBeTruthy()
    expect(within(g).getByText('Stereo')).toBeTruthy()
  })
})

describe('Add details now', () => {
  it('asks what it is first, then shows that kind’s fields', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Add a record' }))
    const sheet = await screen.findByRole('dialog')
    await user.click(within(sheet).getByRole('button', { name: 'Add details now' }))
    expect(within(sheet).getByText('Choose what it is first.')).toBeTruthy()
    await user.click(within(sheet).getByRole('button', { name: 'I own it' }))
    expect(within(sheet).getByRole('group', { name: 'Your copy' })).toBeTruthy()
    await user.click(within(sheet).getByRole('button', { name: 'On order' }))
    // a new order's copy and its Order details start open, to be filled in
    expect(within(within(sheet).getByRole('group', { name: 'The copy you ordered' })).getByRole('button', { name: /^Order details/ }).getAttribute('aria-expanded')).toBe('true')
    expect(within(sheet).queryByRole('group', { name: 'Your copy' })).toBeNull()
    await user.click(within(sheet).getByRole('button', { name: 'I want it' }))
    expect(within(sheet).getAllByRole('group', { name: 'Priority' }).length).toBeGreaterThan(0)
    expect(within(sheet).queryByRole('group', { name: 'The copy you ordered' })).toBeNull()
  })
})

describe('research', () => {
  it('Follow up in chat hands over a prompt picking up from that entry', async () => {
    const { user } = setup()
    await open(user, 'Abbey Road')
    await user.click(screen.getByRole('tab', { name: 'Research' }))
    await user.click(btn('Follow up in chat'))
    expect(await navigator.clipboard.readText()).toMatch(/^Follow up on my research from .*: "A clean UK first is worth it; the half-speed is the value pick"\nRecord: "Abbey Road" by The Beatles \(record r7\)/)
    expect(screen.getByText('Copied. Paste it into Claude to pick up from here.')).toBeTruthy()
  })

  it('shows the prompt selected when the clipboard is blocked', async () => {
    const { user } = setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('blocked'))
    await open(user, 'Abbey Road')
    await user.click(screen.getByRole('tab', { name: 'Research' }))
    await user.click(btn('Copy for Claude'))
    expect(await screen.findByText("Selected: copy it with your device's copy command")).toBeTruthy()
    const prompt = screen.getByText(/^Research a record on my Vinyl Wall/)
    expect(prompt.textContent).toContain('Record: "Abbey Road" by The Beatles (record r7)')
    expect(getSelection()!.toString()).toBe(prompt.textContent)
  })
})

