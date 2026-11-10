// #153: what's being written in a play's journal, and the Log a play form, survive switching tabs and reopening the sheet
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../App'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'

function setup() {
  const fake = fakeClaude(sample())
  render(
    <RuntimeProvider claude={fake.claude}>
      <App />
    </RuntimeProvider>,
  )
  return { fake, user: userEvent.setup() }
}
type U = ReturnType<typeof userEvent.setup>
const open = async (user: U, title: string) => {
  await user.click(await screen.findByRole('button', { name: new RegExp('Open ' + title) }))
  await screen.findByRole('heading', { name: title })
}
const tab = (user: U, name: string) => user.click(screen.getByRole('tab', { name }))
const btn = (name: string | RegExp) => screen.getByRole('button', { name })
const thoughts = () => screen.getByRole('textbox', { name: 'Your thoughts' }) as HTMLTextAreaElement
// the Edit on the play whose thoughts are these, not the sheet's own
const editPlay = async (text: string) => within((await screen.findByText(text)).closest('li')!).getByRole('button', { name: 'Edit' })
const ticked = (name: RegExp) => screen.getByRole('checkbox', { name }).getAttribute('aria-checked') === 'true'

describe('drafts (#153)', () => {
  it("keeps a journal's vibe and thoughts across a tab switch, then saves them and forgets the draft", async () => {
    const { fake, user } = setup()
    await open(user, 'Kind of Blue')
    await user.click(btn('Log play'))
    await user.type(await screen.findByRole('textbox', { name: 'Your thoughts' }), 'Half way')
    await user.click(btn('Set the vibe'))
    await tab(user, 'About')
    await tab(user, 'Listening')
    expect(thoughts().value).toBe('Half way')
    expect(screen.getByText('Locked in')).toBeTruthy()

    await user.click(btn('Save'))
    await waitFor(() => expect((fake.records.r1.notes as object[]).at(-1)).toMatchObject({ j: 'Half way', vibe: 3 }))
    // reopened, it shows the play as saved, not an old draft
    await user.click(await editPlay('Half way'))
    expect(thoughts().value).toBe('Half way')
    await user.clear(thoughts())
    await user.type(thoughts(), 'Changed my mind')
    await user.click(btn('Cancel'))
    await user.click(await editPlay('Half way'))
    expect(thoughts().value).toBe('Half way')
  })

  it("keeps the Log a play form's ticked tracks across a tab switch and a closed sheet", async () => {
    const { user } = setup()
    await open(user, 'Kind of Blue')
    await user.click(btn('Tracks'))
    await user.click(screen.getByRole('checkbox', { name: /Freddie Freeloader/ }))
    await user.click(screen.getByRole('checkbox', { name: /Blue in Green/ }))
    await tab(user, 'About')
    await tab(user, 'Listening')
    expect(ticked(/Freddie Freeloader/)).toBe(true)
    expect(ticked(/Blue in Green/)).toBe(true)

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Kind of Blue' })).toBeNull())
    await open(user, 'Kind of Blue')
    if (screen.getByRole('tab', { name: 'Listening' }).getAttribute('aria-selected') !== 'true') await tab(user, 'Listening')
    expect(ticked(/Freddie Freeloader/)).toBe(true)

    // logged, the form starts over
    await user.click(btn('Log 2 tracks'))
    await screen.findByRole('button', { name: 'Undo' })
    await user.click(btn('Skip'))
    expect(screen.queryByRole('checkbox', { name: /Freddie Freeloader/ })).toBeNull()
  })
})
