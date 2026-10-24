import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../App'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'

const LEDE = 'Kind of Blue is a 1959 album by Miles Davis.'
const REST = 'Recorded in two sessions at Columbia 30th Street Studio, it is the best-selling jazz record of all time.'
async function openWith(about: Record<string, unknown> | undefined, extra: Record<string, unknown> = {}) {
  const seed = sample()
  Object.assign(seed.records.r1, { about, aboutAt: 1, aboutV: 3, ...extra })
  render(
    <RuntimeProvider claude={fakeClaude(seed).claude}>
      <App />
    </RuntimeProvider>,
  )
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: /Open Kind of Blue/ }))
  await screen.findByRole('heading', { name: 'Kind of Blue' })
  return user
}

describe('album summary (parity with 0.9.4)', () => {
  it('shows the lede, and More opens the rest', async () => {
    const user = await openWith({ summary: `${LEDE}\n\n${REST}`, wiki: 'https://en.wikipedia.org/wiki/Kind_of_Blue' })
    expect(screen.getByText(LEDE)).toBeTruthy()
    expect(screen.queryByText(REST)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'More' }))
    expect(screen.getByText(REST)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Less' }))
    expect(screen.queryByText(REST)).toBeNull()
    expect(screen.getByRole('link', { name: 'Wikipedia ↗' }).getAttribute('href')).toBe('https://en.wikipedia.org/wiki/Kind_of_Blue')
  })

  it('names the artist page a summary came from', async () => {
    await openWith({ summary: LEDE, wiki: 'https://en.wikipedia.org/wiki/Miles_Davis', via: 'Miles Davis' })
    expect(screen.getByText(/Summary by Claude · from/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Miles Davis on Wikipedia ↗' })).toBeTruthy()
  })

  it('offers More on a long one-block summary only', async () => {
    await openWith({ summary: LEDE })
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull()
  })

  it('says when the album is being looked up, or Wikipedia had nothing', async () => {
    await openWith(undefined, { aboutAt: undefined })
    // said once, by the header's lookup line
    expect(within(screen.getByRole('dialog')).getAllByText(/^Looking up/).map((x) => x.textContent)).toEqual(['Looking up the album…'])
  })

  it('says when Wikipedia had nothing', async () => {
    await openWith({}, { aboutAt: 1, aboutV: 3 })
    expect(screen.getByText('Wikipedia has nothing on this album.')).toBeTruthy()
  })
})
