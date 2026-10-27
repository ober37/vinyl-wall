import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'

// #68: the wall's messages are toasts at the bottom; a sheet keeps its own inline
type Opts = Parameters<typeof fakeClaude>[1]
function setup(site: Record<string, unknown> = {}, opts: Opts = {}) {
  const seed = sample()
  for (const r of Object.values(seed.records))
    Object.assign(r, { coverAsset: 'c', runtime: r.runtime || 40, aboutAt: 1, aboutV: 3, about: { ...(r.about as object), summary: 's' } })
  seed.docs['settings/site'] = { update: { checkedMs: Date.now() }, ...site }
  const fake = fakeClaude(seed, opts)
  render(
    <RuntimeProvider claude={fake.claude}>
      <App />
    </RuntimeProvider>,
  )
  return { fake, user: userEvent.setup({ advanceTimers: (ms) => void (vi.isFakeTimers() && vi.advanceTimersByTime(ms)) }) }
}
const NOT_SET_UP = "Background updates aren't set up yet. Ask Claude to finish setting up your Vinyl Wall."
const toastOf = (text: string | RegExp) =>
  screen.queryAllByText(text).map((e) => e.closest('[data-slot="toast"]')).find(Boolean)
// asks for a lookup from Blue Train's sheet, which says why it can't start (no task) or fails to save (failWrites)
async function askInSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Open Blue Train/ }))
  await user.click(await screen.findByRole('button', { name: 'Edit' }))
  await user.click(screen.getByRole('button', { name: 'Find cover & details' }))
}
const closeSheet = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.keyboard('{Escape}')
  // (a toast is a dialog too)
  await waitFor(() => expect(screen.queryAllByRole('dialog').filter((d) => d.dataset.slot !== 'toast')).toHaveLength(0))
}
afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

describe('wall messages', () => {
  it("a sheet shows its message inline, once, and closing it moves the message to a toast at the bottom", async () => {
    const { user } = setup()
    await askInSheet(user)
    await screen.findByText(NOT_SET_UP)
    expect(screen.getAllByText(NOT_SET_UP)).toHaveLength(1)
    expect(toastOf(NOT_SET_UP)).toBeFalsy()
    await closeSheet(user)
    await waitFor(() => expect(toastOf(NOT_SET_UP)).toBeTruthy())
    expect(toastOf(NOT_SET_UP)!.getAttribute('data-position')).toBe('bottom-center')
    expect(screen.getAllByText(NOT_SET_UP)).toHaveLength(1)
  })

  it('a notice goes after 8 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const notice = setup()
    await askInSheet(notice.user)
    await screen.findByText(NOT_SET_UP)
    await closeSheet(notice.user)
    await waitFor(() => expect(toastOf(NOT_SET_UP)).toBeTruthy())
    act(() => void vi.advanceTimersByTime(9000))
    await waitFor(() => expect(toastOf(NOT_SET_UP)).toBeFalsy())
  })

  it('an error stays until its X is clicked', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { user } = setup({ taskId: 't1' }, { failWrites: true })
    await askInSheet(user)
    await screen.findByText(/^Couldn't/)
    await closeSheet(user)
    await waitFor(() => expect(toastOf(/^Couldn't/)).toBeTruthy())
    // said at once to a screen reader
    expect(screen.getByRole('alert').textContent).toContain("Couldn't save")
    act(() => void vi.advanceTimersByTime(20000))
    expect(toastOf(/^Couldn't/)).toBeTruthy()
    // (Base UI keeps the X from screen readers until the toast is focused, as it's already been said)
    await user.click(toastOf(/^Couldn't/)!.querySelector('[aria-label="Dismiss"]')!)
    await waitFor(() => expect(toastOf(/^Couldn't/)).toBeFalsy())
  })

  it('nothing shows above the title', async () => {
    const { user } = setup()
    await askInSheet(user)
    await screen.findByText(NOT_SET_UP)
    await closeSheet(user)
    await waitFor(() => expect(toastOf(NOT_SET_UP)).toBeTruthy())
    expect(document.querySelector('main [data-slot="alert"]')).toBeNull()
  })

  it("a failed load says why in the status line, not in a toast", async () => {
    setup({}, { failLoad: true })
    const line = await screen.findByText(/Database unavailable/)
    expect(line.textContent).toBe("Open this page signed in to claude.ai to see the wall. (Couldn't load the wall: Database unavailable)")
    expect(line.closest('[data-slot="toast"]')).toBeNull()
  })
})
