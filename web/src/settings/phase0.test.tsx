import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../App'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'

type Opts = Parameters<typeof fakeClaude>[1]
function setup(site: Record<string, unknown> = { taskId: 't1', update: { checkedMs: Date.now() } }, opts: Opts = {}) {
  const seed = sample()
  // every sample record already looked up, so nothing starts the task on its own
  for (const r of Object.values(seed.records))
    Object.assign(r, { coverAsset: 'c', runtime: r.runtime || 40, aboutAt: 1, aboutV: 3, about: { ...(r.about as object), summary: 's' } })
  seed.docs['settings/site'] = site
  const fake = fakeClaude(seed, opts)
  render(
    <RuntimeProvider claude={fake.claude}>
      <App />
    </RuntimeProvider>,
  )
  return { fake, user: userEvent.setup() }
}
const fires = (fake: ReturnType<typeof fakeClaude>) => fake.calls.filter((c) => c.op === 'fire')
const openEdit = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
  await user.click(await screen.findByRole('button', { name: new RegExp('Open ' + title) }))
  await user.click(await screen.findByRole('button', { name: 'Edit' }))
}
afterEach(() => localStorage.clear())

describe('starting the background task', () => {
  it('Find cover & details marks the record and starts the task with what is waiting', async () => {
    const { fake, user } = setup()
    await openEdit(user, 'Blue Train')
    await user.click(screen.getByRole('button', { name: 'Find cover & details' }))
    await waitFor(() => expect(fires(fake)).toHaveLength(1))
    expect(fake.records.r3.needsEnrich).toBe(true)
    expect(fires(fake)[0]).toMatchObject({
      path: 'Claude Code Remote/fire_trigger',
      data: { trigger_id: 't1', text: expect.stringContaining('look up covers, details and album info (Part L) for 1 record') },
    })
    expect((fake.store.settings.site.run as { startedMs: number }).startedMs).toBeGreaterThan(0)
    expect(await screen.findByText(/^Looking up (the cover and )?details…$/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Find cover & details' })).toHaveProperty('disabled', true)
  })

  it('waits for a run under way instead of starting a second', async () => {
    const { fake, user } = setup({ taskId: 't1', run: { startedMs: Date.now() }, update: { checkedMs: Date.now() } })
    await openEdit(user, 'Blue Train')
    await user.click(screen.getByRole('button', { name: 'Find cover & details' }))
    await new Promise((r) => setTimeout(r, 50))
    expect(fires(fake)).toHaveLength(0)
    // the run ends with the record still waiting: the start that waited goes now
    await act(async () => fake.remoteDoc('settings/site', { run: { startedMs: 0 } }))
    await waitFor(() => expect(fires(fake)).toHaveLength(1))
  })

  it('lets a run that has stopped checking in go after 20 minutes', async () => {
    const { fake, user } = setup({ taskId: 't1', run: { startedMs: Date.now() - 30 * 60000, beatMs: Date.now() - 20 * 60000 + 300 }, update: { checkedMs: Date.now() } })
    await openEdit(user, 'Blue Train')
    await user.click(screen.getByRole('button', { name: 'Find cover & details' }))
    await new Promise((r) => setTimeout(r, 50))
    expect(fires(fake)).toHaveLength(0)
    // no word from it since: the start that waited goes once its time is up, without a reload
    await waitFor(() => expect(fires(fake)).toHaveLength(1), { timeout: 3000 })
  })

  it('follows a run that left records for the next, but not one that stopped before saying so', async () => {
    const { fake } = setup()
    // a run another tab started checks in with 12 records left, then ends: this page starts the next
    await act(async () => fake.remoteDoc('settings/site', { run: { startedMs: Date.now(), beatMs: Date.now() }, lookupLeft: 12 }))
    await new Promise((r) => setTimeout(r, 50))
    expect(fires(fake)).toHaveLength(0)
    await act(async () => fake.remoteDoc('settings/site', { run: { startedMs: 0, beatMs: 0 } }))
    await waitFor(() => expect(fires(fake)).toHaveLength(1))
    expect(fake.store.settings.site.lookupLeft).toBe(0)
    // that run ends without a word: no third
    await act(async () => fake.remoteDoc('settings/site', { run: { startedMs: 0 } }))
    await new Promise((r) => setTimeout(r, 50))
    expect(fires(fake)).toHaveLength(1)
  })

  it("says so when the page can't start tasks", async () => {
    const { user } = setup(undefined, { mcp: 'denied' })
    await openEdit(user, 'Blue Train')
    await user.click(screen.getByRole('button', { name: 'Find cover & details' }))
    expect(await screen.findByText('Background updates need permission to start Claude tasks. Allow it for this page and try again.')).toBeTruthy()
  })

  it("says so when the task isn't set up", async () => {
    const { user } = setup({})
    await openEdit(user, 'Blue Train')
    await user.click(screen.getByRole('button', { name: 'Find cover & details' }))
    expect(await screen.findByText("Background updates aren't set up yet. Ask Claude to finish setting up your Vinyl Wall.")).toBeTruthy()
  })

  it('starts on its own for records waiting on album info, once per 30 minutes', async () => {
    const seed = sample()
    seed.docs['settings/site'] = { taskId: 't1', update: { checkedMs: Date.now() } }
    const fake = fakeClaude(seed)
    const ui = (
      <RuntimeProvider claude={fake.claude}>
        <App />
      </RuntimeProvider>
    )
    const v = render(ui)
    await waitFor(() => expect(fires(fake)).toHaveLength(1))
    expect(screen.getByLabelText(/^Looking up \d records$/)).toBeTruthy()
    v.unmount()
    render(ui)
    await new Promise((r) => setTimeout(r, 50))
    expect(fires(fake)).toHaveLength(1)
  })

  it('closing the sheet after a synced edit starts the task without the 20 second wait', async () => {
    const { fake, user } = setup()
    await openEdit(user, 'Blue Train')
    await user.type(screen.getByRole('textbox', { name: 'Why' }), 'x')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(fires(fake)).toHaveLength(1))
    expect(fires(fake)[0].data!.text).toContain('Waiting now:')
  })
})

it('works on a wall published on an older runtime (no user.can)', async () => {
  const { user } = setup(undefined, { oldRuntime: true })
  await openEdit(user, 'Blue Train')
  expect(screen.getByRole('textbox', { name: 'Why' })).toBeTruthy()
})

describe('settings', () => {
  it('shows the update dot and the sentence to send when a newer release is out', async () => {
    const { user } = setup({ taskId: 't1', update: { latest: '1.0.1', checkedMs: Date.now() } })
    await user.click(await screen.findByRole('button', { name: 'Settings (update available)' }))
    expect(await screen.findByText('An update is available')).toBeTruthy()
    expect(screen.getByText('Update my Vinyl Wall using https://raw.githubusercontent.com/ober37/vinyl-wall/v1.0.1/SETUP.md')).toBeTruthy()
  })

  it('offers no update for this or an older version', async () => {
    setup({ taskId: 't1', update: { latest: '1.0.0', checkedMs: Date.now() } })
    expect(await screen.findByRole('button', { name: 'Settings' })).toBeTruthy()
  })

  it('saves the token to private data, then checks it with the task', async () => {
    const { fake, user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Settings' }))
    const panel = await screen.findByRole('dialog')
    await user.type(within(panel).getByRole('textbox', { name: 'Username' }), 'ober37')
    await user.type(within(panel).getByLabelText('Personal access token'), 'short')
    await user.click(within(panel).getByRole('button', { name: 'Save token' }))
    expect(within(panel).getByText("That doesn't look like a Discogs token. It should be a long string of letters and numbers.")).toBeTruthy()
    await user.clear(within(panel).getByLabelText('Personal access token'))
    await user.type(within(panel).getByLabelText('Personal access token'), 'abcdefghij0123456789wxyz')
    await user.click(within(panel).getByRole('button', { name: 'Save token' }))
    await waitFor(() => expect(fake.store['data/users/u_me']?.discogs).toMatchObject({ token: 'abcdefghij0123456789wxyz' }))
    expect(fake.store.settings.site.discogs).toMatchObject({ username: 'ober37', hasToken: true, last4: 'wxyz', status: 'pending' })
    expect(await within(panel).findByText('Checking…')).toBeTruthy()
    await waitFor(() => expect(fires(fake)[0].data!.text).toContain('verify the Discogs connection (Part B)'))
    // the task reports it wasn't accepted
    await act(async () => fake.remoteDoc('settings/site', { discogs: { status: 'error', msg: 'Bad token' } }))
    expect(within(panel).getByText('Not accepted')).toBeTruthy()
    expect(within(panel).getByText('Bad token')).toBeTruthy()
    await user.click(within(panel).getByRole('button', { name: 'Remove token' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove token' }))
    await waitFor(() => expect(fake.store['data/users/u_me']?.discogs).toBeUndefined())
    expect(fake.store.settings.site.discogs).toMatchObject({ hasToken: false, last4: '' })
  })
})
