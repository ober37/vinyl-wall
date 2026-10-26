// #59 + #79: your shops, in Settings, Search elsewhere and research
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../App'
import { exportFile, lookPatch } from '../model/library'
import { DEFAULT_SHOPS, shopLine, shopLink, shopOrder, shopsOf, shopWhere, siteUrl, type Shop } from '../model/shops'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'

const RECKLESS: Shop = {
  id: 'rk', name: 'Reckless Records', kind: 'local', place: '1532 N Milwaukee Ave, Chicago, IL 60622', phone: '(773) 235-3727',
  email: 'wicker@reckless.com', about: 'Deep used bins; strong on indie and punk.',
}
const DUSTY: Shop = { id: 'dg', name: 'Dusty Groove', kind: 'local', url: 'https://www.dustygroove.com/', search: 'https://www.dustygroove.com/search?q={q}', place: 'Chicago, IL' }
const hunt = {
  h1: {
    title: 'Revolver', artist: 'The Beatles', status: 'wish', notes: [], added: 8,
    researchLog: [{ id: 'a1', at: '2026-10-01', headline: 'Revolver has it.', summary: 'One sentence.', shops: ['Revolver: in stock, $34.99, red variant', 'Elsewhere: nothing'] }],
  },
}

function setup(site: Record<string, unknown> = {}, extra: Record<string, Record<string, unknown>> = {}, opts: Parameters<typeof fakeClaude>[1] = {}) {
  const seed = sample()
  Object.assign(seed.records, extra)
  for (const r of Object.values(seed.records)) Object.assign(r, { coverAsset: 'c', runtime: r.runtime || 40, aboutAt: 1, aboutV: 3 })
  seed.docs['settings/site'] = { taskId: 't1', update: { checkedMs: Date.now() }, ...site }
  const fake = fakeClaude(seed, opts)
  render(
    <RuntimeProvider claude={fake.claude}>
      <App />
    </RuntimeProvider>,
  )
  return { fake, user: userEvent.setup(), site: () => fake.store.settings.site as Record<string, unknown> }
}
type U = ReturnType<typeof userEvent.setup>
const openRecord = async (user: U, title: string) => {
  await user.click(await screen.findByRole('button', { name: new RegExp('Open ' + title) }))
  await screen.findByRole('heading', { name: title })
}
const openShops = async (user: U) => {
  await user.click(await screen.findByRole('button', { name: 'Settings' }))
  const sheet = await screen.findByRole('dialog', { name: 'Settings' })
  await user.click(within(sheet).getByRole('tab', { name: 'Shops' }))
  return sheet
}
const linkNames = () => screen.getAllByRole('link').map((a) => a.textContent)
afterEach(() => localStorage.clear())

describe('shops: the data', () => {
  it('starts with the defaults, and keeps an edited list exactly, even an empty one', () => {
    expect(shopsOf({}).map((s) => s.name)).toEqual(['Revolver', 'Amazon', 'Discogs Marketplace', 'eBay'])
    expect(shopsOf({ shops: [] })).toEqual([])
    expect(shopsOf({ shops: [RECKLESS] })).toEqual([RECKLESS])
  })

  it('drops what would not link or belongs to another kind', () => {
    const [s] = shopsOf({ shops: [{ name: 'X', kind: 'odd', url: 'javascript:alert(1)', search: 'https://x.com/s', place: 'Somewhere' }, { kind: 'local' }] })
    expect(s).toEqual({ id: 's0', name: 'X', kind: 'online' })
    expect(shopsOf({ shops: [{ name: 'S', upc: 'https://s.com/UPC/{upc}', shopify: true }, { name: 'T', upc: 'https://t.com/UPC/', shopify: 'yes' }] })).toEqual([
      { id: 's0', name: 'S', kind: 'online', upc: 'https://s.com/UPC/{upc}', shopify: true },
      { id: 's1', name: 'T', kind: 'online' },
    ])
    expect(siteUrl('reckless.com')).toBe('https://reckless.com/')
    expect(siteUrl('javascript:alert(1)')).toBe('')
  })

  it("searches a shop for the album, else opens its website; Revolver's search is #59's", () => {
    const r = { artist: 'The Beatles', title: 'Revolver' }
    expect(shopLink(DEFAULT_SHOPS[0], r)).toBe('https://shop.revolvermag.com/search?q=The%20Beatles%20Revolver')
    expect(shopLink({ id: 'x', name: 'X', kind: 'online', url: 'https://x.com/' }, r)).toBe('https://x.com/')
    expect(shopLink(RECKLESS, r)).toBe('')
  })

  it('orders local shops with a web store, local without, online, then marketplaces', () => {
    expect(shopOrder([...DEFAULT_SHOPS, RECKLESS, DUSTY]).map((s) => s.name)).toEqual([
      'Dusty Groove', 'Reckless Records', 'Amazon', 'Revolver', 'Discogs Marketplace', 'eBay',
    ])
    expect(shopWhere(RECKLESS)).toBe('Chicago')
    expect(shopWhere(DEFAULT_SHOPS[1])).toBe('amazon.com')
  })

  it('splits a research line into its shop and result', () => {
    expect(shopLine('revolver: in stock', DEFAULT_SHOPS)).toMatchObject({ shop: { id: 'revolver' }, name: 'revolver', rest: 'in stock' })
    expect(shopLine('No colon here', DEFAULT_SHOPS)).toEqual({ name: '', rest: 'No colon here' })
  })

  it('carries the shops in a library file, and an empty wall takes them', () => {
    const f = exportFile({ records: [], gear: [], setups: [], artists: [], settings: { shops: [RECKLESS] }, app: 'x' })
    expect(f.settings!.site!.shops).toEqual([RECKLESS])
    expect(lookPatch({ shops: [RECKLESS, { name: '' }] }, null).shops).toEqual([RECKLESS])
    expect(lookPatch({}, null).shops).toBeUndefined()
  })
})

describe('Search elsewhere', () => {
  it('lists Discogs releases, then your shops under their kind, a local shop without a web store with Call · Email · Map', async () => {
    const { user } = setup({ shops: [DEFAULT_SHOPS[3], RECKLESS, DUSTY] }, hunt)
    await openRecord(user, 'Revolver')
    const names = linkNames()
    expect(names.slice(names.indexOf('Discogs releases ↗'))).toEqual(['Discogs releases ↗', 'Dusty Groove ↗', 'Map', 'Call', 'Email', 'Map', 'eBay ↗'])
    expect(screen.getByRole('heading', { name: 'Local shops' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Marketplaces' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Online shops' })).toBeNull()
    expect(screen.getByText('Reckless Records').tagName).toBe('SPAN')
    expect(screen.getByRole('link', { name: 'Call Reckless Records' }).getAttribute('href')).toBe('tel:7732353727')
    expect(screen.getByRole('link', { name: 'Email Reckless Records' }).getAttribute('href')).toBe('mailto:wicker@reckless.com')
    expect(screen.getByRole('link', { name: 'Map Reckless Records' }).getAttribute('href')).toContain('Reckless%20Records%201532')
    expect(screen.getByText(RECKLESS.about!)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Dusty Groove ↗' }).getAttribute('href')).toBe('https://www.dustygroove.com/search?q=The%20Beatles%20Revolver')
  })

  it("shows what research found at your shops, the shop's name searching it", async () => {
    const { user } = setup({}, hunt)
    await openRecord(user, 'Revolver')
    await user.click(screen.getByRole('button', { name: /Revolver has it/ }))
    const shops = screen.getByRole('heading', { name: 'At your shops' }).parentElement!
    expect(within(shops).getByRole('link', { name: 'Revolver ↗' }).getAttribute('href')).toBe('https://shop.revolvermag.com/search?q=The%20Beatles%20Revolver')
    expect(within(shops).getByText('Elsewhere: nothing')).toBeTruthy()
  })
})

describe('Search elsewhere with no shops', () => {
  it('shows Discogs releases and points an editor to Settings', async () => {
    const { user } = setup({ shops: [] }, hunt)
    await openRecord(user, 'Revolver')
    expect(screen.getByRole('link', { name: 'Discogs releases ↗' })).toBeTruthy()
    expect(screen.getByText('Add your shops in Settings → Shops.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /near me/ })).toBeNull()
  })
})

describe('Settings → Shops', () => {
  it('sits between Wall and Library, grouped by kind', async () => {
    const { user } = setup()
    const sheet = await openShops(user)
    expect(within(sheet).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Wall', 'Shops', 'Library', 'About'])
    for (const name of ['Online shops', 'Marketplaces']) expect(within(sheet).getByRole('group', { name })).toBeTruthy()
    expect(within(sheet).queryByRole('group', { name: 'Local shops' })).toBeNull()
  })

  it('adds a shop by name, kind and website', async () => {
    const { user, site } = setup()
    const sheet = await openShops(user)
    await user.click(within(sheet).getByRole('button', { name: '+ Add a shop' }))
    await user.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'Reckless Records')
    await user.type(within(sheet).getByRole('textbox', { name: 'Website' }), 'reckless.com')
    await user.click(within(sheet).getByRole('button', { name: 'Add shop' }))
    await waitFor(() => expect((site().shops as Shop[]).length).toBe(5))
    expect((site().shops as Shop[])[4]).toMatchObject({ name: 'Reckless Records', kind: 'local', url: 'https://reckless.com/' })
    expect(within(sheet).getByRole('group', { name: 'Local shops' })).toBeTruthy()
  })

  it("edits a shop in place, checks its search link, and Try it searches for a record on the wall", async () => {
    const { user, site } = setup({ shops: [{ ...RECKLESS, upc: 'https://www.reckless.com/UPC/{upc}' }] }, hunt)
    const sheet = await openShops(user)
    await user.click(within(sheet).getByRole('button', { name: /Reckless Records · Chicago/ }))
    expect(within(sheet).getByText('Your Claude chat can fill in the missing details.')).toBeTruthy()
    const search = within(sheet).getByRole('textbox', { name: 'Search link' })
    await user.type(search, 'https://www.reckless.com/search')
    expect(within(sheet).getByText(/Needs to start with https:\/\//)).toBeTruthy()
    await user.type(search, '?q={{q}')
    const tryIt = within(sheet).getByRole('link', { name: /Try it with/ })
    expect(tryIt.getAttribute('href')).toMatch(/^https:\/\/www\.reckless\.com\/search\?q=/)
    await waitFor(() => expect((site().shops as Shop[])[0].search).toBe('https://www.reckless.com/search?q={q}'))
    expect(within(sheet).queryByText('Your Claude chat can fill in the missing details.')).toBeNull()
    // what the chat found, and isn't edited here, stays
    expect((site().shops as Shop[])[0]).toMatchObject({ phone: RECKLESS.phone, email: RECKLESS.email, about: RECKLESS.about, upc: 'https://www.reckless.com/UPC/{upc}' })
  })

  it('removes a shop after asking, and an empty list stays empty', async () => {
    const { user, site } = setup({ shops: [RECKLESS] })
    const sheet = await openShops(user)
    await user.click(within(sheet).getByRole('button', { name: /Reckless Records/ }))
    await user.click(within(sheet).getByRole('button', { name: 'Remove this shop' }))
    await user.click(await screen.findByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(site().shops).toEqual([]))
    expect(within(sheet).getByText('No shops yet.')).toBeTruthy()
  })
})
