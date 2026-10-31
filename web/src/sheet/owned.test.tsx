import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../App'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'
import { openCopies } from './openCopies'

// several owned pressings on one record (#121)
const BLUE = {
  title: 'Blue Train', artist: 'John Coltrane', status: 'own', year: '1957', added: 1, notes: [], copyName: 'Mono', pressing: '1957 mono first', label: 'Blue Note',
  catalog: 'BLP 1577', discogsId: 30, mediaGrade: 'VG+', sleeveGrade: 'VG', paid: '400', shop: 'Amoeba', acquired: '2020-05-01',
  ownedCopies: [
    { name: 'Stereo', pressing: '1966 stereo reissue', label: 'Blue Note', catalog: 'BST 81577', matrix: 'Side A: BN 1577-A', discogsId: 31, mediaGrade: 'NM', sleeveGrade: 'NM',
      paid: '35', shop: 'Rough Trade', shopUrl: '', acquired: '2023-01-02' },
  ],
}
const SOLO = {
  title: 'Giant Steps', artist: 'John Coltrane', status: 'own', added: 2, notes: [], pressing: '2015 reissue', discogsId: 40, paid: '30',
  moreCopies: [{ name: '6-eye', pressing: '1959 six-eye', label: 'Columbia', catalog: 'CL 1355', budget: '500', discogsId: 41, buyLinks: ['https://a.com/x', 'https://b.com/y'] }],
}

function setup(extra: Record<string, Record<string, unknown>> = { r3: BLUE, k1: SOLO }, site?: Record<string, unknown>) {
  const data = sample()
  Object.assign(data.records, extra)
  if (site) data.docs['settings/site'] = site
  const fake = fakeClaude(data, {})
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

describe('several owned copies (#121)', () => {
  it('About lists each copy under its name with its grades, all folded, each with its own Discogs link', async () => {
    const { user } = setup()
    await open(user, 'Blue Train')
    await user.click(screen.getByRole('tab', { name: 'About' }))
    const g = screen.getByRole('group', { name: 'Your copies' })
    const first = within(g).getByRole('button', { name: /Mono.*VG\+ \/ VG/ })
    expect(first.getAttribute('aria-expanded')).toBe('false')
    await user.click(first)
    const second = within(g).getByRole('button', { name: /Stereo.*NM \/ NM/ })
    expect(second.getAttribute('aria-expanded')).toBe('false')
    await user.click(second)
    expect(within(g).getByText('1966 stereo reissue')).toBeTruthy()
    const pressings = within(g).getAllByRole('link', { name: /Your pressing/ }).map((a) => a.getAttribute('href'))
    expect(pressings).toEqual(['https://www.discogs.com/release/30', 'https://www.discogs.com/release/31'])
  })

  it('a record with one copy still says Your copy', async () => {
    const { user } = setup()
    await open(user, 'Giant Steps')
    await user.click(screen.getByRole('tab', { name: 'About' }))
    expect(screen.getByRole('group', { name: 'Your copy' })).toBeTruthy()
  })

  it("edits another copy's fields into ownedCopies, and Discogs sync hears of it", async () => {
    const { fake, user } = setup()
    await open(user, 'Blue Train')
    await user.click(btn('Edit'))
    const g = screen.getByRole('group', { name: 'Your copies' })
    // every copy folded to start
    expect(within(g).queryAllByRole('textbox', { name: 'Paid' })).toHaveLength(0)
    await user.click(within(g).getByRole('button', { name: /Mono.*VG\+ \/ VG/ }))
    await user.click(within(g).getByRole('button', { name: /Stereo.*NM \/ NM/ }))
    const paid = within(g).getAllByRole('textbox', { name: 'Paid' })
    await user.clear(paid[1])
    await user.type(paid[1], '$40')
    await user.click(btn('Done'))
    await waitFor(() => expect(updates(fake, 'r3').at(-1)).toEqual({ ownedCopies: [{ ...BLUE.ownedCopies[0], paid: '40' }], needsSync: true }))
  })

  it("picking a saved shop for another copy keeps both its name and its website", async () => {
    const shop = { id: 'sr', name: 'Siren Records', kind: 'local', url: 'https://sirenrecordsmchenry.com/' }
    const { fake, user } = setup({ r3: { ...BLUE, ownedCopies: [{ ...BLUE.ownedCopies[0], shop: '', shopUrl: '' }] } }, { shops: [shop] })
    await open(user, 'Blue Train')
    await user.click(btn('Edit'))
    await openCopies(user)
    const box = screen.getAllByRole('combobox', { name: 'Bought from' })[1]
    await user.type(box, 'sir')
    await user.click(await screen.findByRole('option', { name: 'Siren Records' }))
    await user.click(btn('Done'))
    await waitFor(() => expect((updates(fake, 'r3').at(-1)!.ownedCopies as { shop: string; shopUrl: string }[])[0]).toMatchObject({ shop: 'Siren Records', shopUrl: 'https://sirenrecordsmchenry.com/' }))
  })

  it('label and catalog number sit in Your copy, not with the album', async () => {
    const { user } = setup()
    await open(user, 'Giant Steps')
    await user.click(btn('Edit'))
    await openCopies(user)
    expect(within(screen.getByRole('group', { name: 'Your copy' })).getByRole('textbox', { name: 'Catalog no.' })).toBeTruthy()
    expect(within(screen.getByRole('group', { name: 'The record' })).queryByRole('textbox', { name: 'Label' })).toBeNull()
  })

  it('+ Add another copy you own adds an empty copy at once', async () => {
    const { fake, user } = setup()
    await open(user, 'Giant Steps')
    await user.click(btn('Edit'))
    await openCopies(user)
    await user.click(btn('+ Add another copy you own'))
    await waitFor(() => expect(updates(fake, 'k1').at(-1)).toMatchObject({ ownedCopies: [{ name: '', pressing: '', discogsId: '' }], needsSync: true }))
    const g = screen.getByRole('group', { name: 'Your copies' })
    // it opens with the cursor in its name, under "Copy 2"
    expect(within(g).getByRole('button', { name: 'Copy 2' }).getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(within(g).getAllByRole('textbox', { name: 'Name' })[1])
  })

  it('an owned record wanting no other copy says so, and can start wanting one', async () => {
    const { fake, user } = setup()
    await open(user, 'Blue Train')
    await user.click(btn('Edit'))
    const g = screen.getByRole('group', { name: 'The copies you still want' })
    expect(within(g).getByText('None yet.')).toBeTruthy()
    await user.click(within(g).getByRole('button', { name: '+ Add a copy you want' }))
    await waitFor(() => expect(updates(fake, 'r3').at(-1)).toMatchObject({ moreCopies: [{ name: '', budget: '' }], needsSync: true }))
    expect(screen.getByRole('button', { name: '+ Add another copy you want' })).toBeTruthy()
  })

  it('removing the first copy, after asking, moves the next into its place', async () => {
    const { fake, user } = setup()
    await open(user, 'Blue Train')
    await user.click(btn('Edit'))
    await openCopies(user)
    await user.click(screen.getAllByRole('button', { name: 'Remove this copy' })[0])
    expect(screen.getByRole('alertdialog', { name: 'Remove Mono from your copies?' })).toBeTruthy()
    await user.click(btn('Remove'))
    await waitFor(() =>
      expect(updates(fake, 'r3').at(-1)).toMatchObject({
        copyName: 'Stereo', pressing: '1966 stereo reissue', catalog: 'BST 81577', matrix: 'Side A: BN 1577-A', discogsId: 31, mediaGrade: 'NM', paid: '35',
        shop: 'Rough Trade', acquired: '2023-01-02', ownedCopies: [], needsSync: true,
      }),
    )
  })

  it('Got this copy asks which link it came from and what was paid, then it joins your copies', async () => {
    const { fake, user } = setup()
    await open(user, 'Giant Steps')
    await user.click(screen.getByRole('tab', { name: 'Pressings' }))
    await user.click(btn(/6-eye/))
    await user.click(btn('Got this copy'))
    await user.click(btn('b.com'))
    await user.type(screen.getByRole('textbox', { name: 'Paid' }), '450')
    await user.click(btn('Save'))
    await waitFor(() => {
      const u = updates(fake, 'k1').at(-1)!
      expect(u).toMatchObject({
        moreCopies: [],
        ownedCopies: [{ name: '6-eye', pressing: '1959 six-eye', label: 'Columbia', catalog: 'CL 1355', discogsId: 41, paid: '450', shopUrl: 'https://b.com/y' }],
        needsSync: true,
      })
      expect((u.notes as { t: string }[]).at(-1)!.t).toMatch(/^Found another copy · \$450 from b\.com/)
    })
    expect(screen.getByText('Added to your copies. Bought today.')).toBeTruthy()
  })

  it("search finds a record by another copy's catalog number", async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: /Search/ }))
    await user.type(screen.getByRole('searchbox'), 'BST 81577')
    await waitFor(() => expect(screen.queryByRole('button', { name: /Open Giant Steps/ })).toBeNull())
    expect(screen.getByRole('button', { name: /Open Blue Train/ })).toBeTruthy()
  })
})
