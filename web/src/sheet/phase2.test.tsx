import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../App'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'

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
const legend = (name: string) => screen.getByRole('group', { name })

describe('edit mode: priority and copies', () => {
  it('saves a priority as a number, and Discogs sync hears of it', async () => {
    const { fake, user } = setup()
    await open(user, 'Pet Sounds')
    await user.click(btn('Edit'))
    await user.click(screen.getByRole('button', { name: 'Top' }))
    await user.click(btn('Done'))
    await waitFor(() => expect(updates(fake, 'r6').at(-1)).toEqual({ priority: 1, needsSync: true }))
  })

  it("edits a hunt's copies: the first in the record's own fields, the others in moreCopies", async () => {
    const { fake, user } = setup()
    await open(user, 'Abbey Road')
    await user.click(btn('Edit'))
    const g = legend('The copies you want')
    expect(within(g).getByRole('heading', { name: 'UK first' })).toBeTruthy()
    const budgets = within(g).getAllByRole('textbox', { name: 'Budget' })
    await user.clear(budgets[1])
    await user.type(budgets[1], '45')
    await user.click(btn('Done'))
    await waitFor(() =>
      expect(updates(fake, 'r7').at(-1)).toEqual({
        moreCopies: [{ name: 'Half-speed reissue', pressing: '2019 half-speed', label: 'Apple', catalog: '', budget: '45', discogsId: '' }],
        needsSync: true,
      }),
    )
  })

  it('adds a copy at once and puts the cursor in its name', async () => {
    const { fake, user } = setup()
    await open(user, 'Pet Sounds')
    await user.click(btn('Edit'))
    expect(screen.getByRole('group', { name: 'The copy you want' })).toBeTruthy()
    // a lone copy can't be removed
    expect(screen.queryByRole('button', { name: 'Remove this copy' })).toBeNull()
    await user.click(btn('+ Add another copy'))
    await waitFor(() => expect(updates(fake, 'r6').at(-1)?.moreCopies).toHaveLength(1))
    const names = within(legend('The copies you want')).getAllByRole('textbox', { name: 'Name' })
    expect(document.activeElement).toBe(names[1])
    await user.type(names[1], 'Mono')
    expect(within(legend('The copies you want')).getByRole('heading', { name: 'Mono' })).toBeTruthy()
  })

  it("removing a hunt's first copy moves the next one up, after asking when it has details", async () => {
    const { fake, user } = setup()
    await open(user, 'Abbey Road')
    await user.click(btn('Edit'))
    await user.click(screen.getAllByRole('button', { name: 'Remove this copy' })[0])
    await user.click(await screen.findByRole('button', { name: 'Remove' }))
    await waitFor(() =>
      expect(updates(fake, 'r7').at(-1)).toEqual({
        copyName: 'Half-speed reissue', pressing: '2019 half-speed', label: 'Apple', budget: '40', moreCopies: [], needsSync: true,
      }),
    )
    expect(screen.getByRole('group', { name: 'The copy you want' })).toBeTruthy()
  })

  it('shows an owned record the copies it still wants, and lets them all go', async () => {
    const { fake, user } = setup({}, { r8: { title: 'Revolver', artist: 'The Beatles', status: 'own', moreCopies: [{ name: 'Mono', budget: '' }], notes: [], added: 8 } })
    await open(user, 'Revolver')
    await user.click(btn('Edit'))
    const g = legend('The copy you still want')
    await user.click(within(g).getByRole('button', { name: 'Remove this copy' }))
    await user.click(await screen.findByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(updates(fake, 'r8').at(-1)).toEqual({ moreCopies: [], needsSync: true }))
    expect(screen.queryByRole('group', { name: 'The copy you still want' })).toBeNull()
  })

  it('gives an ordered record the copy it ordered', async () => {
    const { fake, user } = setup()
    await open(user, 'Aja')
    await user.click(btn('Edit'))
    const g = legend('The copy you ordered')
    await user.type(within(g).getByRole('textbox', { name: 'Name' }), 'Cisco 45')
    await user.click(btn('Done'))
    await waitFor(() => expect(updates(fake, 'r5').at(-1)).toEqual({ copyName: 'Cisco 45', needsSync: true }))
  })

  it('shows a copy added elsewhere while editing', async () => {
    const { fake, user } = setup()
    await open(user, 'Pet Sounds')
    await user.click(btn('Edit'))
    fake.remote('r6', { moreCopies: [{ name: 'Stereo', pressing: '', label: '', catalog: '', budget: '' }] })
    expect(within(await screen.findByRole('group', { name: 'The copies you want' })).getByRole('heading', { name: 'Stereo' })).toBeTruthy()
  })
})

describe('a new hunt', () => {
  it('hangs with its first copy and chosen priority', async () => {
    const { fake, user } = setup()
    await user.click(await screen.findByRole('button', { name: /Add a record/ }))
    await user.type(screen.getByRole('textbox', { name: 'Album' }), 'Rumours')
    await user.type(screen.getByRole('textbox', { name: 'Artist' }), 'Fleetwood Mac')
    await user.click(screen.getByRole('button', { name: 'I want it' }))
    await user.click(btn('Add details now'))
    await user.click(screen.getByRole('button', { name: 'Someday' }))
    await user.type(screen.getByRole('textbox', { name: 'Budget' }), '30')
    expect(screen.queryByRole('button', { name: '+ Add another copy' })).toBeNull()
    await user.click(btn('Hang it'))
    await waitFor(() => expect(fake.calls.find((c) => c.op === 'set')?.data).toMatchObject({ status: 'wish', priority: 3, budget: '30', moreCopies: [] }))
    expect(fake.calls.find((c) => c.op === 'set')?.data).not.toHaveProperty('discogsId')
  })
})

describe('the hunt in view mode', () => {
  it('shows the copies under the why, and the priority on the badge', async () => {
    const { user } = setup()
    await open(user, 'Abbey Road')
    const g = screen.getByRole('group', { name: 'The copies you want' })
    expect(within(g).getByRole('button', { name: 'UK first Up to $150' })).toBeTruthy()
    await user.click(within(g).getByRole('button', { name: /^Half-speed reissue/ }))
    expect(within(g).getByText('2019 half-speed')).toBeTruthy()
    expect(screen.getByText('Top want', { selector: '[data-slot=badge]' })).toBeTruthy()
  })

  it('shows a lone copy as a card, and nothing for a looked-up label alone', async () => {
    const { user } = setup({}, {
      r8: { title: 'Revolver', artist: 'The Beatles', status: 'wish', label: 'Parlophone', catalog: 'PMC 7009', budget: '80', notes: [], added: 8 },
      r9: { title: 'Help!', artist: 'The Beatles', status: 'wish', label: 'Parlophone', autoFilled: ['label'], notes: [], added: 9 },
    })
    await open(user, 'Revolver')
    const g = screen.getByRole('group', { name: 'The copy you want' })
    expect(within(g).getByText('Parlophone')).toBeTruthy()
    expect(within(g).getByText('Up to $80')).toBeTruthy()
    await user.keyboard('{Escape}')
    await open(user, 'Help!')
    expect(screen.queryByRole('group', { name: /The copy/ })).toBeNull()
  })

  it('Got it on a hunt with two copies asks which, then what was paid', async () => {
    const { fake, user } = setup()
    await open(user, 'Abbey Road')
    await user.click(btn('Got it'))
    expect(screen.getByText(/Which copy did you get\?/)).toBeTruthy()
    await user.click(btn(/Got: Half-speed reissue/))
    await user.type(screen.getByRole('textbox', { name: 'Paid' }), '38')
    await user.click(btn('Save'))
    await waitFor(() =>
      expect(updates(fake, 'r7').at(-1)).toMatchObject({
        status: 'own', copyName: 'Half-speed reissue', pressing: '2019 half-speed', label: 'Apple', budget: '40', paid: '38',
        moreCopies: [{ name: 'UK first', pressing: 'UK first pressing', label: '', catalog: '', budget: '150', discogsId: '' }],
      }),
    )
  })

  it('Cancel on the picker moves nothing', async () => {
    const { fake, user } = setup()
    await open(user, 'Abbey Road')
    await user.click(btn('Ordered it'))
    expect(btn(/Ordered: UK first/)).toBeTruthy()
    await user.click(btn('Cancel'))
    expect(btn('Ordered it')).toBeTruthy()
    expect(updates(fake, 'r7')).toEqual([])
  })

  it("edit mode's status asks which copy, keeping the status until one is picked", async () => {
    const { fake, user } = setup()
    await open(user, 'Abbey Road')
    await user.click(btn('Edit'))
    await user.click(btn('Ordered'))
    expect(screen.getByRole('button', { name: 'Wanted', pressed: true })).toBeTruthy()
    await user.click(btn(/Ordered: UK first/))
    await waitFor(() => expect(updates(fake, 'r7').at(-1)).toMatchObject({ status: 'ordered', copyName: 'UK first', budget: '150' }))
    expect(screen.queryByText(/What did you pay/)).toBeNull()
  })
})

const researched = {
  r8: {
    title: 'Revolver', artist: 'The Beatles', status: 'wish', copyName: 'UK mono', pressing: 'UK mono first', budget: '300', notes: [], added: 8,
    researchLog: [
      {
        id: 'a1', at: '2026-10-01', question: 'Which pressing?', headline: 'Mono is the one to get.', summary: 'Mono first pressings sound best.',
        pressings: ['UK mono first: the original', 'Japan Odeon: quiet vinyl'], check: ['Matrix XEX 605-1'], price: 'About $300.',
        sources: [{ title: 'Discogs', url: 'https://www.discogs.com/x' }, { title: 'Bad', url: 'javascript:alert(1)' }],
      },
      { id: 'b2', at: '2026-09-01', summary: 'Older look. Second sentence.', pinned: true },
    ],
  },
  r9: { title: 'Help!', artist: 'The Beatles', status: 'own', notes: [], added: 9 },
}

describe('the Research tab', () => {
  it('opens first on a hunt, pinned entry first and open, with sources that link', async () => {
    const { user } = setup({}, researched)
    await open(user, 'Revolver')
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Research', 'Notes'])
    const rows = screen.getAllByRole('button', { name: /Mono is the one|Older look/ })
    expect(rows.map((b) => b.getAttribute('aria-expanded'))).toEqual(['true', 'false'])
    expect(rows[0].textContent).toMatch(/Pinned/)
    await user.click(rows[1])
    expect(screen.getByText('Which pressing?')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Discogs ↗' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Bad ↗' })).toBeNull()
    expect(screen.getByRole('link', { name: 'eBay ↗' }).getAttribute('href')).toContain('The%20Beatles%20Revolver%20vinyl%20LP')
  })

  it('+ Want adds a pressing as a copy, says so with Undo, and marks one already wanted', async () => {
    const { fake, user } = setup({}, researched)
    await open(user, 'Revolver')
    await user.click(screen.getByRole('button', { name: /Mono is the one/ }))
    expect(screen.getByText('✓ Added')).toBeTruthy()
    await user.click(btn('+ Want'))
    await waitFor(() =>
      expect(updates(fake, 'r8').at(-1)).toEqual({
        moreCopies: [{ name: '', pressing: 'Japan Odeon', label: '', catalog: '', budget: '', discogsId: '' }], needsSync: true,
      }),
    )
    expect(screen.getByText(/Added “Japan Odeon”/)).toBeTruthy()
    await user.click(btn('Undo'))
    await waitFor(() => expect(updates(fake, 'r8').at(-1)).toEqual({ moreCopies: [], needsSync: true }))
  })

  it("+ Want's Edit opens edit mode in that copy", async () => {
    const { user } = setup({}, researched)
    await open(user, 'Revolver')
    await user.click(screen.getByRole('button', { name: /Mono is the one/ }))
    await user.click(btn('+ Want'))
    // the header's Edit, then the one beside what was added
    await screen.findByText(/Added “Japan Odeon”/)
    await user.click(screen.getAllByRole('button', { name: 'Edit' }).at(-1)!)
    const names = within(screen.getByRole('group', { name: 'The copies you want' })).getAllByRole('textbox', { name: 'Name' })
    expect(document.activeElement).toBe(names[1])
  })

  it('pins one entry at a time, and removes one after asking', async () => {
    const { fake, user } = setup({}, researched)
    await open(user, 'Revolver')
    await user.click(screen.getByRole('button', { name: /Mono is the one/ }))
    await user.click(btn('Pin'))
    await waitFor(() => expect(updates(fake, 'r8').at(-1)?.research).toBeNull())
    const log = updates(fake, 'r8').at(-1)!.researchLog as { id: string; pinned?: boolean }[]
    expect(log.map((e) => [e.id, !!e.pinned])).toEqual([['a1', true], ['b2', false]])
    await user.click(screen.getAllByRole('button', { name: 'Remove this research' })[0])
    await user.click(await screen.findByRole('button', { name: 'Remove' }))
    await waitFor(() => expect((updates(fake, 'r8').at(-1)!.researchLog as { id: string }[]).map((e) => e.id)).toEqual(['b2']))
  })

  it('Copy for Claude hands over a prompt naming the record', async () => {
    const { user } = setup({}, researched)
    await open(user, 'Revolver')
    await user.click(btn('Copy for Claude'))
    expect(await navigator.clipboard.readText()).toContain('Record: "Revolver" by The Beatles (record r8)')
    expect(screen.getByText('Copied. Paste it into Claude and add your question.')).toBeTruthy()
  })

  it('shows a reader the research and links, without the buttons', async () => {
    const { user } = setup({ canWrite: false }, researched)
    await open(user, 'Revolver')
    await user.click(screen.getByRole('button', { name: /Mono is the one/ }))
    for (const name of ['Copy for Claude', '+ Want', 'Pin', 'Unpin', 'Remove this research', 'Follow up in chat'])
      expect(screen.queryByRole('button', { name })).toBeNull()
    expect(screen.getByRole('link', { name: 'Discogs marketplace ↗' })).toBeTruthy()
  })

  it('keeps shopping links off an owned record unless it still wants a copy', async () => {
    const { user } = setup({}, researched)
    await open(user, 'Help!')
    await user.click(screen.getByRole('tab', { name: 'Research' }))
    expect(btn('Copy for Claude')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'eBay ↗' })).toBeNull()
    await user.keyboard('{Escape}')
    await open(user, 'Aja')
    expect(screen.queryByRole('tab', { name: 'Research' })).toBeNull()
  })
})
