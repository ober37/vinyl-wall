import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../App'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'

type Opts = Parameters<typeof fakeClaude>[1]
function setup(opts: Opts = {}) {
  const seed = sample()
  seed.docs['settings/site'] = { taskId: 't1', update: { checkedMs: Date.now() } }
  // the samples already looked up, so only what a test adds starts the task
  for (const r of Object.values(seed.records))
    Object.assign(r, { coverAsset: 'c', runtime: r.runtime || 40, aboutAt: 1, aboutV: 3, about: { ...(r.about as object), summary: 's' } })
  const fake = fakeClaude(seed, opts)
  render(
    <RuntimeProvider claude={fake.claude}>
      <App />
    </RuntimeProvider>,
  )
  return { fake, user: userEvent.setup() }
}
type U = ReturnType<typeof userEvent.setup>
const sets = (fake: ReturnType<typeof fakeClaude>) => fake.calls.filter((c) => c.op === 'set' && c.path.startsWith('records/'))
const fires = (fake: ReturnType<typeof fakeClaude>) => fake.calls.filter((c) => c.op === 'fire')
async function startAdding(user: U, title = 'Rumours', artist = 'Fleetwood Mac') {
  await user.click(await screen.findByRole('button', { name: 'Add a record' }))
  const sheet = await screen.findByRole('dialog')
  await user.type(within(sheet).getByRole('textbox', { name: 'Album' }), title)
  await user.type(within(sheet).getByRole('textbox', { name: 'Artist' }), artist)
  return sheet
}
afterEach(() => localStorage.clear())

describe.each([
  ['I own it', 'own', 'Owned'],
  ['On order', 'ordered', 'Ordered'],
  ['I want it', 'wish', 'Want'],
])('adding a record: %s', (choice, status, badge) => {
  it('hangs it, starts the lookup and opens it', async () => {
    const { fake, user } = setup()
    const sheet = await startAdding(user)
    expect(within(sheet).getByRole('button', { name: 'Hang it' })).toHaveProperty('disabled', true)
    await user.click(within(sheet).getByRole('button', { name: choice }))
    await user.click(within(sheet).getByRole('button', { name: 'Hang it' }))
    await waitFor(() => expect(sets(fake)).toHaveLength(1))
    expect(sets(fake)[0].data).toMatchObject({ title: 'Rumours', artist: 'Fleetwood Mac', status, notes: [], priority: 2, needsEnrich: true })
    expect(sets(fake)[0].data).not.toHaveProperty('needsSync')
    await waitFor(() => expect(fires(fake)).toHaveLength(1))
    expect(fires(fake)[0].data!.text).toContain('look up covers, details and album info (Part L) for 1 record')
    expect(await screen.findByRole('heading', { name: 'Rumours' })).toBeTruthy()
    expect(screen.getByText(badge, { selector: '[data-slot=badge]' })).toBeTruthy()
    expect(screen.getByText('Looking up the cover and details…')).toBeTruthy()
    // the wall sits behind the open sheet, out of the accessibility tree until it closes
    expect(screen.getByRole('button', { name: /^Open Rumours by Fleetwood Mac.*, syncing$/, hidden: true })).toBeTruthy()
  })
})

describe('the new-record sheet', () => {
  it('needs an album and an artist', async () => {
    const { fake, user } = setup()
    const sheet = await startAdding(user, 'Rumours', ' ')
    await user.click(within(sheet).getByRole('button', { name: 'I own it' }))
    await user.click(within(sheet).getByRole('button', { name: 'Hang it' }))
    expect(within(sheet).getByText('Album and artist are needed.')).toBeTruthy()
    expect(sets(fake)).toHaveLength(0)
  })

  it('keeps what was typed when the kind changes', async () => {
    const { user } = setup()
    const sheet = await startAdding(user)
    await user.click(within(sheet).getByRole('button', { name: 'I own it' }))
    await user.click(within(sheet).getByRole('button', { name: 'Add details now' }))
    await user.type(within(sheet).getByRole('textbox', { name: 'Why' }), 'The breakup album')
    await user.click(within(sheet).getByRole('button', { name: 'I want it' }))
    expect((within(sheet).getByRole('textbox', { name: 'Why' }) as HTMLTextAreaElement).value).toBe('The breakup album')
  })

  it('hangs it with Enter in the artist field', async () => {
    const { fake, user } = setup()
    const sheet = await startAdding(user)
    await user.click(within(sheet).getByRole('button', { name: 'I own it' }))
    await user.type(within(sheet).getByRole('textbox', { name: 'Artist' }), '{Enter}')
    await waitFor(() => expect(sets(fake)).toHaveLength(1))
  })

  it('hangs it once however fast you click', async () => {
    const { fake, user } = setup()
    const sheet = await startAdding(user)
    await user.click(within(sheet).getByRole('button', { name: 'I own it' }))
    const hang = within(sheet).getByRole('button', { name: 'Hang it' })
    await Promise.all([user.click(hang), user.click(hang)])
    await screen.findByRole('heading', { name: 'Rumours' })
    expect(sets(fake)).toHaveLength(1)
  })

  it('keeps the draft after a failed write, and the retry uses the same id', async () => {
    const { fake, user } = setup({ failCreate: true })
    const sheet = await startAdding(user)
    await user.click(within(sheet).getByRole('button', { name: 'I own it' }))
    await user.click(within(sheet).getByRole('button', { name: 'Hang it' }))
    expect(await within(sheet).findByText(/Couldn't add it/)).toBeTruthy()
    expect((within(sheet).getByRole('textbox', { name: 'Album' }) as HTMLInputElement).value).toBe('Rumours')
    await user.click(within(sheet).getByRole('button', { name: 'Hang it' }))
    await screen.findByRole('heading', { name: 'Rumours' })
    const ids = Object.keys(fake.records).filter((k) => fake.records[k].title === 'Rumours')
    expect(ids).toHaveLength(1)
  })

  it('opens the one just added instead of hanging the same album again', async () => {
    const { fake, user } = setup()
    fake.remote('r3', { added: Date.now() })
    const sheet = await startAdding(user, 'blue train', 'JOHN COLTRANE')
    await user.click(within(sheet).getByRole('button', { name: 'I own it' }))
    await user.click(within(sheet).getByRole('button', { name: 'Hang it' }))
    expect(await screen.findByRole('heading', { name: 'Blue Train' })).toBeTruthy()
    expect(sets(fake)).toHaveLength(0)
  })

  it('hangs an uploaded cover with the record, with no lookup when the details are there too', async () => {
    const { fake, user } = setup()
    const sheet = await startAdding(user)
    await user.click(within(sheet).getByRole('button', { name: 'I own it' }))
    await user.click(within(sheet).getByRole('button', { name: 'Add details now' }))
    await user.type(within(sheet).getByRole('textbox', { name: 'Year' }), '1977')
    await user.type(within(sheet).getByRole('textbox', { name: 'Label' }), 'Warner Bros.')
    await user.upload(within(sheet).getByLabelText('Upload cover'), new File(['x'], 'cover.png', { type: 'image/png' }))
    expect(await within(sheet).findByText("Cover ready. It'll hang with the record.")).toBeTruthy()
    await user.click(within(sheet).getByRole('button', { name: 'Hang it' }))
    await waitFor(() => expect(sets(fake)).toHaveLength(1))
    expect(sets(fake)[0].data).toMatchObject({ coverAsset: expect.stringMatching(/^a_/), year: '1977', label: 'Warner Bros.' })
    expect(sets(fake)[0].data).not.toHaveProperty('needsEnrich')
    // no cover lookup asked for (album info still gets looked up on its own, as in production)
    expect(await screen.findByText('Looking up the album…')).toBeTruthy()
    expect(screen.queryByText('Looking up the cover and details…')).toBeNull()
  })

  it("doesn't carry an abandoned cover into the next record", async () => {
    const { fake, user } = setup()
    let sheet = await startAdding(user)
    await user.click(within(sheet).getByRole('button', { name: 'I own it' }))
    await user.click(within(sheet).getByRole('button', { name: 'Add details now' }))
    await user.upload(within(sheet).getByLabelText('Upload cover'), new File(['x'], 'cover.png', { type: 'image/png' }))
    await within(sheet).findByText("Cover ready. It'll hang with the record.")
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    sheet = await startAdding(user, 'Tusk')
    await user.click(within(sheet).getByRole('button', { name: 'I own it' }))
    await user.click(within(sheet).getByRole('button', { name: 'Hang it' }))
    await waitFor(() => expect(sets(fake)).toHaveLength(1))
    expect(sets(fake)[0].data).not.toHaveProperty('coverAsset')
  })

  it("offers no upload where this view can't store files", async () => {
    const { user } = setup({ assets: 'none' })
    const sheet = await startAdding(user)
    await user.click(within(sheet).getByRole('button', { name: 'I own it' }))
    await user.click(within(sheet).getByRole('button', { name: 'Add details now' }))
    expect(within(sheet).queryByLabelText('Upload cover')).toBeNull()
  })

  it('is only for editors, and an empty wall says how to start', async () => {
    const seed = sample()
    seed.records = {}
    render(
      <RuntimeProvider claude={fakeClaude(seed, { canWrite: false }).claude}>
        <App />
      </RuntimeProvider>,
    )
    expect(await screen.findByText('Nothing hanging yet.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add a record' })).toBeNull()
  })
})

describe('edit mode', () => {
  it('replaces the cover and stops waiting for one', async () => {
    const { fake, user } = setup()
    await user.click(await screen.findByRole('button', { name: /Open Blue Train/ }))
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.upload(screen.getByLabelText('Replace cover'), new File(['x'], 'c.png', { type: 'image/png' }))
    await waitFor(() => expect(fake.records.r3.coverAsset).toMatch(/^a_/))
    expect(fake.records.r3.needsEnrich).toBe(false)
    expect(await screen.findByText('Saved')).toBeTruthy()
  })

  it('says why an upload failed', async () => {
    const { user } = setup({ assets: 'fail' })
    await user.click(await screen.findByRole('button', { name: /Open Blue Train/ }))
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.upload(screen.getByLabelText('Replace cover'), new File(['x'], 'c.png', { type: 'image/png' }))
    expect(await screen.findByText('Upload failed: That image is too big to store. Try a smaller one.')).toBeTruthy()
  })

  it('Not this artist drops the matched artist and album info', async () => {
    const { fake, user } = setup()
    await user.click(await screen.findByRole('button', { name: /Open Kind of Blue/ }))
    // the sheet's own Edit comes first (play rows have Edit buttons too)
    await user.click((await screen.findAllByRole('button', { name: 'Edit' }))[0])
    await user.click(screen.getByRole('button', { name: 'Not this artist' }))
    await waitFor(() => expect(fake.records.r1).toMatchObject({ artistRef: '', about: null, aboutBlocked: true }))
    expect(screen.queryByRole('button', { name: 'Not this artist' })).toBeNull()
  })

  it('Look up album & artist info again takes back Not this artist (#63)', async () => {
    const { fake, user } = setup()
    await user.click(await screen.findByRole('button', { name: /Open Kind of Blue/ }))
    await user.click((await screen.findAllByRole('button', { name: 'Edit' }))[0])
    expect(screen.queryByRole('button', { name: 'Look up album & artist info again' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Not this artist' }))
    await user.click(await screen.findByRole('button', { name: 'Look up album & artist info again' }))
    await waitFor(() => expect(fake.records.r1).toMatchObject({ aboutBlocked: false, needsEnrich: true, aboutAt: '', aboutV: 0 }))
    expect(fires(fake).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Look up album & artist info again' })).toBeNull()
  })

  it('Remove cover asks, goes back to the sleeve, and keeps an image another record shows (#62)', async () => {
    const { fake, user } = setup()
    await user.click(await screen.findByRole('button', { name: /Open Kind of Blue/ }))
    await user.click((await screen.findAllByRole('button', { name: 'Edit' }))[0])
    await user.click(screen.getByRole('button', { name: 'Remove cover' }))
    expect(await screen.findByRole('alertdialog', { name: 'Remove this cover? The record goes back to its plain sleeve.' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(fake.records.r1).toMatchObject({ coverAsset: '', coverBlocked: true }))
    expect(fake.calls.some((c) => c.op === 'delete' && c.path.startsWith('assets/'))).toBe(false)
    expect(screen.queryByRole('button', { name: 'Remove cover' })).toBeNull()
    // Find cover & details brings one back
    await user.click(screen.getByRole('button', { name: 'Find cover & details' }))
    await waitFor(() => expect(fake.records.r1).toMatchObject({ coverBlocked: false, needsEnrich: true }))
  })

  it('Remove cover deletes an upload of their own for good, and an upload lifts it (#62)', async () => {
    const { fake, user } = setup()
    await act(async () => fake.remote('r1', { coverAsset: 'mine', coverOriginal: 'big', autoFilled: [] }))
    await user.click(await screen.findByRole('button', { name: /Open Kind of Blue/ }))
    await user.click((await screen.findAllByRole('button', { name: 'Edit' }))[0])
    await user.click(screen.getByRole('button', { name: 'Remove cover' }))
    await screen.findByRole('alertdialog', { name: 'Remove this cover for good? The record goes back to its plain sleeve.' })
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(fake.calls.some((c) => c.op === 'delete' && c.path === 'assets/mine')).toBe(true))
    // its full-size original goes too
    expect(fake.calls.some((c) => c.op === 'delete' && c.path === 'assets/big')).toBe(true)
    await user.upload(screen.getByLabelText('Upload cover'), new File(['x'], 'c.png', { type: 'image/png' }))
    await waitFor(() => expect(fake.records.r1).toMatchObject({ coverBlocked: false }))
    expect(fake.records.r1.coverAsset).toBeTruthy()
  })

  it('marks what the lookup filled in', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: /Open Kind of Blue/ }))
    // the sheet's own Edit comes first (play rows have Edit buttons too)
    await user.click((await screen.findAllByRole('button', { name: 'Edit' }))[0])
    expect(screen.getAllByText('auto-filled')).toHaveLength(2)
  })
})

describe('the lookup line', () => {
  it('shows once on every record waiting on its lookup, and goes when the task fills it in', async () => {
    const { fake, user } = setup()
    for (const [open, title] of [[/Open Blue Train/, 'Blue Train'], [/Open Aja/, 'Aja']] as const) {
      await user.click(await screen.findByRole('button', { name: open }))
      await screen.findByRole('heading', { name: title })
      await user.click(await screen.findByRole('button', { name: 'Edit' }))
      await user.click(screen.getByRole('button', { name: 'Find cover & details' }))
      expect(await within(screen.getByRole('dialog')).findAllByText(/^Looking up/)).toHaveLength(1)
      expect(screen.getByRole('button', { name: 'Find cover & details' })).toHaveProperty('disabled', true)
      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    }
    // not on a record that isn't waiting
    await user.click(screen.getByRole('button', { name: /Open Pet Sounds/ }))
    await screen.findByRole('heading', { name: 'Pet Sounds' })
    expect(within(screen.getByRole('dialog')).queryByText(/^Looking up/)).toBeNull()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // the earlier one still says it, until the task fills it in
    await user.click(screen.getByRole('button', { name: /Open Blue Train/ }))
    expect(await within(await screen.findByRole('dialog')).findByText(/^Looking up/)).toBeTruthy()
    await act(async () => fake.remote('r3', { needsEnrich: false, coverAsset: 'new', aboutAt: '2026-10-24', aboutV: 3, about: { summary: 'S.' } }))
    await waitFor(() => expect(within(screen.getByRole('dialog')).queryByText(/^Looking up/)).toBeNull())
  })
})
