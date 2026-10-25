import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../App'
import { Boundary } from '../Boundary'
import { today } from '../model/record'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'

function setup(opts: Parameters<typeof fakeClaude>[1] = {}) {
  const fake = fakeClaude(sample(), opts)
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
const lastUpdate = (fake: ReturnType<typeof fakeClaude>) => fake.calls[fake.calls.length - 1]
const notes = (fake: ReturnType<typeof fakeClaude>, id: string) => fake.records[id].notes as { d: string; t: string }[]

// every record kind in every sheet mode renders without the crash fallback (the slice-1 crash was a wanted record)
describe.each([
  ['Kind of Blue', 'own'],
  ['Blue Train', 'own, no notes'],
  ['Aja', 'ordered'],
  ['Pet Sounds', 'wanted'],
  ['Abbey Road', 'wanted, two copies'],
])('%s (%s)', (title) => {
  it('renders every tab and edit mode', async () => {
    const { user } = setup()
    await open(user, title)
    for (const tab of screen.queryAllByRole('tab')) {
      await user.click(tab)
      expect(screen.queryByRole('alert')).toBeNull()
    }
    await user.click(btn('Edit'))
    expect(screen.getByRole('textbox', { name: 'Why' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows a reader no controls', async () => {
    const { user } = setup({ canWrite: false })
    await open(user, title)
    for (const name of ['Edit', 'Log play', 'Add note', 'Ordered it', 'Got it', 'It arrived', /Add a few words/])
      expect(screen.queryByRole('button', { name })).toBeNull()
  })
})

describe('status', () => {
  it('Got it asks what was paid, then moves the hunt to the wall', async () => {
    const { fake, user } = setup()
    await open(user, 'Pet Sounds')
    await user.click(btn('Got it'))
    await user.type(screen.getByRole('textbox', { name: 'Paid' }), '$48')
    await user.type(screen.getByRole('textbox', { name: 'Bought from' }), 'Amoeba')
    await user.click(btn('Save'))
    await screen.findByText('Moved to the wall. Acquired today.')
    const { data } = lastUpdate(fake)
    expect(data).toMatchObject({ status: 'own', acquired: today(), paid: '48', shop: 'Amoeba', needsSync: true })
    expect(notes(fake, 'r6').at(-1)).toEqual({ d: today(), t: 'Found it · $48 from Amoeba' })
  })

  it('Cancel leaves the record as it was', async () => {
    const { fake, user } = setup()
    await open(user, 'Pet Sounds')
    await user.click(btn('Ordered it'))
    await user.click(btn('Cancel'))
    expect(fake.calls).toEqual([])
    expect(btn('Ordered it')).toBeTruthy()
  })

  it('It arrived hangs an order on the wall', async () => {
    const { fake, user } = setup()
    await open(user, 'Aja')
    await user.click(btn('It arrived'))
    await waitFor(() => expect(fake.records.r5.status).toBe('own'))
    expect(fake.records.r5).toMatchObject({ orderStatus: 'delivered', acquired: today() })
    expect(notes(fake, 'r5').at(-1)).toEqual({ d: today(), t: 'Arrived from Rough Trade. Hung it on the wall.' })
  })

  it('edit mode moves without asking what was paid', async () => {
    const { fake, user } = setup()
    await open(user, 'Blue Train')
    await user.click(btn('Edit'))
    await user.click(screen.getByRole('button', { name: 'Ordered' }))
    await waitFor(() => expect(fake.records.r3.status).toBe('ordered'))
    expect(fake.records.r3).toMatchObject({ orderStatus: 'ordered', orderDate: today(), needsSync: true })
    expect(notes(fake, 'r3').at(-1)).toEqual({ d: today(), t: 'Ordered.' })
  })
})

describe('plays', () => {
  it('logs a whole album, opens its journal, and Undo takes it back', async () => {
    const { fake, user } = setup()
    await open(user, 'Blue Train')
    await user.click(btn('Log play'))
    await waitFor(() => expect(notes(fake, 'r3')).toHaveLength(1))
    expect(notes(fake, 'r3')[0]).toEqual({ d: today(), t: 'Played the whole album (~42 min)' })
    expect(lastUpdate(fake).data).not.toHaveProperty('needsSync')
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(notes(fake, 'r3')).toHaveLength(0))
  })

  it('a second play the same day opens only its own journal', async () => {
    const { fake, user } = setup()
    await open(user, 'Blue Train')
    await user.click(btn('Log play'))
    await user.click(await screen.findByRole('button', { name: 'Skip' }))
    expect(screen.queryByRole('textbox', { name: 'Your thoughts' })).toBeNull()
    await user.click(btn('Log play'))
    await waitFor(() => expect(notes(fake, 'r3')).toHaveLength(2))
    await screen.findByRole('button', { name: 'Undo' })
    expect(screen.getAllByRole('textbox', { name: 'Your thoughts' })).toHaveLength(1)
    await user.click(btn('Undo'))
    await waitFor(() => expect(notes(fake, 'r3')).toHaveLength(1))
    expect(screen.queryByRole('textbox', { name: 'Your thoughts' })).toBeNull()
  })

  it('logs a side and saves thoughts on it', async () => {
    const { fake, user } = setup()
    await open(user, 'Blue Train')
    await user.click(screen.getByRole('button', { name: 'Side' }))
    await user.click(screen.getByRole('button', { name: 'Side B' }))
    await user.click(btn('Log play'))
    await user.type(await screen.findByRole('textbox', { name: 'Your thoughts' }), 'Great')
    await user.click(btn('Set the vibe'))
    expect(screen.getByText('Locked in')).toBeTruthy()
    await user.click(btn('Save'))
    await waitFor(() => expect(notes(fake, 'r3')[0]).toMatchObject({ t: 'Played one side (~21 min)', side: 'B', j: 'Great', vibe: 3 }))
  })

  it('logs picked tracks, collapsing a whole side to that side', async () => {
    const { fake, user } = setup()
    await open(user, 'Kind of Blue')
    await user.click(screen.getByRole('button', { name: 'Tracks' }))
    expect(btn('Pick tracks')).toHaveProperty('disabled', true)
    await user.click(screen.getByRole('checkbox', { name: /Freddie Freeloader/ }))
    await user.click(screen.getByRole('checkbox', { name: /Blue in Green/ }))
    await user.click(btn('Log 2 tracks'))
    await waitFor(() => expect(notes(fake, 'r1').at(-1)).toMatchObject({ t: 'Played one side (~23 min)', side: 'B' }))
  })
})

describe('notes', () => {
  it("adds a note on top of one written elsewhere that this view hasn't seen", async () => {
    const { fake, user } = setup()
    await open(user, 'Pet Sounds')
    fake.remote('r6', { notes: [{ d: '2026-01-01', t: 'From my phone' }] }, true)
    await user.click(screen.getByRole('tab', { name: /Notes/ }))
    await user.type(screen.getByRole('textbox', { name: 'Note' }), 'Checked Amoeba')
    await user.click(btn('Add note'))
    await waitFor(() => expect(notes(fake, 'r6').map((n) => n.t)).toEqual(['From my phone', 'Checked Amoeba']))
  })

  it('edits and deletes a note, with links clickable', async () => {
    const { fake, user } = setup()
    await open(user, 'Kind of Blue')
    await user.click(screen.getByRole('tab', { name: /Notes/ }))
    await user.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: 'Edit' }))
    const box = screen.getByRole('textbox', { name: 'Edit note' })
    await user.clear(box)
    await user.type(box, 'See https://example.com/x.')
    await user.click(btn('Save'))
    expect((await screen.findByRole('link', { name: 'example.com/x' })).getAttribute('href')).toBe('https://example.com/x')
    await user.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: 'Edit' }))
    await user.click(btn('Delete'))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(notes(fake, 'r1').some((n) => n.t.startsWith('See'))).toBe(false))
    expect(notes(fake, 'r1').filter((n) => n.t.startsWith('Played'))).toHaveLength(3)
  })
})

describe('remove', () => {
  it('marks a Discogs-synced record deleted, so the task can take it off Discogs', async () => {
    const { fake, user } = setup()
    await open(user, 'Pet Sounds')
    await user.click(btn('Edit'))
    await user.click(btn('Remove from the wall…'))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(lastUpdate(fake)).toEqual({ path: 'records/r6', op: 'update', data: { deleted: true, needsSync: true } }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Open Pet Sounds/ })).toBeNull())
  })

  it("deletes any other record, and a half-typed edit isn't written after", async () => {
    const { fake, user } = setup()
    await open(user, 'Blue Train')
    await user.click(btn('Edit'))
    await user.type(screen.getByRole('textbox', { name: 'Why' }), 'x')
    await user.click(btn('Remove from the wall…'))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(fake.calls).toEqual([{ path: 'records/r3', op: 'delete' }]))
    await new Promise((r) => setTimeout(r, 900))
    expect(fake.calls).toHaveLength(1)
  })
})

it('the empty-Why prompt opens edit mode with Why focused', async () => {
  const { user } = setup()
  await open(user, 'Blue Train')
  await user.click(btn(/Why is this one on the wall/))
  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Why' }))
})

it('a crash shows an alert instead of a blank page', () => {
  const Boom = () => {
    throw new Error('boom')
  }
  const err = console.error
  console.error = () => {}
  render(
    <Boundary title="Couldn't show this record">
      <Boom />
    </Boundary>,
  )
  console.error = err
  expect(screen.getByRole('alert').textContent).toContain('boom')
})
