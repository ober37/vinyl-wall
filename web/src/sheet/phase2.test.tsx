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
