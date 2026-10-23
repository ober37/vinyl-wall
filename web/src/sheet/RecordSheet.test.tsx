import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../App'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'

function setup(opts: Parameters<typeof fakeClaude>[1] = {}) {
  const fake = fakeClaude(sample(), opts)
  render(
    <RuntimeProvider claude={fake.claude}>
      <App />
    </RuntimeProvider>,
  )
  return { fake, user: userEvent.setup() }
}
const open = async (user: ReturnType<typeof userEvent.setup>, name: RegExp) =>
  user.click(await screen.findByRole('button', { name }))

describe('record sheet', () => {
  it('opens a record from the wall', async () => {
    const { user } = setup()
    await open(user, /Open Kind of Blue/)
    expect(await screen.findByRole('heading', { name: 'Kind of Blue' })).toBeTruthy()
    expect(screen.getByText('The record that taught me to sit still and listen.')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Listening' })).toBeTruthy()
  })

  it('shows no edit controls to a read-only viewer', async () => {
    const { user } = setup({ canWrite: false })
    await open(user, /Open Kind of Blue/)
    await screen.findByRole('heading', { name: 'Kind of Blue' })
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('autosaves only the changed field', async () => {
    const { fake, user } = setup()
    await open(user, /Open Blue Train/)
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const why = screen.getByRole('textbox', { name: 'Why' })
    await user.type(why, 'Side one')
    await waitFor(() => expect(fake.calls.length).toBe(1), { timeout: 2000 })
    expect(fake.calls[0]).toEqual({ path: 'records/r3', op: 'update', data: { why: 'Side one', needsSync: true } })
    expect(await screen.findByText('Saved')).toBeTruthy()
  })

  it('writes pending edits at once on Done', async () => {
    const { fake, user } = setup()
    await open(user, /Open Blue Train/)
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.type(screen.getByRole('textbox', { name: 'Why' }), 'x')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(fake.calls.length).toBe(1))
    expect(fake.calls[0].data).toEqual({ why: 'x', needsSync: true })
  })

  it("doesn't overwrite typing with a change made elsewhere", async () => {
    const { fake, user } = setup()
    await open(user, /Open Blue Train/)
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const why = screen.getByRole('textbox', { name: 'Why' }) as HTMLTextAreaElement
    await user.type(why, 'mine')
    await act(async () => fake.remote('r3', { why: 'theirs', year: '1958' }))
    expect(why.value).toBe('mine')
  })

  it('reports a refused write', async () => {
    const { user } = setup({ failWrites: true })
    await open(user, /Open Blue Train/)
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.type(screen.getByRole('textbox', { name: 'Why' }), 'x')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(await screen.findByText(/Couldn't save/)).toBeTruthy()
  })
})
