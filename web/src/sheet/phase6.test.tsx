import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../App'
import { AUTO_MATCH, MATCH_TEXT, releaseOf, runJoin, runSides, syncDay, syncLine } from '../model/discogs'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'

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
}
const updates = (fake: Fake, id: string) => fake.calls.filter((c) => c.op === 'update' && c.path === 'records/' + id).map((c) => c.data!)
const legend = (name: string) => screen.getByRole('group', { name })
const release = () => screen.getByRole('textbox', { name: 'Release number' })
const connected = { discogs: { username: 'me', hasToken: true, status: 'ok' } }

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
    expect(within(legend('Your copy')).getByRole('textbox', { name: 'Release number' })).toHaveProperty('value', '7140383')
    expect(screen.getByRole('link', { name: 'Open on Discogs ↗' }).getAttribute('href')).toBe('https://www.discogs.com/release/7140383')
  })

  it('keeps just the number of a pasted link, and makes it the person’s own choice', async () => {
    const { fake, user } = setup({}, connected)
    await edit(user, 'Kind of Blue')
    await user.clear(release())
    await user.click(release())
    await user.paste('https://www.discogs.com/release/12345-Miles-Davis-Kind-Of-Blue')
    expect(release()).toHaveProperty('value', '12345')
    expect(screen.getByText('Waiting to sync…')).toBeTruthy()
    await waitFor(() => expect(updates(fake, 'r1').at(-1)).toEqual({ discogsId: 12345, discogsMatch: '', needsSync: true }))
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

  it('has its own section on a wanted record, with the sync line and the hint for a general release', async () => {
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
    const d = within(legend('Discogs'))
    expect(d.getByText('Synced to your wantlist · Mar 4 · Matched automatically (master release)')).toBeTruthy()
    expect(d.getByText(/points at a general release/)).toBeTruthy()
  })

  it('copies the runout as typed for a Discogs submission', async () => {
    const { user } = setup({}, connected)
    await edit(user, 'Kind of Blue')
    const b = within(legend('Runout')).getByRole('textbox', { name: 'Side B' })
    await user.clear(b)
    await user.type(b, 'NEW')
    await user.click(screen.getByRole('button', { name: 'Copy runout for a Discogs submission' }))
    expect(await navigator.clipboard.readText()).toBe(
      'Matrix / Runout: Side A: AAPJ 8163-45 A · Side B: NEW\n(Observed on my copy: 2015 Analogue Productions 45rpm 2LP, AAPJ 8163-45.)',
    )
    expect(screen.getByText(/Copied\. Paste it into/)).toBeTruthy()
  })

  it('gives an empty field only the hint, unless the last sync found nothing', async () => {
    const { user } = setup(
      { r8: { title: 'Revolver', artist: 'The Beatles', status: 'wish', discogsSync: { state: 'no-match', msg: 'No vinyl pressing found on Discogs.' }, notes: [], added: 8 } },
      connected,
    )
    await edit(user, 'Pet Sounds')
    expect(within(legend('Discogs')).getByText('Leave it empty and a match is found for you.')).toBeTruthy()
    expect(screen.queryByText('Not synced yet')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await user.keyboard('{Escape}')
    await edit(user, 'Revolver')
    expect(within(legend('Discogs')).getByText('No vinyl pressing found on Discogs.')).toBeTruthy()
  })

  it('is not on a record with no runout', async () => {
    const { user } = setup({}, connected)
    await edit(user, 'Blue Train')
    expect(screen.queryByRole('button', { name: /Copy runout/ })).toBeNull()
  })
})

describe('Discogs helpers', () => {
  it('words every value the matcher writes', () => {
    expect(AUTO_MATCH.filter((m) => !MATCH_TEXT[m])).toEqual([])
  })
  it('reads a release number or link', () => {
    expect(releaseOf(' 123 ')).toBe(123)
    expect(releaseOf('r123')).toBe(123)
    expect(releaseOf('https://www.discogs.com/fr/release/456-x')).toBe(456)
    expect(releaseOf('[r7140383]')).toBe(7140383)
    expect(releaseOf('#12')).toBe(12)
    expect(releaseOf('')).toBe('')
    expect(releaseOf('https://www.discogs.com/master/24047')).toBeNull()
  })
  it('shows the year only when it is not this one, and the other states', () => {
    expect(syncDay('2020-01-02 12:00 UTC')).toMatch(/2020/)
    expect(syncLine({ id: 'x', discogsSync: { state: 'error', msg: 'boom' } }, false)).toBe('Sync failed: boom')
    expect(syncLine({ id: 'x', discogsMatch: 'imported from Discogs' }, false)).toBe('Not synced yet · imported from Discogs')
    expect(syncLine({ id: 'x', needsSync: true }, false)).toBe('Waiting to sync…')
  })
  it('reads unlabelled runouts by side and drops empty sides', () => {
    expect(runSides('AA · BB')).toEqual([{ side: 'A', v: 'AA' }, { side: 'B', v: 'BB' }])
    expect(runSides('BB · Side A: AA').map((x) => x.side)).toEqual(['B', 'A'])
    expect(runJoin([{ side: 'A', v: ' x ' }, { side: 'B', v: '' }])).toBe('Side A: x')
  })
})
