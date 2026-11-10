// #156: Your copy's Bought row names the budget beside what was paid
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../App'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'
import { openCopies } from './openCopies'

function setup(r: Record<string, unknown>) {
  const seed = sample()
  seed.records.o = { title: 'Owned', artist: 'Band', status: 'own', notes: [], added: 30, ...r }
  const fake = fakeClaude(seed)
  render(
    <RuntimeProvider claude={fake.claude}>
      <App />
    </RuntimeProvider>,
  )
  return userEvent.setup()
}
const bought = async (r: Record<string, unknown>) => {
  const user = setup(r)
  await user.click(await screen.findByRole('button', { name: /Open Owned/ }))
  await screen.findByRole('heading', { name: 'Owned' })
  await user.click(screen.getByRole('tab', { name: 'About' }))
  await openCopies(user)
  return within(screen.getByRole('dialog')).getAllByText('Bought').map((dt) => dt.parentElement!.textContent!.replace(/^Bought/, ''))
}

describe("Your copy's budget (#156)", () => {
  it('follows what was paid', async () => {
    expect(await bought({ paid: '32', budget: '35', shop: 'Corner Groove' })).toEqual(['Corner Groove · $32 (budget $35)'])
  })
  it('stays out of view without a price', async () => {
    expect(await bought({ budget: '35', shop: 'Corner Groove' })).toEqual(['Corner Groove'])
  })
})
