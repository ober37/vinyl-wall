// #59 + #79: your shops, in Settings, Search elsewhere and research
import { readFileSync } from 'node:fs'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../App'
import { doneMessage, exportFile, lookPatch, planImport, planSummary, shopsFrom, type Plan } from '../model/library'
import { atShow, DEFAULT_SHOPS, mergeShops, sameSite, shopLine, shopLink, shopOf, shopOrder, shopSite, shopSuggest, shopsOf, shopWhere, siteUrl, unlistedShops, type Shop } from '../model/shops'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'
import type { Rec } from '../model/record'

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
    for (const bad of ['https://slashorg./', 'slashorg', 'shop.c']) expect(siteUrl(bad)).toBe('')
    expect(siteUrl('https://www.slash.org/x')).toBe('https://www.slash.org/x')
  })

  it("searches a shop for the album, else the web within its website until its search is found; Revolver's search is #59's", () => {
    const r = { artist: 'The Beatles', title: 'Revolver' }
    expect(shopLink(DEFAULT_SHOPS[0], r)).toBe('https://shop.revolvermag.com/search?q=The%20Beatles%20Revolver')
    expect(shopLink({ id: 'x', name: 'X', kind: 'online', url: 'https://www.storeus.example.com/shop' }, r)).toBe(
      'https://www.google.com/search?q=site%3Astoreus.example.com%20The%20Beatles%20Revolver',
    )
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
    // every kind, and what the chat found, round-trips
    const all = [RECKLESS, DUSTY, { ...DEFAULT_SHOPS[0], shopify: true }, DEFAULT_SHOPS[3], { id: 'sr', name: 'Siren Records', kind: 'local', upc: 'https://sirenrecordsmchenry.com/UPC/{upc}' }]
    const out = exportFile({ records: [], gear: [], setups: [], artists: [], settings: { shops: all }, app: 'x' })
    expect(lookPatch(JSON.parse(JSON.stringify(out)).settings.site, null).shops).toEqual(all)
  })
})

describe('shops: importing into a wall with records', () => {
  const file = (shops: unknown[], records: Record<string, unknown> = {}) =>
    JSON.stringify({ vinylWall: 1, records, settings: { site: { shops } } })
  const wall = { records: [{ id: 'r1', title: 'Ten', artist: 'Pearl Jam' }], artists: [], gear: [], setups: [] }
  const siren: Shop = { id: 'sr', name: 'Siren Records', kind: 'local', upc: 'https://sirenrecordsmchenry.com/UPC/{upc}', phone: '815-347-8363' }

  it('adds the shops the wall lacks and fills in only what a shop is missing', () => {
    const mine: Shop = { id: 'm', name: 'siren records', kind: 'local', phone: '555-0100' }
    const m = mergeShops([mine, DEFAULT_SHOPS[0]], [siren, { ...DEFAULT_SHOPS[0], url: 'https://elsewhere.example/' }, DUSTY])
    expect(m.list).toEqual([{ ...mine, upc: siren.upc }, DEFAULT_SHOPS[0], DUSTY])
    expect([m.added, m.filled]).toEqual([1, 1])
    // an online shop doesn't take a local shop's contact details
    expect(mergeShops([{ id: 'o', name: 'X', kind: 'online' }], [{ id: 'x', name: 'X', kind: 'local', phone: '1' }]).filled).toBe(0)
  })

  it("starts from the wall's defaults, and says what it will do", () => {
    const p = planImport(file([siren]), wall) as Plan
    expect(p.shops).toEqual({ added: 1, filled: 0 })
    expect(planSummary(p)).toBe('Adds 1 shop.')
    expect(doneMessage(p, [])).toBe('Added 1 shop.')
    expect(shopsFrom({}, p.site)!.list.map((s) => s.name)).toEqual(['Revolver', 'Amazon', 'Discogs Marketplace', 'eBay', 'Siren Records'])
    const q = planImport(file([siren], { r2: { title: 'Vs.', artist: 'Pearl Jam' } }), { ...wall, settings: { shops: [{ ...siren, phone: '' }] } }) as Plan
    expect(planSummary(q)).toBe('Adds 1 record. Fills in missing details on 1 shop you already have.')
    expect(doneMessage(q, [])).toBe('Added 1 record. Filled in missing details on 1 shop.')
  })

  it('has nothing to do when the wall already has those shops', () => {
    expect(planImport(file([DEFAULT_SHOPS[0]]), wall)).toBe('Everything in this file is already on the wall.')
  })
})

describe('Search elsewhere', () => {
  it('lists every pressing on Discogs, then your shops under their kind, a local shop without a web store with Call · Email · Map', async () => {
    const { user } = setup({ shops: [DEFAULT_SHOPS[3], RECKLESS, DUSTY] }, hunt)
    await openRecord(user, 'Revolver')
    await user.click(screen.getByRole('tab', { name: 'Search' }))
    const names = linkNames()
    expect(names.slice(names.indexOf('Every pressing on Discogs ↗'))).toEqual(['Every pressing on Discogs ↗', 'Dusty Groove ↗', 'Map', 'Call', 'Email', 'Map', 'eBay ↗'])
    expect(screen.getByRole('heading', { name: 'Pressings' })).toBeTruthy()
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
    await user.click(screen.getByRole('tab', { name: 'Research' }))
    await user.click(screen.getByRole('button', { name: /Revolver has it/ }))
    const shops = screen.getByRole('heading', { name: 'At your shops' }).parentElement!
    expect(within(shops).getByRole('link', { name: 'Revolver ↗' }).getAttribute('href')).toBe('https://shop.revolvermag.com/search?q=The%20Beatles%20Revolver')
    expect(within(shops).getByText('Elsewhere: nothing')).toBeTruthy()
  })
})

describe('Search elsewhere with no shops', () => {
  it('shows every pressing on Discogs and points an editor to Settings', async () => {
    const { user } = setup({ shops: [] }, hunt)
    await openRecord(user, 'Revolver')
    await user.click(screen.getByRole('tab', { name: 'Search' }))
    expect(screen.getByRole('link', { name: 'Every pressing on Discogs ↗' })).toBeTruthy()
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
    // a website makes it online, unless a kind is picked
    expect((site().shops as Shop[])[4]).toMatchObject({ name: 'Reckless Records', kind: 'online', url: 'https://reckless.com/' })
    await user.click(within(sheet).getByRole('button', { name: '+ Add a shop' }))
    await user.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'Dusty Groove')
    await user.click(within(sheet).getByRole('button', { name: 'Local' }))
    await user.type(within(sheet).getByRole('textbox', { name: 'Website' }), 'dustygroove.com')
    await user.click(within(sheet).getByRole('button', { name: 'Add shop' }))
    await waitFor(() => expect((site().shops as Shop[]).length).toBe(6))
    expect((site().shops as Shop[])[5]).toMatchObject({ name: 'Dusty Groove', kind: 'local' })
    expect(within(sheet).getByRole('group', { name: 'Local shops' })).toBeTruthy()
  })

  it('edits a shop in place with no search link to type, keeping what was found for it', async () => {
    const found = { url: 'https://www.reckless.com/', search: 'https://www.reckless.com/search?q={q}', upc: 'https://www.reckless.com/UPC/{upc}', shopify: true, searchTried: 5 }
    const { user, site } = setup({ shops: [{ ...RECKLESS, ...found }] }, hunt)
    const sheet = await openShops(user)
    await user.click(within(sheet).getByRole('button', { name: /Reckless Records · Chicago/ }))
    expect(within(sheet).queryByRole('textbox', { name: 'Search link' })).toBeNull()
    expect(within(sheet).queryByText('Your Claude chat can fill in the missing details.')).toBeNull()
    await user.type(within(sheet).getByRole('textbox', { name: 'Name' }), ' Wicker Park')
    await waitFor(() => expect((site().shops as Shop[])[0].name).toBe('Reckless Records Wicker Park'))
    // what the chat or the background task found, and isn't edited here, stays
    expect((site().shops as Shop[])[0]).toMatchObject({ ...found, phone: RECKLESS.phone, email: RECKLESS.email, about: RECKLESS.about })
  })

  it('leaves finding a search link to the chat skill and the background task', () => {
    const skill = readFileSync(`${import.meta.dirname}/../../../skills/vinyl-wall/SKILL.md`, 'utf8')
    expect(skill).toMatch(/A shop with a website but no `search`: find its search .*and save it to the shop/)
    expect(skill).toMatch(/When you save a `search`, write the shop without `searchTried`/)
    expect(skill).toMatch(/\*\*Re-checking a shop's search:\*\*/)
    const task = readFileSync(`${import.meta.dirname}/../../../tasks/background-task.md`, 'utf8')
    expect(task).toMatch(/path "tools\/shop_search\.py"/)
    const setup = readFileSync(`${import.meta.dirname}/../../../SETUP.md`, 'utf8')
    expect(setup).toMatch(/"tools\/shop_search\.py": \{"from": "app\/tools\/shop_search\.py"/)
  })

  it('drops what was found for a shop when its website changes, so it is found again', async () => {
    const { user, site } = setup({ shops: [{ ...DUSTY, upc: 'https://www.dustygroove.com/UPC/{upc}', searchTried: 1 }] }, hunt)
    const sheet = await openShops(user)
    await user.click(within(sheet).getByRole('button', { name: /Dusty Groove/ }))
    const web = within(sheet).getByRole('textbox', { name: 'Web store' })
    await user.clear(web)
    await user.type(web, 'dustygroove.net')
    await waitFor(() => expect((site().shops as Shop[])[0].url).toBe('https://dustygroove.net/'))
    for (const k of ['search', 'upc', 'searchTried']) expect((site().shops as Shop[])[0], k).not.toHaveProperty(k)
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

// #89: records linked to the shops they came from
const SIREN: Shop = {
  id: 'sr', name: 'Siren Records', kind: 'local', url: 'https://sirenrecordsmchenry.com/', place: '3424 W Elm St, McHenry, IL 60050', phone: '(815) 385-1122',
}
const bought = {
  b1: { title: 'Ten', artist: 'Pearl Jam', status: 'own', notes: [], added: 9, shop: 'siren', shopUrl: 'https://www.sirenrecordsmchenry.com/products/ten', paid: '30' },
  b2: { title: 'Vs.', artist: 'Pearl Jam', status: 'ordered', notes: [], added: 10, shop: 'Siren Records' },
  b3: { title: 'Yield', artist: 'Pearl Jam', status: 'own', notes: [], added: 11, shop: "Joe's Records", shopUrl: 'https://www.discogs.com/seller/joes' },
}

describe('shops: the shop a record came from', () => {
  const list = [SIREN, ...DEFAULT_SHOPS]
  it('matches by website, then by name, a shared website settled by name', () => {
    expect(shopOf(bought.b1, list)?.id).toBe('sr')
    expect(shopOf(bought.b2, list)?.id).toBe('sr')
    expect(shopOf(bought.b3, list)?.id).toBe('discogs')
    expect(shopOf({ shop: 'Nowhere' }, list)).toBeUndefined()
    const chain = [{ ...SIREN, id: 'a', name: 'Amoeba Hollywood', url: 'https://amoeba.com/' }, { ...SIREN, id: 'b', name: 'Amoeba Berkeley', url: 'https://amoeba.com/' }]
    expect(shopOf({ shop: 'amoeba berkeley', shopUrl: 'https://www.amoeba.com/x' }, chain)?.id).toBe('b')
    expect(shopOf({ shop: 'Amoeba', shopUrl: 'https://www.amoeba.com/x' }, chain)).toBeUndefined()
  })

  it('matches a name with words from the shop\'s place added, and nothing else (#114)', () => {
    for (const shop of ['Siren Records McHenry', 'Siren Records, McHenry', 'Siren Records (McHenry)', 'Siren Records - McHenry', 'siren records mchenry il'])
      expect(shopOf({ shop }, list)?.id, shop).toBe('sr')
    for (const shop of ['Siren Records Annex', 'Siren', 'Records McHenry', 'McHenry Siren Records'])
      expect(shopOf({ shop }, list), shop).toBeUndefined()
    expect(unlistedShops([{ ...bought.b2, shop: 'Siren Records McHenry' }] as unknown as Rec[], list)).toEqual([])
  })

  it('lists the shops not on your list by name, with a count and a website, leaving out wanted and example records', () => {
    const recs = [
      ...Object.values(bought),
      { title: 'A', artist: 'X', status: 'own', shop: 'Rough Trade', shopUrl: 'https://www.roughtrade.com/en-us/p/a' },
      { title: 'B', artist: 'X', status: 'ordered', shop: 'rough trade' },
      { title: 'C', artist: 'X', status: 'wish', shop: 'Elsewhere' },
      { title: 'D', artist: 'X', status: 'own', shop: 'Example Shop', example: true },
    ]
    expect(unlistedShops(recs as unknown as Rec[], list)).toEqual([{ name: 'Rough Trade', url: 'https://www.roughtrade.com/', count: 2 }])
  })
})

describe('shops: a record bought at a show (#117)', () => {
  const list = [SIREN, ...DEFAULT_SHOPS]
  const booth = 'Merch booth at Bilmuri - Kinda Hard Tour in Landmark Credit Union Live — Milwaukee, WI'
  it('knows a show from its words, and not a shop that only looks like one', () => {
    for (const shop of [booth, 'Merch table, Riot Fest', 'Concert in Chicago', 'Pitchfork Music Festival', 'At the show', 'Sleep Token tour'])
      expect(atShow(shop), shop).toBe(true)
    for (const shop of ['Siren Records', 'The Record Showroom', 'Tourist Trap Vinyl', '', undefined]) expect(atShow(shop), String(shop)).toBe(false)
  })

  it('never offers a show for the list, while an ordinary unlisted shop still is', () => {
    const recs = [
      { title: 'A', artist: 'Bilmuri', status: 'own', shop: booth },
      { title: 'B', artist: 'X', status: 'own', shop: 'Rough Trade' },
    ]
    expect(unlistedShops(recs as unknown as Rec[], list)).toEqual([{ name: 'Rough Trade', url: '', count: 1 }])
  })

  it("is what the chat skill saves for one, and the skill saves a listed shop's exact name and website", () => {
    const skill = readFileSync(`${import.meta.dirname}/../../../skills/vinyl-wall/SKILL.md`, 'utf8')
    const saved = skill.match(/Save `shop` as `"(Merch booth at [^"]+)"`/)?.[1]
    expect(saved).toBeTruthy()
    expect(atShow(saved)).toBe(true)
    expect(skill).toMatch(/don't offer to add it to their shops/)
    expect(skill).toMatch(/save that shop's exact `name` as `shop` and its `url` as `shopUrl`/)
  })

  it('shows where it was bought on the sheet, as written and not as a link', async () => {
    const { user } = setup({}, { s1: { title: 'Kinda Hard', artist: 'Bilmuri', status: 'own', notes: [], added: 1, shop: booth, paid: '30' } })
    await openRecord(user, 'Kinda Hard')
    await user.click(screen.getByRole('tab', { name: 'About' }))
    expect(screen.getByText(booth).tagName).toBe('SPAN')
  })
})

describe('record sheet: the shop it came from', () => {
  it("uses the listed shop's name, keeps the record's own link, and adds Call · Map for a local shop", async () => {
    const { user } = setup({ shops: [SIREN] }, bought)
    await openRecord(user, 'Ten')
    await user.click(screen.getByRole('tab', { name: 'About' }))
    const a = screen.getByRole('link', { name: 'Siren Records ↗' })
    expect(a.getAttribute('href')).toBe('https://www.sirenrecordsmchenry.com/products/ten')
    expect(screen.getByRole('link', { name: 'Call Siren Records' }).getAttribute('href')).toBe('tel:8153851122')
    expect(screen.getByRole('link', { name: 'Map Siren Records' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Email Siren Records' })).toBeNull()
  })

  it("links an order to the shop's web store when it has no link of its own", async () => {
    const { user } = setup({ shops: [SIREN] }, bought)
    await openRecord(user, 'Vs.')
    expect(screen.getByRole('link', { name: 'Siren Records ↗' }).getAttribute('href')).toBe('https://sirenrecordsmchenry.com/')
    expect(screen.getByRole('link', { name: 'Call Siren Records' })).toBeTruthy()
  })

  it("keeps a marketplace seller's own name and link", async () => {
    const { user } = setup({}, bought)
    await openRecord(user, 'Yield')
    await user.click(screen.getByRole('tab', { name: 'About' }))
    expect(screen.getByRole('link', { name: "Joe's Records ↗" }).getAttribute('href')).toBe('https://www.discogs.com/seller/joes')
    expect(linkNames()).not.toContain('Discogs Marketplace ↗')
  })
})

describe('Settings → Shops: not on your list yet', () => {
  it('lists the shops your records came from, and Add starts one from them and opens it', async () => {
    const { user, site } = setup({ shops: [RECKLESS] }, bought)
    const sheet = await openShops(user)
    const group = within(sheet).getByRole('group', { name: 'Not on your list yet' })
    expect(group.textContent).toContain('Siren Records · 1 record')
    expect(group.textContent).toContain('siren · 1 record')
    await user.click(within(group).getByRole('button', { name: 'Add Siren Records' }))
    expect((within(sheet).getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('Siren Records')
    await user.click(within(sheet).getByRole('button', { name: 'Add shop' }))
    await waitFor(() => expect((site().shops as Shop[]).length).toBe(2))
    expect((site().shops as Shop[])[1]).toMatchObject({ name: 'Siren Records', kind: 'local' })
    expect(within(sheet).getByRole('button', { name: /Siren Records/ }).getAttribute('aria-expanded')).toBe('true')
    // Vs. now matches it by name; Ten's "siren" doesn't, the new shop having no website
    const left = within(sheet).getByRole('group', { name: 'Not on your list yet' }).textContent
    expect(left).not.toContain('Siren Records')
    expect(left).toContain('siren · 1 record')
  })

  it('starts a shop with a website as online, filled in', async () => {
    const { user } = setup({ shops: [] }, { b1: bought.b1 })
    const sheet = await openShops(user)
    await user.click(within(sheet).getByRole('button', { name: 'Add siren' }))
    expect((within(sheet).getByRole('textbox', { name: 'Website' }) as HTMLInputElement).value).toBe('https://www.sirenrecordsmchenry.com/')
    expect(within(sheet).getByRole('button', { name: 'Online', pressed: true })).toBeTruthy()
  })

  it("won't add a website that isn't a web address", async () => {
    const { user } = setup({ shops: [] }, { b2: bought.b2 })
    const sheet = await openShops(user)
    await user.click(within(sheet).getByRole('button', { name: 'Add Siren Records' }))
    await user.type(within(sheet).getByRole('textbox', { name: 'Website' }), 'https://slashorg./')
    expect(within(sheet).getByText('Needs a web address like shop.example.com.')).toBeTruthy()
    expect(within(sheet).getByRole('button', { name: 'Add shop' })).toHaveProperty('disabled', true)
  })

  it('turns online when a website is typed into one started without', async () => {
    const { user } = setup({ shops: [] }, { b2: bought.b2 })
    const sheet = await openShops(user)
    await user.click(within(sheet).getByRole('button', { name: 'Add Siren Records' }))
    expect(within(sheet).getByRole('button', { name: 'Local', pressed: true })).toBeTruthy()
    await user.type(within(sheet).getByRole('textbox', { name: 'Website' }), 'sirenrecordsmchenry.com')
    expect(within(sheet).getByRole('button', { name: 'Online', pressed: true })).toBeTruthy()
  })

  it('hides one, and Show them brings it back', async () => {
    const { user, site } = setup({ shops: [] }, bought)
    const sheet = await openShops(user)
    const group = () => within(sheet).getByRole('group', { name: 'Not on your list yet' })
    await user.click(within(group()).getByRole('button', { name: 'Hide Siren Records' }))
    await waitFor(() => expect(site().shopsHidden).toEqual(['siren records']))
    expect(group().textContent).not.toContain('Siren Records')
    expect(group().textContent).toContain('1 hidden')
    await user.click(within(group()).getByRole('button', { name: 'Show them' }))
    await waitFor(() => expect(site().shopsHidden).toEqual([]))
    expect(group().textContent).toContain('Siren Records · 1 record')
  })
})

// #99: your shops suggested where a record came from
describe('shops: suggested as you type', () => {
  const list = [SIREN, RECKLESS, DUSTY, ...DEFAULT_SHOPS]
  it('suggests names with what is typed, those starting with it first, up to 5, none when empty or exact', () => {
    expect(shopSuggest(list, '')).toEqual([])
    expect(shopSuggest(list, 'siren records')).toEqual([])
    expect(shopSuggest(list, 're')).toEqual(['Reckless Records', 'Revolver', 'Siren Records'])
    expect(shopSuggest(list, 'o')).toHaveLength(5)
    expect(shopSuggest(list, 'zzz')).toEqual([])
  })

  it('in Edit, picking one fills in its name and leaves the link as it was', async () => {
    const { user, fake } = setup({ shops: [SIREN] }, bought)
    await openRecord(user, 'Ten')
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const box = screen.getByRole('combobox', { name: 'Bought from' })
    await user.clear(box)
    await user.type(box, 'sir')
    await user.click(await screen.findByRole('option', { name: 'Siren Records' }))
    expect((box as HTMLInputElement).value).toBe('Siren Records')
    expect(screen.queryByRole('option')).toBeNull()
    await waitFor(() => expect((fake.store.records as Record<string, Record<string, unknown>>).b1).toMatchObject({ shop: 'Siren Records', shopUrl: 'https://www.sirenrecordsmchenry.com/products/ten' }))
  })

  it("fills in a listed shop's website, not a marketplace's, and keeps a link already at the shop", () => {
    expect(shopSite(list, 'siren records')).toBe('https://sirenrecordsmchenry.com/')
    expect(shopSite(list, 'Discogs Marketplace')).toBe('')
    expect(shopSite(list, 'Nowhere')).toBe('')
    expect(sameSite('https://www.sirenrecordsmchenry.com/products/ten', 'https://sirenrecordsmchenry.com/')).toBe(true)
    expect(sameSite('https://roughtrade.com/x', 'https://sirenrecordsmchenry.com/')).toBe(false)
    expect(sameSite('', 'https://sirenrecordsmchenry.com/')).toBe(false)
  })

  it("in Edit, picking one on a record with another shop's link fills in the shop's website", async () => {
    const { user, fake } = setup({ shops: [SIREN] }, { b4: { ...bought.b1, title: 'No Code', shop: 'Rough Trade', shopUrl: 'https://roughtrade.com/x' } })
    await openRecord(user, 'No Code')
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const box = screen.getByRole('combobox', { name: 'Bought from' })
    await user.clear(box)
    await user.type(box, 'sir')
    await user.click(await screen.findByRole('option', { name: 'Siren Records' }))
    expect((screen.getByRole('textbox', { name: 'Shop website' }) as HTMLInputElement).value).toBe('https://sirenrecordsmchenry.com/')
    await waitFor(() => expect((fake.store.records as Record<string, Record<string, unknown>>).b4).toMatchObject({ shop: 'Siren Records', shopUrl: 'https://sirenrecordsmchenry.com/' }))
  })

  it('Ordered it: a listed shop with no link of the copy gives its website', async () => {
    const want = { w2: { title: 'Gigaton', artist: 'Pearl Jam', status: 'wish', notes: [], added: 13 } }
    const { user, fake } = setup({ shops: [SIREN] }, want)
    await openRecord(user, 'Gigaton')
    await user.click(screen.getByRole('button', { name: 'Ordered it' }))
    await user.type(screen.getByRole('combobox', { name: 'From' }), 'sir')
    await user.click(await screen.findByRole('option', { name: 'Siren Records' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect((fake.store.records as Record<string, Record<string, unknown>>).w2).toMatchObject({ status: 'ordered', shop: 'Siren Records', shopUrl: 'https://sirenrecordsmchenry.com/' }))
  })

  it('keeps what is typed when nothing is picked', async () => {
    const { user } = setup({ shops: [SIREN] }, bought)
    await openRecord(user, 'Vs.')
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const box = screen.getByRole('combobox', { name: 'From' })
    await user.clear(box)
    await user.type(box, 'Merch booth')
    expect(screen.queryByRole('option')).toBeNull()
    expect((box as HTMLInputElement).value).toBe('Merch booth')
  })

  it("Got it: a website on your list gives that shop's name", async () => {
    const want = { w1: { title: 'Lightning Bolt', artist: 'Pearl Jam', status: 'wish', notes: [], added: 12, buyLinks: ['https://www.sirenrecordsmchenry.com/p/lb', 'https://roughtrade.com/lb'] } }
    const { user } = setup({ shops: [SIREN] }, want)
    await openRecord(user, 'Lightning Bolt')
    await user.click(screen.getByRole('button', { name: 'Got it' }))
    const g = screen.getByRole('group', { name: 'From one of these?' })
    await user.click(within(g).getByRole('button', { name: /sirenrecordsmchenry/ }))
    expect((screen.getByRole('combobox', { name: 'Bought from' }) as HTMLInputElement).value).toBe('Siren Records')
  })
})
