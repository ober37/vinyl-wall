import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { exportFile, libNorm, planImport } from '../model/library'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'

type Opts = Parameters<typeof fakeClaude>[1]
type U = ReturnType<typeof userEvent.setup>
function setup(opts: Opts = {}, empty = false, assets: string[] = []) {
  const seed = { ...sample(), assets }
  if (empty) seed.records = {}
  for (const r of Object.values(seed.records))
    Object.assign(r, { coverAsset: 'c', runtime: r.runtime || 40, aboutAt: 1, aboutV: 3, about: { ...(r.about as object), summary: 's' } })
  seed.docs['settings/site'] = { taskId: 't1', title: 'Den', hang: 'cork', update: { checkedMs: Date.now() } }
  const fake = fakeClaude(seed, opts)
  render(
    <RuntimeProvider claude={fake.claude}>
      <App />
    </RuntimeProvider>,
  )
  return { fake, user: userEvent.setup() }
}
const openSettings = async (user: U) => {
  await user.click(await screen.findByRole('button', { name: 'Settings' }))
  return screen.findByRole('dialog', { name: 'Settings' })
}
const fileOf = (o: unknown, name = 'vinyl-wall-2026-10-01.json') => new File([JSON.stringify(o)], name, { type: 'application/json' })
const choose = async (user: U, f: File) => user.upload(document.querySelector<HTMLInputElement>('input[type=file][accept=".json,application/json"]')!, f)
const toImport = async (user: U) => {
  const sheet = await openSettings(user)
  await user.click(within(sheet).getByRole('button', { name: 'Import from a file' }))
  return screen.findByRole('dialog', { name: 'Import your library' })
}
const library = {
  vinylWall: 1,
  settings: { site: { title: 'Back Room', hang: 'peg', bg: { kind: 'preset', preset: 'walnut' } } },
  records: {
    x1: { title: 'Rumours', artist: 'Fleetwood Mac', status: 'own', coverAsset: 'k1', notes: [{ d: '2026-01-01', t: 'Got it' }], discogsSync: { rid: 9 }, taskId: 'no' },
    x2: { title: 'Revolver', artist: 'The Beatles', status: 'wish', coverAsset: 'gone' },
    x3: { title: 'KIND OF BLUE', artist: 'Miles Davis', status: 'own' },
  },
  gear: { g1: { type: 'stylus', name: 'VM95E', minutes: 30 } },
}
afterEach(() => vi.unstubAllGlobals())

describe('Export your library', () => {
  it('saves the records, gear and look with their covers, never deleted ones', async () => {
    vi.stubGlobal('fetch', async () => new Response(new Blob(['img'], { type: 'image/jpeg' })))
    const { fake, user } = setup()
    fake.store.records.gone = { title: 'Old', artist: 'X', deleted: true }
    const sheet = await openSettings(user)
    await user.click(within(sheet).getByRole('button', { name: 'Export your library' }))
    await waitFor(() => expect(within(sheet).getByText('Saved 5 records.')).toBeTruthy())
    const f = JSON.parse(fake.saved[0].data as string)
    expect(fake.saved[0].filename).toMatch(/^vinyl-wall-\d{4}-\d\d-\d\d\.json$/)
    expect(f.vinylWall).toBe(1)
    expect(Object.keys(f.records).sort()).toEqual(['r1', 'r3', 'r5', 'r6', 'r7'])
    expect(f.settings.site).toEqual({ title: 'Den', hang: 'cork' })
    expect(f.covers.c).toMatch(/^data:image\/jpeg;base64,/)
    expect(JSON.stringify(f)).not.toContain('taskId')
  })

  it('says nothing when the save is cancelled, and is not offered where files cannot be saved', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }))
    const { user } = setup({ downloads: 'decline' })
    const sheet = await openSettings(user)
    await user.click(within(sheet).getByRole('button', { name: 'Export your library' }))
    await waitFor(() => expect(within(sheet).getByRole('button', { name: 'Export your library' })).toHaveProperty('disabled', false))
    expect(within(sheet).queryByText(/Saved|Couldn't/)).toBeNull()
  })

  it('is hidden without downloads', async () => {
    const { user } = setup({ downloads: 'none' })
    const sheet = await openSettings(user)
    expect(within(sheet).queryByRole('button', { name: 'Export your library' })).toBeNull()
    expect(within(sheet).getByRole('button', { name: 'Import from a file' })).toBeTruthy()
  })
})

describe('Import from a file', () => {
  it('shows what a file adds, skips what is on the wall, and brings the rest in', async () => {
    const { fake, user } = setup({}, false, ['k1'])
    const view = await toImport(user)
    await choose(user, fileOf(library))
    expect(await within(view).findByText('Adds 2 records and 1 piece of equipment. 1 record is already on the wall and will be skipped.')).toBeTruthy()
    expect(within(view).getByText('vinyl-wall-2026-10-01.json')).toBeTruthy()
    await user.click(within(view).getByRole('button', { name: 'Bring them in' }))
    expect(await within(view).findByText(/^Brought in 2 records and 1 piece of equipment\. We'll look up covers or album info for them/)).toBeTruthy()
    const x1 = fake.store.records.x1
    // its cover is held here, so it stays; nothing of another wall's sync comes along
    expect(x1.coverAsset).toBe('k1')
    // checked against this wall's Discogs quietly, not shown as an edit waiting to sync
    expect(x1.needsSync).toBe('check')
    expect(x1).not.toHaveProperty('discogsSync')
    expect(x1).not.toHaveProperty('taskId')
    expect(fake.store.records.x2).toMatchObject({ needsEnrich: true, notes: [] })
    expect(fake.store.records.x2).not.toHaveProperty('coverAsset')
    expect(fake.store.gear.g1).toMatchObject({ name: 'VM95E' })
    // an existing wall keeps its own look
    expect(fake.store.settings.site.title).toBe('Den')
    await user.click(within(view).getByRole('button', { name: 'See your wall' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it("says when a file isn't a library, or adds nothing", async () => {
    const { user } = setup()
    const view = await toImport(user)
    await choose(user, fileOf({ hello: 1 }, 'notes.json'))
    expect(await within(view).findByText("This file wasn't made by Export on a Vinyl Wall.")).toBeTruthy()
    expect(within(view).getByRole('button', { name: 'Choose a file' })).toBeTruthy()
    await choose(user, fileOf({ vinylWall: 2, records: {} }))
    expect(await within(view).findByText(/made by a newer Vinyl Wall/)).toBeTruthy()
    await choose(user, fileOf({ vinylWall: 1, records: { y: { title: 'Kind of Blue', artist: 'Miles Davis' } } }))
    expect(await within(view).findByText('Everything in this file is already on the wall.')).toBeTruthy()
  })

  it('gives an empty wall the file’s look too', async () => {
    const { fake, user } = setup({}, true)
    const view = await toImport(user)
    await choose(user, fileOf(library))
    await user.click(await within(view).findByRole('button', { name: 'Bring them in' }))
    await within(view).findByText(/^Brought in 3 records/)
    expect(fake.store.settings.site).toMatchObject({ title: 'Back Room', hang: 'peg', bg: { kind: 'preset', preset: 'walnut' } })
  })

  it('throws away a plan when you go back', async () => {
    const { user } = setup()
    const view = await toImport(user)
    await choose(user, fileOf(library))
    await within(view).findByRole('button', { name: 'Bring them in' })
    await user.click(within(view).getByRole('button', { name: '‹ Settings' }))
    const sheet = await screen.findByRole('dialog', { name: 'Settings' })
    await user.click(within(sheet).getByRole('button', { name: 'Import from a file' }))
    const again = await screen.findByRole('dialog', { name: 'Import your library' })
    expect(within(again).getByRole('button', { name: 'Choose a file' })).toBeTruthy()
    expect(within(again).queryByRole('button', { name: 'Bring them in' })).toBeNull()
  })

  it('offers Try again with the same file when it stops part-way', async () => {
    const { user } = setup({ failWrites: true })
    const view = await toImport(user)
    await choose(user, fileOf(library))
    await user.click(await within(view).findByRole('button', { name: 'Bring them in' }))
    expect(await within(view).findByText(/^Stopped after 0 of 2 records: Not allowed\./)).toBeTruthy()
    await user.click(within(view).getByRole('button', { name: 'Try again' }))
    expect(await within(view).findByRole('button', { name: 'Bring them in' })).toBeTruthy()
  })

  it('is offered from the welcome card of an empty wall', async () => {
    const { user } = setup({}, true)
    await user.click(await screen.findByRole('button', { name: 'Import from a file' }))
    expect(await screen.findByRole('dialog', { name: 'Import your library' })).toBeTruthy()
  })
})

describe('the library file', () => {
  it('matches records as production does, and an export comes back in whole', () => {
    expect(libNorm('The Beatles & Friends (2)*')).toBe(libNorm('beatles and friends'))
    const s = sample()
    const recs = Object.entries(s.records).map(([id, r]) => ({ ...r, id }))
    const f = exportFile({ records: recs, gear: [], setups: [], artists: [], settings: {}, app: '1.0.0' })
    const p = planImport(JSON.stringify(f), { records: [], artists: [], gear: [], setups: [] })
    expect(typeof p === 'string' ? p : p.recs.map(([id]) => id).sort()).toEqual(Object.keys(s.records).sort())
  })
})
