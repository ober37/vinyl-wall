// #155: a local shop added with just its name: Find its website with Claude copies the request for a Claude chat
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { fillPrompt, type Shop } from '../model/shops'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'

const WALL = 'https://claude.ai/artifact/test'
const SIREN: Shop = { id: 'sr', name: 'Siren Records', kind: 'local', place: 'McHenry, IL' }
afterEach(() => localStorage.clear())

describe('the request', () => {
  it('names the shop by name and id, where it is and the wall, and asks to find the website first', () => {
    expect(fillPrompt(SIREN, WALL)).toBe(
      'Fill in a shop on my Vinyl Wall\nShop: "Siren Records" (shop sr), McHenry, IL\nWall: https://claude.ai/artifact/test\n' +
        "Use the vinyl-wall skill: find its website, then fill in what's missing and leave what I typed as it is.",
    )
  })
  it('with a website, only fills in; without a wall link, none', () => {
    const p = fillPrompt({ id: 'n', name: 'Northside', kind: 'local', url: 'https://n.example/' }, '')
    expect(p).toBe('Fill in a shop on my Vinyl Wall\nShop: "Northside" (shop n)\n' + "Use the vinyl-wall skill: fill in what's missing and leave what I typed as it is.")
  })
})

describe('Settings → Shops', () => {
  function setup(shops: Shop[]) {
    const seed = sample()
    seed.docs['settings/site'] = { url: WALL, update: { checkedMs: Date.now() }, shops }
    render(
      <RuntimeProvider claude={fakeClaude(seed).claude}>
        <App />
      </RuntimeProvider>,
    )
    return userEvent.setup()
  }
  const open = async (user: ReturnType<typeof userEvent.setup>, name: RegExp) => {
    await user.click(await screen.findByRole('button', { name: 'Settings' }))
    const sheet = await screen.findByRole('dialog', { name: 'Settings' })
    await user.click(within(sheet).getByRole('tab', { name: 'Shops' }))
    await user.click(await within(sheet).findByRole('button', { name }))
    return sheet
  }

  it('a local shop without a website offers Find its website with Claude, and copies the request', async () => {
    const user = setup([SIREN])
    const write = vi.spyOn(navigator.clipboard, 'writeText')
    const sheet = await open(user, /Siren Records/)
    await user.click(within(sheet).getByRole('button', { name: 'Find its website with Claude' }))
    await waitFor(() => expect(write).toHaveBeenCalledWith(fillPrompt(SIREN, WALL)))
    expect(await within(sheet).findByText('Copied. Paste it into Claude.')).toBeTruthy()
  })

  it('one with a website but missing details offers Fill in with Claude; a complete one, nothing', async () => {
    const user = setup([
      { id: 'n', name: 'Northside', kind: 'local', url: 'https://n.example/' },
      { id: 'f', name: 'Full Shop', kind: 'local', url: 'https://f.example/', place: '1 Main St, Town, IL', phone: '555-0100', about: 'Great bins.' },
    ])
    let sheet = await open(user, /Northside/)
    expect(within(sheet).getByRole('button', { name: 'Fill in with Claude' })).toBeTruthy()
    await user.click(within(sheet).getByRole('button', { name: /Northside/ }))
    await user.click(within(sheet).getByRole('button', { name: /Full Shop/ }))
    sheet = screen.getByRole('dialog', { name: 'Settings' })
    expect(within(sheet).queryByRole('button', { name: /with Claude/ })).toBeNull()
  })

  it('an online shop never offers it', async () => {
    const user = setup([{ id: 'o', name: 'Online Only', kind: 'online' }])
    const sheet = await open(user, /Online Only/)
    expect(within(sheet).queryByRole('button', { name: /with Claude/ })).toBeNull()
  })
})
