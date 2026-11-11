// #155: a local shop's website found by the background task: which shops wait for it, the start message, and Not this shop
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../App'
import { notThisShop, shopsOf, siteDue, townOf, type Shop } from '../model/shops'
import { pendingParts } from '../model/task'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'

const NOW = 1_800_000_000_000
const DAY = 864e5
const SIREN: Shop = { id: 'sr', name: 'Siren Records', kind: 'local', place: '324 bob way mchenry, IL 60156' }
const FOUND: Shop = {
  ...SIREN,
  url: 'https://sirenrecordsmchenry.com/',
  phone: '+1-815-347-8363',
  search: 'https://sirenrecordsmchenry.com/search?q={q}',
  shopify: true,
  found: { by: ['osm', 'rsd'], keys: ['phone', 'url'] },
}
afterEach(() => localStorage.clear())

describe('which shops wait for a website (as app/tools/shop_site.py has it)', () => {
  it('takes the town from the address, or a town and state ending the name', () => {
    // the same cases as dev/test_shop_site.py
    expect(townOf({ ...SIREN, place: '3902 Main St, McHenry, IL 60050' })).toBe('McHenry, IL')
    expect(townOf(SIREN)).toBe('Mchenry, IL')
    expect(townOf({ ...SIREN, place: 'McHenry, IL' })).toBe('McHenry, IL')
    expect(townOf({ id: 'n', name: 'Northside Trading Post in Lakeview, IL', kind: 'local' })).toBe('Lakeview, IL')
    expect(townOf({ id: 'm', name: 'Music in Motion', kind: 'local' })).toBe('')
    expect(townOf({ id: 'c', name: 'Corner Groove', kind: 'local', place: 'Down the street' })).toBe('Down the street')
  })

  it('a local shop with a town and no website, not tried in the last 30 days', () => {
    expect(siteDue(SIREN, NOW)).toBe(true)
    expect(siteDue({ ...SIREN, url: 'https://x.com/' }, NOW)).toBe(false)
    expect(siteDue({ ...SIREN, kind: 'online' }, NOW)).toBe(false)
    expect(siteDue({ id: 'c', name: 'Corner Groove', kind: 'local' }, NOW)).toBe(false)
    expect(siteDue({ ...SIREN, siteTried: NOW - 5 * DAY }, NOW)).toBe(false)
    expect(siteDue({ ...SIREN, siteTried: NOW - 31 * DAY }, NOW)).toBe(true)
  })

  it('names it in the start message', () => {
    expect(pendingParts([], { shops: [SIREN], update: { checkedMs: NOW } }, false, NOW)).toEqual(['find the website of 1 local shop (Part S)'])
    expect(pendingParts([], { shops: [{ ...SIREN, siteTried: NOW }], update: { checkedMs: NOW } }, false, NOW)).toEqual([])
  })

  it("keeps what was found, clean, and drops what isn't", () => {
    const [s] = shopsOf({ shops: [{ ...FOUND, siteTried: 5, siteRejected: ['a.com', 7] }] })
    expect(s).toMatchObject({ found: { by: ['osm', 'rsd'], keys: ['phone', 'url'] }, siteTried: 5, siteRejected: ['a.com'] })
    expect(shopsOf({ shops: [{ ...SIREN, found: { by: ['osm'], keys: [] }, siteTried: 'x' }] })[0]).toEqual(SIREN)
  })
})

describe('Not this shop', () => {
  it('clears what was found and the search found from it, remembers the website, and waits 30 days', () => {
    const n = notThisShop({ ...FOUND, email: 'hi@siren.example' }, NOW)
    expect(n).toEqual({ ...SIREN, email: 'hi@siren.example', siteRejected: ['sirenrecordsmchenry.com'], siteTried: NOW })
    expect(siteDue(n, NOW)).toBe(false)
  })
})

describe('Settings → Shops (#155)', () => {
  function setup(shop: Shop) {
    const seed = sample()
    for (const r of Object.values(seed.records))
      Object.assign(r, { coverAsset: 'c', runtime: r.runtime || 40, aboutAt: 1, aboutV: 3, about: { ...(r.about as object), summary: 's' } })
    seed.docs['settings/site'] = { taskId: 't1', update: { checkedMs: Date.now() }, shops: [shop] }
    const fake = fakeClaude(seed)
    render(
      <RuntimeProvider claude={fake.claude}>
        <App />
      </RuntimeProvider>,
    )
    return { fake, user: userEvent.setup(), shop: () => (fake.store.settings.site as { shops: Shop[] }).shops[0] }
  }
  const openShop = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: 'Settings' }))
    const sheet = await screen.findByRole('dialog', { name: 'Settings' })
    await user.click(within(sheet).getByRole('tab', { name: 'Shops' }))
    await user.click(await within(sheet).findByRole('button', { name: /Siren Records/ }))
    return sheet
  }

  it('says what was found automatically and from where, and Not this shop takes it back', async () => {
    const { user, shop } = setup(FOUND)
    const sheet = await openShop(user)
    expect(within(sheet).getByText('Website found automatically from OpenStreetMap and Record Store Day.')).toBeTruthy()
    await user.click(within(sheet).getByRole('button', { name: 'Not this shop' }))
    await waitFor(() => expect(shop().url).toBeUndefined())
    expect(shop()).toMatchObject({ siteRejected: ['sirenrecordsmchenry.com'] })
    expect(shop().phone).toBeUndefined()
    expect((within(sheet).getByRole('textbox', { name: 'Web store' }) as HTMLInputElement).value).toBe('')
    expect(within(sheet).queryByText(/found automatically/)).toBeNull()
  })

  it('a found phone you change is yours: Not this shop leaves it', async () => {
    const { user, shop } = setup(FOUND)
    const sheet = await openShop(user)
    const phone = within(sheet).getByRole('textbox', { name: 'Phone' })
    await user.clear(phone)
    await user.type(phone, '815-555-0100')
    await waitFor(() => expect(shop().phone).toBe('815-555-0100'))
    expect(shop().found).toEqual({ by: ['osm', 'rsd'], keys: ['url'] })
    await user.click(within(sheet).getByRole('button', { name: 'Not this shop' }))
    await waitFor(() => expect(shop().url).toBeUndefined())
    expect(shop().phone).toBe('815-555-0100')
  })

  it('a shop waiting for its website starts the task', async () => {
    const { fake } = setup(SIREN)
    await waitFor(() =>
      expect(fake.calls.filter((c) => c.op === 'fire')[0]).toMatchObject({ data: { text: expect.stringContaining('find the website of 1 local shop (Part S)') } }),
    )
  })

  it('nothing is said for a shop with nothing found', async () => {
    const { user } = setup({ ...SIREN, siteTried: Date.now() })
    const sheet = await openShop(user)
    expect(within(sheet).queryByText(/found automatically/)).toBeNull()
    expect(within(sheet).queryByRole('button', { name: 'Not this shop' })).toBeNull()
  })
})
