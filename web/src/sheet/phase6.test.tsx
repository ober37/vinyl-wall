import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../App'
import { releaseOf, runJoin, runSides, syncProblem } from '../model/discogs'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'
import { openCopies } from './openCopies'

function setup(extra: Record<string, Record<string, unknown>> = {}, site: Record<string, unknown> = {}) {
  const data = sample()
  Object.assign(data.records, extra)
  data.docs['settings/site'] = site
  const fake = fakeClaude(data)
  render(
    <RuntimeProvider claude={fake.claude}>
      <App />
    </RuntimeProvider>,
  )
  return { fake, user: userEvent.setup() }
}
type U = ReturnType<typeof userEvent.setup>
type Fake = ReturnType<typeof fakeClaude>
const edit = async (user: U, title: string) => {
  await user.click(await screen.findByRole('button', { name: new RegExp('Open ' + title) }))
  await screen.findByRole('heading', { name: title })
  await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
  await openCopies(user)
}
const updates = (fake: Fake, id: string) => fake.calls.filter((c) => c.op === 'update' && c.path === 'records/' + id).map((c) => c.data!)
const legend = (name: string) => screen.getByRole('group', { name })
const release = () => screen.getByRole('textbox', { name: 'Discogs release' })
const connected = { discogs: { username: 'me', hasToken: true, status: 'ok' } }

describe('an edit waiting to go to Discogs', () => {
  const done = { status: 'own', coverAsset: 'c', runtime: 40, aboutAt: 1, aboutV: 3, about: { summary: 's' } }
  const recs = {
    s1: { title: 'Edited Album', artist: 'A', needsSync: true, ...done },
    s2: { title: 'Loaded Album', artist: 'B', needsSync: 'check', ...done },
  }
  const sleeve = (t: string) => screen.findByRole('button', { name: new RegExp('^Open ' + t) })

  it('shows as busy like a lookup, while Discogs is connected; a loaded record is checked quietly', async () => {
    const { user } = setup(recs, connected)
    expect((await sleeve('Edited Album')).getAttribute('aria-label')).toMatch(/syncing$/)
    expect((await sleeve('Loaded Album')).getAttribute('aria-label')).not.toMatch(/syncing/)
    await user.click(await sleeve('Edited Album'))
    expect(await screen.findByText('Waiting to sync…')).toBeTruthy()
    // in edit too, on the same line (#121), once
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    expect(screen.getAllByText('Waiting to sync…')).toHaveLength(1)
  })

  it('doesn’t, while Discogs isn’t connected', async () => {
    const { user } = setup(recs)
    expect((await sleeve('Edited Album')).getAttribute('aria-label')).not.toMatch(/syncing/)
    await user.click(await sleeve('Edited Album'))
    await screen.findByRole('heading', { name: 'Edited Album' })
    expect(screen.queryByText('Waiting to sync…')).toBeNull()
  })
})

describe('the runout in edit', () => {
  it('shows each side and saves what is typed in production’s shape', async () => {
    const { fake, user } = setup()
    await edit(user, 'Kind of Blue')
    const run = within(legend('Runout'))
    expect(run.getByRole('textbox', { name: 'Side A' })).toHaveProperty('value', 'AAPJ 8163-45 A')
    const b = run.getByRole('textbox', { name: 'Side B' })
    await user.clear(b)
    await user.type(b, 'XYZ')
    await waitFor(() =>
      expect(updates(fake, 'r1').at(-1)).toEqual({ matrix: 'Side A: AAPJ 8163-45 A · Side B: XYZ', needsSync: true }),
    )
  })

  it('starts a record without one at sides A and B, and adds the next side', async () => {
    const { user } = setup()
    await edit(user, 'Blue Train')
    const run = within(legend('Runout'))
    expect(run.getAllByRole('textbox').map((x) => x.getAttribute('aria-label'))).toEqual(['Side A', 'Side B'])
    await user.click(run.getByRole('button', { name: '+ Add side' }))
    expect(document.activeElement).toBe(run.getByRole('textbox', { name: 'Side C' }))
  })
})

describe('the Discogs release in edit', () => {
  it('sits in Your copy on an owned record, with its link', async () => {
    const { user } = setup()
    await edit(user, 'Kind of Blue')
    expect(within(legend('Your copy')).getByRole('textbox', { name: 'Discogs release' })).toHaveProperty('value', '7140383')
    expect(screen.getByRole('link', { name: 'Open on Discogs ↗' }).getAttribute('href')).toBe('https://www.discogs.com/release/7140383')
  })

  it('keeps just the number of a pasted link, and makes it the person’s own choice', async () => {
    const { fake, user } = setup({}, connected)
    await edit(user, 'Kind of Blue')
    await user.clear(release())
    await user.click(release())
    await user.paste('https://www.discogs.com/release/12345-Miles-Davis-Kind-Of-Blue')
    expect(release()).toHaveProperty('value', '12345')
    await waitFor(() => expect(updates(fake, 'r1').at(-1)).toEqual({ discogsId: 12345, discogsMatch: 'set by you', needsSync: true }))
    expect(screen.getByRole('link', { name: 'Open on Discogs ↗' }).getAttribute('href')).toBe('https://www.discogs.com/release/12345')
  })

  it('says when what is typed is not a release, and saves nothing', async () => {
    const { fake, user } = setup({}, connected)
    await edit(user, 'Kind of Blue')
    await user.clear(release())
    const before = updates(fake, 'r1').length
    await user.type(release(), 'blue')
    expect(screen.getByText('Not a release number or link')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Open on Discogs ↗' })).toBeNull()
    await new Promise((r) => setTimeout(r, 900))
    expect(updates(fake, 'r1').slice(before).some((u) => u.discogsId !== '' && 'discogsId' in u)).toBe(false)
  })

  it('offers Settings when Discogs is not connected', async () => {
    const { user } = setup()
    await edit(user, 'Kind of Blue')
    expect(screen.getByText(/Connect Discogs in/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy()
  })

  it('sits in the copy on a wanted record, with the hint for a general release and no routine sync line (#121)', async () => {
    const { user } = setup(
      {
        r8: {
          title: 'Revolver', artist: 'The Beatles', status: 'wish', discogsId: 99, discogsMatch: 'master main release',
          discogsSync: { state: 'synced', where: 'wantlist', at: new Date().getFullYear() + '-03-04 12:00 UTC', rid: 99 }, notes: [], added: 8,
        },
      },
      connected,
    )
    await edit(user, 'Revolver')
    const d = within(legend('The copy you want'))
    expect(d.queryByText(/Synced to your/)).toBeNull()
    expect(d.getByText(/points at a general release/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Copy runout/ })).toBeNull()
  })

  it('says nothing under an empty field; a sync that found nothing says what to do here, and on the status line', async () => {
    const { user } = setup(
      {
        r8: {
          title: 'Revolver', artist: 'The Beatles', status: 'wish', coverAsset: 'c', runtime: 40, aboutAt: 1, aboutV: 3, about: { summary: 's' },
          discogsSync: { state: 'no-match', msg: 'No vinyl pressing found on Discogs.' }, notes: [], added: 8,
        },
      },
      connected,
    )
    await edit(user, 'Pet Sounds')
    expect(within(legend('The copy you want')).queryByText(/Leave it empty|Paste the number/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await user.keyboard('{Escape}')
    await edit(user, 'Revolver')
    expect(within(legend('The copy you want')).getByText('Paste the number from its Discogs URL.')).toBeTruthy()
    expect(screen.getByText('No vinyl pressing found on Discogs')).toBeTruthy()
    // the lookup is still there, apart from the problem
    expect(screen.getByRole('button', { name: 'Look up details again' })).toBeTruthy()
  })

  it('a sync that failed shows on the status line in view, only while Discogs is connected', async () => {
    const rec = { r8: { title: 'Revolver', artist: 'The Beatles', status: 'wish', coverAsset: 'c', runtime: 40, aboutAt: 1, aboutV: 3, about: { summary: 's' }, discogsSync: { state: 'error', msg: 'boom' }, notes: [], added: 8 } }
    const { fake, user } = setup(rec, connected)
    await user.click(await screen.findByRole('button', { name: /Open Revolver/ }))
    // not why: that's for Claude; Retry marks it to sync again and starts the task
    expect(await screen.findByText('Sync failed')).toBeTruthy()
    expect(screen.queryByText(/boom/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(updates(fake, 'r8').at(-1)).toEqual({ needsSync: true }))
    expect(await screen.findByText('Waiting to sync…')).toBeTruthy()
  })
})

describe('Discogs helpers', () => {
  it('reads a release number or link', () => {
    expect(releaseOf(' 123 ')).toBe(123)
    expect(releaseOf('r123')).toBe(123)
    expect(releaseOf('https://www.discogs.com/fr/release/456-x')).toBe(456)
    expect(releaseOf('[r7140383]')).toBe(7140383)
    expect(releaseOf('#12')).toBe(12)
    expect(releaseOf('')).toBe('')
    expect(releaseOf('https://www.discogs.com/master/24047')).toBeNull()
  })
  it('names only what went wrong with a sync, and nothing while Discogs is off or an edit waits (#121)', () => {
    expect(syncProblem({ id: 'x', discogsSync: { state: 'error', msg: 'boom' } }, true)).toBe('Sync failed')
    expect(syncProblem({ id: 'x', discogsSync: { state: 'no-match' } }, true)).toBe('No vinyl pressing found on Discogs')
    expect(syncProblem({ id: 'x', discogsSync: { state: 'synced' } }, true)).toBe('')
    expect(syncProblem({ id: 'x', discogsSync: { state: 'error' } }, false)).toBe('')
    expect(syncProblem({ id: 'x', needsSync: true, discogsSync: { state: 'error' } }, true)).toBe('')
  })
  it('reads unlabelled runouts by side and drops empty sides', () => {
    expect(runSides('AA · BB')).toEqual([{ side: 'A', v: 'AA' }, { side: 'B', v: 'BB' }])
    expect(runSides('BB · Side A: AA').map((x) => x.side)).toEqual(['B', 'A'])
    expect(runJoin([{ side: 'A', v: ' x ' }, { side: 'B', v: '' }])).toBe('Side A: x')
  })
})
