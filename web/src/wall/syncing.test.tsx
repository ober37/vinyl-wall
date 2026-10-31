// #130: "N syncing" is a filter while records are syncing
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../App'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'

// every record looked up except Blue Train (r3) and Abbey Road (r7), which wait on a lookup
function setup(opts: Parameters<typeof fakeClaude>[1] = {}) {
  const seed = sample()
  for (const r of Object.values(seed.records))
    Object.assign(r, { coverAsset: 'c', runtime: r.runtime || 40, aboutAt: 1, aboutV: 3, about: { ...(r.about as object), summary: 's' } })
  Object.assign(seed.records.r3, { needsEnrich: true })
  Object.assign(seed.records.r7, { needsEnrich: true })
  const fake = fakeClaude(seed, opts)
  const ui = (
    <RuntimeProvider claude={fake.claude}>
      <App />
    </RuntimeProvider>
  )
  const view = render(ui)
  return { fake, view, ui, user: userEvent.setup() }
}
const sleeves = () => screen.queryAllByTestId('sleeve').map((b) => b.getAttribute('data-id'))
const chip = () => screen.queryByRole('button', { name: /records? syncing$/ })
const pressed = (b: HTMLElement | null) => b?.getAttribute('aria-pressed')
const done = (fake: ReturnType<typeof setup>['fake'], id: string) => act(async () => fake.remote(id, { needsEnrich: false }))
afterEach(() => localStorage.clear())

describe('the syncing chip', () => {
  it('shows only the records syncing, and the whole wall again when tapped off', async () => {
    const { user } = setup()
    await screen.findAllByTestId('sleeve')
    expect(chip()?.textContent).toBe('2 records syncing')
    expect(pressed(chip())).toBe('false')
    await user.click(chip()!)
    expect(pressed(chip())).toBe('true')
    expect(sleeves()).toEqual(['r3', 'r7'])
    await user.click(chip()!)
    expect(sleeves()).toHaveLength(5)
  })

  it('narrows within the counts and the search, and says when nothing is left', async () => {
    const { user } = setup()
    await screen.findAllByTestId('sleeve')
    await user.click(screen.getByRole('button', { name: /top want/ }))
    await user.click(chip()!)
    expect(sleeves()).toEqual(['r7'])
    await user.click(screen.getByRole('button', { name: /top want/ }))
    await user.click(screen.getByRole('button', { name: /someday/ }))
    expect(sleeves()).toEqual([])
    expect(screen.getByText('Nothing syncing with this filter.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /someday/ }))
    await user.click(screen.getByRole('button', { name: 'Search the wall' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search the wall' }), 'coltrane')
    await waitFor(() => expect(sleeves()).toEqual(['r3']))
    await user.type(screen.getByRole('searchbox', { name: 'Search the wall' }), 'x')
    await waitFor(() => expect(screen.getByText('Nothing syncing matches “coltranex”.')).toBeTruthy())
  })

  it('drops a record that finishes and takes in one that starts', async () => {
    const { fake, user } = setup()
    await screen.findAllByTestId('sleeve')
    await user.click(chip()!)
    await done(fake, 'r3')
    expect(sleeves()).toEqual(['r7'])
    expect(chip()?.textContent).toBe('1 record syncing')
    await act(async () => fake.remote('r1', { needsEnrich: true }))
    expect(sleeves()).toEqual(['r1', 'r7'])
  })

  it('goes away with the filter when syncing ends, leaving focus on the first count', async () => {
    const { fake, user } = setup()
    await screen.findAllByTestId('sleeve')
    await user.click(chip()!)
    await done(fake, 'r3')
    await done(fake, 'r7')
    expect(chip()).toBeNull()
    expect(sleeves()).toHaveLength(5)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /owned/ })))
    // the next sync brings it back off
    await act(async () => fake.remote('r1', { needsEnrich: true }))
    expect(pressed(chip())).toBe('false')
    expect(sleeves()).toHaveLength(5)
  })

  it("puts focus on the chip when a record's sheet closes after its sleeve left the wall", async () => {
    const { fake, user } = setup()
    await screen.findAllByTestId('sleeve')
    await user.click(chip()!)
    await user.click(screen.getByRole('button', { name: /^Open Blue Train/ }))
    await screen.findByRole('heading', { name: 'Blue Train' })
    await done(fake, 'r3')
    expect(sleeves()).toEqual(['r7'])
    await user.keyboard('{Escape}')
    await waitFor(() => expect(document.activeElement).toBe(chip()))
  })

  it("isn't remembered across visits", async () => {
    const { view, ui, user } = setup()
    await screen.findAllByTestId('sleeve')
    await user.click(chip()!)
    expect(localStorage.getItem('rw.filter')).toBeNull()
    view.unmount()
    render(ui)
    await screen.findAllByTestId('sleeve')
    expect(pressed(chip())).toBe('false')
    expect(sleeves()).toHaveLength(5)
  })

  it('is never shown to a viewer', async () => {
    setup({ canWrite: false })
    await screen.findAllByTestId('sleeve')
    expect(chip()).toBeNull()
  })
})
