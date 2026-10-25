import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../App'
import { siteOf } from '../model/site'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'

type Opts = Parameters<typeof fakeClaude>[1]
function setup(site: Record<string, unknown> = {}, opts: Opts = {}, empty = false) {
  const seed = sample()
  if (empty) seed.records = {}
  // every sample record already looked up, so nothing starts the task on its own
  for (const r of Object.values(seed.records))
    Object.assign(r, { coverAsset: 'c', runtime: r.runtime || 40, aboutAt: 1, aboutV: 3, about: { ...(r.about as object), summary: 's' } })
  seed.docs['settings/site'] = { taskId: 't1', update: { checkedMs: Date.now() }, ...site }
  const fake = fakeClaude(seed, opts)
  render(
    <RuntimeProvider claude={fake.claude}>
      <App />
    </RuntimeProvider>,
  )
  return { fake, user: userEvent.setup(), site: () => fake.store.settings.site as Record<string, unknown> }
}
const openSettings = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: 'Settings' }))
  return screen.findByRole('dialog', { name: 'Settings' })
}
afterEach(() => localStorage.clear())

describe('Settings: how the wall looks', () => {
  it('saves the title as it is typed and the wall shows it', async () => {
    const { user, site } = setup()
    const sheet = await openSettings(user)
    await user.type(within(sheet).getByRole('textbox', { name: 'Title' }), 'Back Room')
    await waitFor(() => expect(site().title).toBe('Back Room'))
    expect(within(sheet).getByText('Saved')).toBeTruthy()
    expect(document.title).toBe('Back Room')
  })

  it('draws every pattern, and a picked one hangs behind the wall', async () => {
    expect(siteOf({ bg: { kind: 'preset', preset: 'walnut' } }).background).toEqual({ kind: 'pattern', preset: 'walnut' })
    const { user, site } = setup()
    const sheet = await openSettings(user)
    const group = within(sheet).getByRole('group', { name: 'Background' })
    expect(within(group).getByRole('button', { name: 'Listening room' }).getAttribute('aria-pressed')).toBe('true')
    // a stock photo offers its strength; a pattern doesn't
    expect(within(sheet).getByRole('slider', { name: 'Photo strength' })).toBeTruthy()
    await user.click(within(group).getByRole('button', { name: 'Walnut paneling' }))
    await waitFor(() => expect(site().bg).toEqual({ kind: 'preset', preset: 'walnut' }))
    expect(screen.getAllByTestId('wall-bg')[0].className).toContain('bg-walnut')
    expect(within(sheet).queryByRole('slider')).toBeNull()
  })

  it('uploads a photo as the background, and removing it for good goes back to the listening room', async () => {
    const { fake, user, site } = setup({ bg: { kind: 'preset', preset: 'crates' }, dim: 40 })
    const sheet = await openSettings(user)
    await user.upload(within(sheet).getByLabelText('Upload your own background'), new File(['x'], 'my den.jpg', { type: 'image/jpeg' }))
    // an uploaded photo starts at its own scale's default
    await waitFor(() => expect(site()).toMatchObject({ bg: { kind: 'photo', assetId: 'a_1' }, uploads: [{ id: 'a_1', name: 'my den' }], dim: 70 }))
    expect(within(sheet).getByRole('button', { name: 'my den' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(within(sheet).getByRole('button', { name: 'Remove my den' }))
    const ask = await screen.findByRole('alertdialog')
    expect(within(ask).getByText(/The wall goes back to Crate digging/)).toBeTruthy()
    await user.click(within(ask).getByRole('button', { name: 'Remove' }))
    // back to the background it replaced, at the wash it had
    await waitFor(() => expect(site()).toMatchObject({ bg: { kind: 'preset', preset: 'crates' }, uploads: [], dim: 40 }))
    await waitFor(() => expect(fake.calls.some((c) => c.path === 'assets/a_1' && c.op === 'delete')).toBe(true))
  })

  it('keeps each photo kind on its own slider scale, even through a pattern or a photo missing from uploads', async () => {
    const { user, site } = setup({ bg: { kind: 'photo', assetId: 'x1' }, dim: 85 })
    const sheet = await openSettings(user)
    expect(within(sheet).getByRole('slider', { name: 'Photo strength' }).getAttribute('min')).toBe('20')
    const group = within(sheet).getByRole('group', { name: 'Background' })
    await user.click(within(group).getByRole('button', { name: 'Grooves' }))
    await waitFor(() => expect(site().bg).toMatchObject({ kind: 'preset', preset: 'grooves' }))
    expect(site().dim).toBe(85)
    await user.click(within(group).getByRole('button', { name: 'Coffee shop' }))
    await waitFor(() => expect(site()).toMatchObject({ bg: { kind: 'preset', preset: 'cafe' }, dim: 50 }))
  })

  it("says so when a photo is too big, and offers no upload where this view can't store files", async () => {
    const { user } = setup()
    const sheet = await openSettings(user)
    const big = new File(['x'], 'huge.jpg', { type: 'image/jpeg' })
    Object.defineProperty(big, 'size', { value: 16 * 1024 * 1024 })
    await user.upload(within(sheet).getByLabelText('Upload your own background'), big)
    expect(await within(sheet).findByText('That image is over 15 MB. Try a smaller one.')).toBeTruthy()
  })

  it('hides the upload tile without file storage', async () => {
    const { user } = setup({}, { assets: 'none' })
    const sheet = await openSettings(user)
    expect(within(sheet).queryByText('Upload your own')).toBeNull()
    expect(within(sheet).getByText("Uploading your own background isn't available in this view.")).toBeTruthy()
  })

  it('strengthens the photo from the keyboard and saves where it stops, as less wash', async () => {
    const { user, site } = setup()
    const sheet = await openSettings(user)
    within(sheet).getByRole('slider', { name: 'Photo strength' }).focus()
    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(site().dim).toBe(45))
  })

  it('hangs the records in the style picked', async () => {
    const { user, site } = setup()
    const sheet = await openSettings(user)
    await user.click(within(within(sheet).getByRole('group', { name: 'Hanging' })).getByRole('button', { name: 'Cork' }))
    await waitFor(() => expect(site().hang).toBe('cork'))
    expect(screen.getByRole('list', { name: 'Records', hidden: true }).getAttribute('data-hang')).toBe('cork')
  })
})

describe('Settings: Discogs import and help', () => {
  const verified = { discogs: { username: 'bob', hasToken: true, last4: 'abcd', status: 'ok', verifiedUser: 'bob' } }

  it('starts the import at once, even straight after another start', async () => {
    const { fake, user, site } = setup(verified)
    const sheet = await openSettings(user)
    await user.click(within(sheet).getByRole('button', { name: 'Check again' }))
    await waitFor(() => expect(fake.calls.filter((c) => c.op === 'fire')).toHaveLength(1))
    // the check ran and verified the token again
    await act(async () => fake.remoteDoc('settings/site', { run: { startedMs: 0 }, ...verified }))
    await user.click(within(sheet).getByRole('button', { name: 'Import from Discogs' }))
    await waitFor(() => expect(fake.calls.filter((c) => c.op === 'fire')).toHaveLength(2))
    expect((site().discogs as Record<string, unknown>).importRequested).toBe(true)
    expect(await within(sheet).findByRole('button', { name: 'Importing…' })).toHaveProperty('disabled', true)
    expect(within(sheet).getByText('This takes a few minutes. Records appear on the wall as they come in.')).toBeTruthy()
  })

  it('offers Try again when an import has waited over ten minutes', async () => {
    const { user } = setup({ discogs: { ...verified.discogs, importRequested: true, importRequestedAt: Date.now() - 11 * 60000 } })
    const sheet = await openSettings(user)
    expect(within(sheet).getByText('This is taking longer than it should. Try again to restart it.')).toBeTruthy()
    expect(within(sheet).getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('offers no import until the token is verified, and links to GitHub for help', async () => {
    const { user } = setup({ discogs: { username: 'bob', hasToken: true, last4: 'abcd', status: 'pending' } })
    const sheet = await openSettings(user)
    expect(within(sheet).queryByText("Bring in what's already on Discogs")).toBeNull()
    expect(within(sheet).getByRole('link', { name: 'Tell us on GitHub' }).getAttribute('href')).toBe('https://github.com/ober37/vinyl-wall/issues/new/choose')
  })
})

describe('the welcome card', () => {
  it("greets an owner's empty wall, and Start blank leaves the plain empty wall", async () => {
    const { user, site } = setup({}, {}, true)
    expect(await screen.findByRole('heading', { name: 'Start your wall' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Start blank' }))
    await waitFor(() => expect(site().welcomeDismissed).toBe(true))
    expect(await screen.findByText(/Nothing hanging yet\./)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Start your wall' })).toBeNull()
  })

  it('opens Settings on Discogs with the username ready, and marks the steps done', async () => {
    const { user } = setup({ discogs: { username: 'bob', hasToken: true, status: 'ok' } }, {}, true)
    const card = (await screen.findByRole('heading', { name: 'Start your wall' })).closest('section')!
    expect(within(card).getByText(', done')).toBeTruthy()
    await user.click(within(card).getByRole('button', { name: 'Open Settings' }))
    const sheet = await screen.findByRole('dialog', { name: 'Settings' })
    await waitFor(() => expect(document.activeElement).toBe(within(sheet).getByRole('textbox', { name: 'Username' })))
  })

  it("isn't shown to viewers, or once dismissed", async () => {
    setup({}, { canWrite: false }, true)
    expect(await screen.findByText('Nothing hanging yet.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Start your wall' })).toBeNull()
  })
})

describe('starts the page makes on its own', () => {
  it("say nothing when background updates can't run here, and Find cover & details still says why", async () => {
    const { user } = setup({}, { mcp: 'none' })
    await user.click(await screen.findByRole('button', { name: 'Add a record' }))
    const sheet = await screen.findByRole('dialog')
    await user.type(within(sheet).getByRole('textbox', { name: 'Album' }), 'Rumours')
    await user.type(within(sheet).getByRole('textbox', { name: 'Artist' }), 'Fleetwood Mac')
    await user.click(within(sheet).getByRole('button', { name: 'I own it' }))
    await user.click(within(sheet).getByRole('button', { name: 'Hang it' }))
    await screen.findByRole('dialog', { name: 'Rumours' })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText(/Background updates aren't available/)).toBeNull()
    // a record that isn't already waiting on a lookup
    await user.keyboard('{Escape}')
    await user.click(await screen.findByRole('button', { name: /Open Blue Train/ }))
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Find cover & details' }))
    expect(await screen.findByText(/Background updates aren't available in this view/)).toBeTruthy()
  })
})
