import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'

function setup(seed = sample()) {
  const fake = fakeClaude(seed)
  const ui = (
    <RuntimeProvider claude={fake.claude}>
      <App />
    </RuntimeProvider>
  )
  const view = render(ui)
  return { fake, view, ui, user: userEvent.setup() }
}
const sleeves = () => screen.queryAllByTestId('sleeve').map((b) => b.getAttribute('data-id'))
afterEach(() => localStorage.clear())

describe('the wall', () => {
  it('hangs records in wall order with tags in their names', async () => {
    setup()
    await screen.findAllByTestId('sleeve')
    expect(sleeves()).toEqual(['r1', 'r3', 'r5', 'r7', 'r6'])
    expect(screen.getByRole('button', { name: /^Open Aja by Steely Dan, Shipped, / })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open Abbey Road by The Beatles, Top want, ≤$150, looking up details' })).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Records' }).getAttribute('data-hang')).toBe('barn')
  })

  it('filters by the counts and remembers the filter for this viewer', async () => {
    const { view, ui, user } = setup()
    await screen.findAllByTestId('sleeve')
    await user.click(screen.getByRole('button', { name: /on the way/ }))
    expect(sleeves()).toEqual(['r5'])
    expect(localStorage.getItem('rw.filter')).toBe('["ord"]')
    view.unmount()
    render(ui)
    await waitFor(() => expect(sleeves()).toEqual(['r5']))
  })

  it("still works when this browser won't store anything", async () => {
    const get = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const set = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { user } = setup()
    await screen.findAllByTestId('sleeve')
    await user.click(screen.getByRole('button', { name: /someday/ }))
    expect(sleeves()).toEqual(['r6'])
    get.mockRestore()
    set.mockRestore()
  })

  it('searches, says when nothing matches, and clears', async () => {
    const { user } = setup()
    await screen.findAllByTestId('sleeve')
    await user.click(screen.getByRole('button', { name: 'Search the wall' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search the wall' }), 'coltrane')
    await waitFor(() => expect(sleeves()).toEqual(['r3']))
    await user.type(screen.getByRole('searchbox'), 'x')
    await user.click(await screen.findByRole('button', { name: 'Clear the search' }))
    expect(sleeves()).toHaveLength(5)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Search the wall' }))
  })

  it("keeps a sleeve's cover in place when another record changes", async () => {
    const seed = sample()
    seed.records.r3.coverAsset = 'abc'
    const { fake } = setup(seed)
    await screen.findAllByTestId('sleeve')
    const img = document.querySelector('[data-id="r3"] img')
    expect(img).toBeTruthy()
    await act(async () => fake.remote('r1', { why: 'changed elsewhere' }))
    expect(document.querySelector('[data-id="r3"] img')).toBe(img)
  })

  it('follows a settings change made elsewhere', async () => {
    const { fake } = setup()
    await screen.findAllByTestId('sleeve')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('My Vinyl Wall')
    await act(async () => fake.remoteDoc('settings/site', { title: 'Den Wall', bg: { kind: 'preset', preset: 'cafe' } }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Den Wall')
    expect(document.title).toBe('Den Wall')
    expect(screen.getByTestId('wall-photo').getAttribute('style')).toContain('backgrounds/coffee-shop.jpg')
  })
})
