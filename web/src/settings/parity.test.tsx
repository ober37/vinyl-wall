import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import type { Rec } from '../model/record'
import { siteOf } from '../model/site'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'
import { APP_VERSION } from '../version'
import { drawShare } from '../wall/drawShare'

// the real drawing by default; the Share sheet's tests hand it a finished picture instead
vi.mock('../wall/drawShare', async (orig) => {
  const m = await orig<typeof import('../wall/drawShare')>()
  return { ...m, drawShare: vi.fn(m.drawShare) }
})
const draw = vi.mocked(drawShare)

type Opts = Parameters<typeof fakeClaude>[1]
type U = ReturnType<typeof userEvent.setup>
type Seed = ReturnType<typeof sample> & { collections?: Record<string, Record<string, Record<string, unknown>>>; assets?: string[] }
type Cap = Record<string, (...a: never[]) => unknown>
function setup(
  o: {
    site?: Record<string, unknown> | null
    opts?: Opts
    empty?: boolean
    seed?: (s: Seed) => void
    // stands in for a capability behaving as the fake doesn't (a slow db, a failing save)
    wrap?: (name: string, cap: Cap) => Cap
  } = {},
) {
  const seed: Seed = sample()
  if (o.empty) seed.records = {}
  // every sample record already looked up, so nothing starts the task on its own
  for (const r of Object.values(seed.records))
    Object.assign(r, { coverAsset: 'c', runtime: r.runtime || 40, aboutAt: 1, aboutV: 3, about: { ...(r.about as object), summary: 's' } })
  if (o.site === null) seed.docs = {}
  else seed.docs['settings/site'] = { taskId: 't1', update: { checkedMs: Date.now() }, ...o.site }
  o.seed?.(seed)
  const fake = fakeClaude(seed, o.opts)
  const inner = fake.claude as unknown as { use: (n: string) => Promise<Cap | null> }
  const claude = o.wrap
    ? ({ use: async (n: string) => ((c) => (c ? o.wrap!(n, c) : c))(await inner.use(n)) } as unknown as Window['claude'])
    : fake.claude
  render(
    <RuntimeProvider claude={claude}>
      <App />
    </RuntimeProvider>,
  )
  return { fake, user: userEvent.setup(), site: () => fake.store.settings.site as Record<string, unknown> }
}
const fires = (fake: ReturnType<typeof fakeClaude>) => fake.calls.filter((c) => c.op === 'fire')
const openSettings = async (user: U) => {
  await user.click(await screen.findByRole('button', { name: /^Settings/ }))
  return screen.findByRole('dialog', { name: 'Settings' })
}
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
// every record write waits a moment, so each step of an import is on screen long enough to see
const slowWrites = (name: string, cap: Cap): Cap => {
  if (name === 'assets') {
    const a = cap as unknown as { upload: (b: Blob) => Promise<unknown> }
    let n = 0
    // each one later than the last, so they finish one at a time
    return { ...cap, upload: async (b: Blob) => (await pause(10 * ++n), a.upload(b)) } as unknown as Cap
  }
  if (name !== 'db') return cap
  const db = cap as unknown as { collection: (c: string) => Record<string, unknown> & { doc: (id?: string) => Record<string, unknown> & { set: (d: unknown) => Promise<void> } } }
  return {
    ...cap,
    collection: (c: string) => {
      const col = db.collection(c)
      return {
        ...col,
        doc: (id?: string) => {
          const d = col.doc(id)
          return { ...d, set: async (x: unknown) => (await pause(5), d.set(x)) }
        },
      }
    },
  } as unknown as Cap
}
// everything a live region has said, in order
function heard() {
  const said: string[] = []
  const note = () =>
    document.querySelectorAll('[role=status]').forEach((e) => {
      const t = e.textContent || ''
      if (t && said[said.length - 1] !== t && !said.includes(t)) said.push(t)
    })
  const mo = new MutationObserver(note)
  mo.observe(document.body, { subtree: true, childList: true, characterData: true })
  return { said, stop: () => mo.disconnect() }
}
const IMG = 'data:image/jpeg;base64,/9j/4AECAw=='
const fileOf = (o: unknown) => new File([JSON.stringify({ vinylWall: 1, ...(o as object) })], 'lib.json', { type: 'application/json' })
const bringIn = async (user: U, f: File) => {
  const sheet = await openSettings(user)
  await user.click(within(sheet).getByRole('button', { name: 'Import from a file' }))
  const view = await screen.findByRole('dialog', { name: 'Import your library' })
  await user.upload(document.querySelector<HTMLInputElement>('input[type=file][accept=".json,application/json"]')!, f)
  await user.click(await within(view).findByRole('button', { name: 'Bring them in' }))
  await within(view).findByRole('button', { name: 'See your wall' })
  return view
}

beforeEach(() => {
  localStorage.clear()
  draw.mockClear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Settings: the update notice', () => {
  const out = { taskId: 't1', update: { latest: '9.0.0', checkedMs: Date.now() } }
  const ask = 'Update my Vinyl Wall using https://raw.githubusercontent.com/ober37/vinyl-wall/v9.0.0/SETUP.md'

  it('copies the sentence to send Claude', async () => {
    const { user } = setup({ site: out })
    const sheet = await openSettings(user)
    await user.click(within(sheet).getByRole('button', { name: 'Copy' }))
    expect(await navigator.clipboard.readText()).toBe(ask)
    expect(await within(sheet).findByRole('button', { name: 'Copied' })).toBeTruthy()
  })

  it('selects the sentence when it can’t be copied, and says how to copy it', async () => {
    const { user } = setup({ site: out })
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    const sheet = await openSettings(user)
    await user.click(within(sheet).getByRole('button', { name: 'Copy' }))
    expect(await within(sheet).findByText("Selected: copy it with your device's copy command")).toBeTruthy()
    expect(getSelection()!.toString()).toBe(ask)
  })
})

describe('Settings: checking for a release', () => {
  it('opening Settings checks for a newer release when the last check is over a day old', async () => {
    const { fake, user } = setup({ site: { update: { checkedMs: Date.now() - 25 * 3600000 } } })
    await screen.findAllByTestId('sleeve')
    await pause(50)
    expect(fires(fake)).toHaveLength(0)
    await openSettings(user)
    await waitFor(() => expect(fires(fake)).toHaveLength(1))
    expect(fires(fake)[0].data!.text).toContain('check for a newer release (Part E)')
  })

  it('opening Settings starts nothing when it checked today', async () => {
    const { fake, user } = setup({ site: { update: { checkedMs: Date.now() - 23 * 3600000 } } })
    await openSettings(user)
    await pause(50)
    expect(fires(fake)).toHaveLength(0)
  })
})

describe('Settings: Discogs', () => {
  const verified = { discogs: { username: 'bob', hasToken: true, last4: 'abcd', status: 'ok', verifiedUser: 'bob' } }

  it('saves the username as it is typed, without a check while there is no token', async () => {
    const { fake, user, site } = setup()
    const sheet = await openSettings(user)
    await user.type(within(sheet).getByRole('textbox', { name: 'Username' }), 'ober37')
    await waitFor(() => expect(site().discogs).toEqual({ username: 'ober37' }), { timeout: 2000 })
    await pause(50)
    expect(fires(fake)).toHaveLength(0)
  })

  it('checks the token again when the username changes', async () => {
    const { fake, user, site } = setup({ site: verified })
    const sheet = await openSettings(user)
    const name = within(sheet).getByRole('textbox', { name: 'Username' })
    await user.clear(name)
    await user.type(name, 'alice')
    await waitFor(() => expect(site().discogs).toMatchObject({ username: 'alice', status: 'pending', hasToken: true }), { timeout: 2000 })
    await waitFor(() => expect(fires(fake)).toHaveLength(1))
    expect(fires(fake)[0].data!.text).toContain('verify the Discogs connection (Part B)')
    expect(await within(sheet).findByText('Checking…')).toBeTruthy()
  })

  it('hides the token as it is typed, with Show and Hide, and links to where tokens are made', async () => {
    const { user } = setup()
    const sheet = await openSettings(user)
    const token = within(sheet).getByLabelText('Personal access token')
    expect(token.getAttribute('type')).toBe('password')
    await user.click(within(sheet).getByRole('button', { name: 'Show' }))
    expect(token.getAttribute('type')).toBe('text')
    await user.click(within(sheet).getByRole('button', { name: 'Hide' }))
    expect(token.getAttribute('type')).toBe('password')
    expect(within(sheet).getByRole('button', { name: 'Show' })).toBeTruthy()
    expect(within(sheet).getByRole('link', { name: 'discogs.com/settings/developers' }).getAttribute('href')).toBe('https://www.discogs.com/settings/developers')
  })

  it('asks for the username before saving a token', async () => {
    const { fake, user } = setup()
    const sheet = await openSettings(user)
    await user.type(within(sheet).getByLabelText('Personal access token'), 'abcdefghij0123456789wxyz')
    await user.click(within(sheet).getByRole('button', { name: 'Save token' }))
    expect(within(sheet).getByText('Add your Discogs username first.')).toBeTruthy()
    expect(fake.store['data/users/u_me']).toBeUndefined()
  })

  it('asks to sign in, plainly, where the token has nowhere to go', async () => {
    const { user } = setup({ opts: { userId: '' } })
    const sheet = await openSettings(user)
    await user.type(within(sheet).getByRole('textbox', { name: 'Username' }), 'tester')
    await user.type(within(sheet).getByLabelText('Personal access token'), 'abcdefghij0123456789wxyz')
    await user.click(within(sheet).getByRole('button', { name: 'Save token' }))
    expect(await within(sheet).findByText('Sign in to claude.ai to save your token.')).toBeTruthy()
  })

  it('Replace token takes a new one and checks it', async () => {
    const { fake, user, site } = setup({ site: verified })
    const sheet = await openSettings(user)
    expect(within(sheet).queryByLabelText('Personal access token')).toBeNull()
    await user.click(within(sheet).getByRole('button', { name: 'Replace token' }))
    await user.type(within(sheet).getByLabelText('Personal access token'), 'zyxwvutsrq9876543210newt')
    await user.click(within(sheet).getByRole('button', { name: 'Save token' }))
    await waitFor(() => expect(fake.store['data/users/u_me']?.discogs).toMatchObject({ token: 'zyxwvutsrq9876543210newt' }))
    await waitFor(() => expect(site().discogs).toMatchObject({ username: 'bob', hasToken: true, last4: 'newt', status: 'pending', verifiedUser: '' }))
    await waitFor(() => expect(fires(fake)).toHaveLength(1))
  })

  it('asks before removing the token, and keeps it when you back out', async () => {
    const { fake, user, site } = setup({
      site: verified,
      seed: (s) => (s.collections = { 'data/users/u_me': { discogs: { token: 'abcdefghij0123456789abcd' } } }),
    })
    const sheet = await openSettings(user)
    await user.click(within(sheet).getByRole('button', { name: 'Remove token' }))
    const ask = await screen.findByRole('alertdialog')
    expect(within(ask).getByText('Remove your token? Syncing with Discogs stops until you add one again.')).toBeTruthy()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(fake.store['data/users/u_me'].discogs).toMatchObject({ token: 'abcdefghij0123456789abcd' })
    expect(site().discogs).toMatchObject({ hasToken: true, last4: 'abcd' })
  })
})

describe('Settings: help', () => {
  it('names the version of the wall', async () => {
    const { user } = setup()
    const sheet = await openSettings(user)
    expect(within(sheet).getByText('Vinyl Wall ' + APP_VERSION)).toBeTruthy()
    expect(within(sheet).getByText(/can see everything on it, prices, orders and notes included\./)).toBeTruthy()
  })
})

describe('Settings: saving', () => {
  it('writes only what changed, so a change made elsewhere is kept', async () => {
    const { fake, user, site } = setup()
    await screen.findAllByTestId('sleeve')
    // the task wrote this, and the page hasn't heard yet
    site().discogs = { status: 'ok', verifiedUser: 'tester' }
    const sheet = await openSettings(user)
    await user.type(within(sheet).getByRole('textbox', { name: 'Title' }), 'Test wall')
    await waitFor(() => expect(site().title).toBe('Test wall'))
    expect(site().discogs).toEqual({ status: 'ok', verifiedUser: 'tester' })
    expect(fake.calls.filter((c) => c.path === 'settings/site')).toEqual([{ path: 'settings/site', op: 'update', data: { title: 'Test wall' } }])
  })

  it('writes the whole settings when the wall has none yet, then only what changed', async () => {
    const { fake, user, site } = setup({ site: null })
    const sheet = await openSettings(user)
    const title = within(sheet).getByRole('textbox', { name: 'Title' })
    await user.type(title, 'Den')
    await waitFor(() => expect(site()?.title).toBe('Den'))
    await user.type(title, ' 2')
    await waitFor(() => expect(site().title).toBe('Den 2'))
    const writes = fake.calls.filter((c) => c.path === 'settings/site')
    expect(writes.map((c) => c.op)).toEqual(['set', 'update'])
    expect(writes[0].data).toMatchObject({ title: 'Den' })
    expect(writes[1].data).toEqual({ title: 'Den 2' })
  })

  it('says so when settings can’t be saved', async () => {
    const { user } = setup({ opts: { failWrites: true } })
    const sheet = await openSettings(user)
    await user.type(within(sheet).getByRole('textbox', { name: 'Title' }), 'Den')
    expect(await within(sheet).findByText("Couldn't save settings: Not allowed")).toBeTruthy()
  })
})

describe('Export your library: what it says and carries', () => {
  it('says it is saving, then counts the covers that couldn’t be included (not a missing photo)', async () => {
    let release = () => {}
    const gate = new Promise<void>((r) => (release = r))
    vi.stubGlobal('fetch', async () => (await gate, new Response('', { status: 404 })))
    const { user } = setup({
      site: { bg: { kind: 'photo', assetId: 'bg1' } },
      seed: (s) => Object.assign(s.records.r3, { coverAsset: 'c3' }),
    })
    const sheet = await openSettings(user)
    await user.click(within(sheet).getByRole('button', { name: 'Export your library' }))
    expect(await within(sheet).findByText('Saving your library…')).toBeTruthy()
    release()
    expect(await within(sheet).findByText("Saved 5 records. 2 covers couldn't be included.")).toBeTruthy()
  })

  it('carries the records’ artists and the photo background', async () => {
    vi.stubGlobal('fetch', async () => new Response(new Blob(['img'], { type: 'image/jpeg' })))
    const { fake, user } = setup({
      site: { bg: { kind: 'photo', assetId: 'bg1' } },
      seed: (s) => {
        s.records.r1.artistRef = 'mb-miles'
        s.collections = { artists: { 'mb-miles': { name: 'Miles Davis', summary: 'Trumpeter.' }, 'mb-other': { name: 'Someone Else', summary: 'x' } } }
      },
    })
    const sheet = await openSettings(user)
    await user.click(within(sheet).getByRole('button', { name: 'Export your library' }))
    expect(await within(sheet).findByText('Saved 5 records.')).toBeTruthy()
    const f = JSON.parse(fake.saved[0].data as string)
    expect(f.artists).toEqual({ 'mb-miles': { name: 'Miles Davis', summary: 'Trumpeter.' } })
    expect(f.covers.bg1).toMatch(/^data:image\/jpeg;base64,/)
    expect(f.settings.site.bg).toEqual({ kind: 'photo', assetId: 'bg1' })
  })
})

describe('Import from a file: each case', () => {
  const abt = { summary: 'An album.\n\nMore.', source: 'claude' }
  const snap = {
    records: {
      i2: { title: 'Has All', artist: 'Artist Nine', status: 'own', notes: [], coverAsset: 'c9', artistRef: 'ar9', about: abt, aboutAt: '2026-10-01', aboutV: 2 },
      i3: { title: 'No Artist Doc', artist: 'Artist Ten', status: 'own', notes: [], coverAsset: 'c9', artistRef: 'ar10', about: abt, aboutAt: '2026-10-01', aboutV: 2 },
      i4: { title: 'No Summary', artist: 'Artist Eleven', status: 'own', notes: [], coverAsset: 'c11', aboutAt: '2026-10-01', aboutV: 2 },
      i5: { title: 'Wall Artist', artist: 'Miles Davis', status: 'own', notes: [], coverAsset: 'c9', artistRef: 'mb-miles', about: abt, aboutAt: '2026-10-01', aboutV: 2 },
      i8: { title: 'Svg Cover', artist: 'Artist Eight', status: 'own', notes: [], coverAsset: 'c12' },
      i9: { title: 'Odd Id', artist: 'Artist Nine B', status: 'own', notes: [], coverAsset: 'constructor' },
      i6: { title: 'Blocked', artist: 'Someone', status: 'own', notes: [], coverAsset: 'c9', aboutBlocked: true, aboutAt: '2026-10-01' },
    },
    artists: {
      ar9: { name: 'Artist Nine', summary: 'Nine.', source: 'claude', stray: 'x', fetchedAt: 'soon', links: [{ kind: 'website', url: 'https://a.example', extra: 1 }, 'bad'] },
      'mb-miles': { name: 'Not Miles', summary: 'Overwritten.' },
      arX: { name: 'Unused', summary: 'x' },
    },
    covers: { c9: IMG, c11: 'javascript:alert(1)', c12: 'data:image/svg+xml;base64,' + btoa("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>") },
  }
  const wallArtist = (s: Seed) => (s.collections = { artists: { 'mb-miles': { name: 'Miles Davis', summary: 'Trumpeter.' } } })

  it('uploads each photo cover once, looks up the rest, and counts each record once', async () => {
    const { fake, user } = setup({ seed: wallArtist })
    const view = await bringIn(user, fileOf(snap))
    expect(within(view).getByText("Brought in 7 records. We'll look up covers or album info for 4 of them. This takes a few minutes.")).toBeTruthy()
    const R = fake.store.records
    expect(fake.calls.filter((c) => c.path === 'assets' && c.op === 'upload')).toHaveLength(1)
    // the photo cover, uploaded here and shared by every record that had it
    expect(R.i2.coverAsset).toMatch(/^a_/)
    expect(R.i2).not.toHaveProperty('needsEnrich')
    expect(R.i5.coverAsset).toBe(R.i2.coverAsset)
    // an image that isn't a photo, an SVG, or an odd id: looked up instead
    for (const id of ['i4', 'i8', 'i9']) {
      expect(R[id].needsEnrich).toBe(true)
      expect(R[id]).not.toHaveProperty('coverAsset')
    }
    // album info stays where its artist came along or is on the wall; looked up again where it didn't
    expect(R.i2).toMatchObject({ aboutAt: '2026-10-01', aboutV: 2 })
    expect(R.i5).toMatchObject({ aboutAt: '2026-10-01', aboutV: 2 })
    expect(R.i3).not.toHaveProperty('aboutAt')
    expect(R.i3.about).toMatchObject({ summary: abt.summary })
    expect(R.i6).toMatchObject({ aboutBlocked: true, aboutAt: '2026-10-01' })
  })

  it('brings in only the artists its records use, with only their own fields, and never over the wall’s own', async () => {
    const { fake, user } = setup({ seed: wallArtist })
    await bringIn(user, fileOf(snap))
    const A = fake.store.artists
    expect(A.ar9).toEqual({ name: 'Artist Nine', summary: 'Nine.', source: 'claude', links: [{ kind: 'website', url: 'https://a.example' }] })
    expect(A['mb-miles']).toEqual({ name: 'Miles Davis', summary: 'Trumpeter.' })
    expect(A).not.toHaveProperty('arX')
  })

  it('looks up a cover whose upload failed', async () => {
    const { fake, user } = setup({ opts: { assets: 'fail' } })
    const view = await bringIn(user, fileOf({ records: { i7: { title: 'Upload Fails', artist: 'Artist Seven', status: 'own', notes: [], coverAsset: 'c7', about: abt, aboutAt: '2026-10-01' } }, covers: { c7: IMG } }))
    expect(within(view).getByText("Brought in 1 record. We'll look up covers for it. This takes a few minutes.")).toBeTruthy()
    expect(fake.store.records.i7.needsEnrich).toBe(true)
    expect(fake.store.records.i7).not.toHaveProperty('coverAsset')
  })

  it('says how far it has got, and to keep the page open', async () => {
    const recs = Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [`p${i}`, { title: `Record ${i}`, artist: `Artist ${i}`, status: 'own', notes: [], coverAsset: `k${i}` }]),
    )
    const covers = Object.fromEntries(Object.keys(recs).map((_, i) => [`k${i}`, IMG]))
    const { user } = setup({ wrap: slowWrites })
    const sheet = await openSettings(user)
    await user.click(within(sheet).getByRole('button', { name: 'Import from a file' }))
    const view = await screen.findByRole('dialog', { name: 'Import your library' })
    await user.upload(document.querySelector<HTMLInputElement>('input[type=file][accept=".json,application/json"]')!, fileOf({ records: recs, covers }))
    const log = heard()
    await user.click(await within(view).findByRole('button', { name: 'Bring them in' }))
    expect(await within(view).findByText("Keep this page open until it's done.")).toBeTruthy()
    await within(view).findByRole('button', { name: 'See your wall' })
    log.stop()
    expect(log.said).toEqual(
      expect.arrayContaining(['Bringing in your library…', 'Bringing in covers: 5 of 6…', 'Bringing in records…', 'Bringing in records: 5 of 6…']),
    )
    expect(within(view).queryByText("Keep this page open until it's done.")).toBeNull()
  })

  it('gives an empty wall the file’s photo, and drops an untouched “My setup” once the file brings its own', async () => {
    const { fake, user, site } = setup({
      empty: true,
      seed: (s) => (s.collections = { setups: { s0: { name: 'My setup', note: '', added: 1 }, s1: { name: 'My setup', note: 'By the window', added: 2 } } }),
    })
    await bringIn(
      user,
      fileOf({
        records: { i10: { title: 'New Wall', artist: 'Artist Ten B', status: 'own', notes: [] } },
        setups: { den: { name: 'Den', note: '', added: 3 } },
        settings: { site: { bg: { kind: 'photo', assetId: 'bg1' }, dim: 60 } },
        covers: { bg1: IMG },
      }),
    )
    const ups = fake.calls.filter((c) => c.path === 'assets' && c.op === 'upload')
    expect(ups).toHaveLength(1)
    await waitFor(() => expect(site().bg).toMatchObject({ kind: 'photo', assetId: expect.stringMatching(/^a_/) }))
    const id = (site().bg as { assetId: string }).assetId
    expect(site()).toMatchObject({ dim: 60, uploads: [{ id, name: 'Your photo' }] })
    await waitFor(() => expect(fake.store.setups).not.toHaveProperty('s0'))
    expect(fake.store.setups.s1).toMatchObject({ name: 'My setup', note: 'By the window' })
    expect(fake.store.setups.den).toMatchObject({ name: 'Den' })
  })
})

describe('the share picture: how many sleeves', () => {
  it('draws up to 40 sleeves, then says how many more there are', async () => {
    const texts: string[] = []
    const ctx = new Proxy({} as Record<string | symbol, unknown>, {
      get: (t, k) => {
        if (k in t) return t[k]
        if (k === 'fillText') return (s: string) => texts.push(s)
        if (k === 'measureText') return (s: string) => ({ width: s.length * 8 })
        if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) })
        if (k === 'createImageData') return (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })
        return () => ({ addColorStop: () => {}, setTransform: () => {} })
      },
      set: (t, k, v) => ((t[k] = v), true),
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob(['jpg'])))
    // happy-dom has no document.fonts
    Object.defineProperty(document, 'fonts', { value: { load: async () => [] }, configurable: true })
    const list = Array.from({ length: 43 }, (_, i) => ({ id: 'r' + i, title: 'Title ' + i, artist: 'Artist ' + i, status: 'own' }) as Rec)
    await drawShare(list, siteOf({ bg: { kind: 'preset', preset: 'walnut' }, hang: 'peg' }))
    expect(texts).toContain('+ 3 more')
    expect(texts).toContain('Artist 39')
    expect(texts).not.toContain('Artist 40')
    delete (document as { fonts?: unknown }).fonts
  })
})

describe('Share your wall: what Share and Save say', () => {
  const openShare = async (user: U) => {
    await screen.findAllByTestId('sleeve')
    await user.click(screen.getByRole('button', { name: 'Share your wall' }))
    return screen.findByRole('dialog', { name: 'Share your wall' })
  }
  beforeEach(() => {
    draw.mockResolvedValue({ blob: new Blob(['jpg'], { type: 'image/jpeg' }), missedCovers: 0, missedPhoto: false })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pic')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  it('says why a picture couldn’t be saved', async () => {
    const { user } = setup({
      wrap: (n, cap) => (n === 'downloads' ? { save: async () => Promise.reject({ code: 'unavailable', message: 'Disk full' }) } : cap),
    })
    const sheet = await openShare(user)
    await user.click(await within(sheet).findByRole('button', { name: 'Save image' }))
    expect(await within(sheet).findByText("Couldn't save the picture: Disk full")).toBeTruthy()
  })

  it('says nothing when the save is cancelled', async () => {
    const { user } = setup({ opts: { downloads: 'decline' } })
    const sheet = await openShare(user)
    await user.click(await within(sheet).findByRole('button', { name: 'Save image' }))
    await pause(50)
    expect(within(sheet).queryByText(/Saved\.|Couldn't/)).toBeNull()
  })

  it('says to save the image when sharing isn’t available, and nothing when sharing is cancelled', async () => {
    const share = vi.fn(async () => Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' })))
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { canShare: () => true, share }))
    const { user } = setup()
    const sheet = await openShare(user)
    await user.click(await within(sheet).findByRole('button', { name: 'Share' }))
    expect(await within(sheet).findByText("Sharing isn't available here. Save the image instead.")).toBeTruthy()
    share.mockImplementationOnce(async () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })))
    await user.click(within(sheet).getByRole('button', { name: 'Share' }))
    await waitFor(() => expect(within(sheet).queryByText("Sharing isn't available here. Save the image instead.")).toBeNull())
  })
})
