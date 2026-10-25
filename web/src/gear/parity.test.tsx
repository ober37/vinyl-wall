// Phase 7: Equipment behaviours production has that no other test asserts (docs/parity-map.md, smoke scenarios 5, 31, 32)
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../App'
import { today } from '../model/record'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'

type C = Record<string, Record<string, unknown>>
const SETUPS: C = {
  den: { name: 'Den', note: 'By the window', added: 1 },
  lr: { name: 'Living room', note: '', added: 2 },
  office: { name: 'Office', note: '', added: 3 },
}
const piece = (x: Record<string, unknown>) => ({ status: 'active', minutes: 0, plays: [], notes: [], ...x })
const GEAR: C = {
  sty: piece({ type: 'stylus', name: 'ATN-VM95E', setup: 'den', tracks: true, ratedLow: 300, ratedHigh: 500, startHours: 290, added: 1 }),
  amp: piece({ type: 'amp', name: 'A-S501', setup: 'den', tracks: false, installed: '2024-05-01', added: 2 }),
  tt: piece({ type: 'turntable', name: 'SL-1500C', setup: 'lr', tracks: true, minutes: 600, added: 3 }),
  c1: piece({ type: 'cartridge', name: 'VM95 body', setup: 'lr', tracks: true, ratedLow: 300, ratedHigh: 500, startHours: 250, added: 4 }),
  c2: piece({ type: 'cartridge', name: '2M Red', setup: 'lr', tracks: true, ratedLow: 300, ratedHigh: 500, startHours: 520, added: 5 }),
  belt: piece({ type: 'belt', name: 'Spare belt', setup: 'lr', tracks: true, ratedLow: 300, ratedHigh: 500, startHours: 320, added: 6 }),
  hp: piece({ type: 'headphones', name: 'HD 600', setup: '*', tracks: false, added: 7 }),
  mat: piece({ type: 'mat', name: 'Cork mat', setup: 'gone', tracks: false, added: 8 }),
  old: piece({ type: 'stylus', name: 'Old stylus', setup: 'den', status: 'retired', retired: '2025-06-01', tracks: true, ratedLow: 300, ratedHigh: 500, startHours: 400, added: 0 }),
}

type Fake = ReturnType<typeof fakeClaude>
function setup(opts: Parameters<typeof fakeClaude>[1] = {}, collections: Record<string, C> = { gear: GEAR, setups: SETUPS }, edit: (s: ReturnType<typeof sample>) => void = () => {}) {
  const seed = sample()
  edit(seed)
  const fake = fakeClaude({ ...seed, collections }, opts)
  render(
    <RuntimeProvider claude={fake.claude}>
      <App />
    </RuntimeProvider>,
  )
  return { fake, user: userEvent.setup() }
}
type User = ReturnType<typeof userEvent.setup>
const sets = (fake: Fake, path: string) => fake.calls.filter((c) => c.op === 'set' && c.path.startsWith(path)).map((c) => ({ path: c.path, ...c.data! }))
const btn = (name: string | RegExp) => screen.getByRole('button', { name })
const group = (name: string) => screen.getByRole('group', { name })
const card = (name: string) => screen.getByRole('button', { name: new RegExp(name) })
const equipment = async (user: User, pill: RegExp) => {
  await user.click(await screen.findByRole('button', { name: pill }))
  await screen.findByRole('heading', { name: 'Equipment' })
}
const openPiece = async (user: User, name: string) => {
  await user.click(card(name))
  await screen.findByRole('heading', { name })
}
const settle = () => act(() => new Promise((r) => setTimeout(r, 20)))

describe('the Equipment sheet groups', () => {
  it('shows each setup with its notes, an empty setup says so, then Not in a setup, Shared equipment and Retired', async () => {
    const { user } = setup()
    await equipment(user, /cartridge:/)
    expect(within(group('Den')).getByText('By the window')).toBeTruthy()
    expect(within(group('Office')).getByText('No equipment in this setup yet.')).toBeTruthy()
    expect(within(group('Den')).queryByText('No equipment in this setup yet.')).toBeNull()

    const loose = group('Not in a setup')
    expect(within(loose).getByText('Open each piece and choose its setup.')).toBeTruthy()
    expect(within(loose).getByRole('button', { name: /Cork mat/ })).toBeTruthy()

    const shared = group('Shared equipment')
    expect(within(shared).getByText(/Gear used with every setup, like speakers, headphones or a cleaning kit/)).toBeTruthy()
    expect(within(shared).getByRole('button', { name: /HD 600/ })).toBeTruthy()

    const retired = group('Retired')
    expect(within(retired).getByRole('button', { name: /Old stylus/ })).toBeTruthy()
    expect(within(group('Den')).queryByRole('button', { name: /Old stylus/ })).toBeNull()

    await user.click(within(shared).getByRole('button', { name: 'Add shared equipment' }))
    expect(await screen.findByRole('heading', { name: 'Add equipment' })).toBeTruthy()
    expect(screen.getByText('Shared by all setups')).toBeTruthy()
  })

  it('a gear card reads its hours, how far it is from its rating and its state; untracked gear says since when, or that it is not tracked', async () => {
    const { user } = setup()
    await equipment(user, /cartridge:/)
    const line = (name: string, text: string) => expect(within(card(name)).getByText(text)).toBeTruthy()
    line('ATN-VM95E', '290 h · 10 h to go')
    expect(within(card('ATN-VM95E')).getByText('Getting close')).toBeTruthy()
    line('VM95 body', '250 h · 50 h to go')
    expect(within(card('VM95 body')).queryByText('Healthy')).toBeNull()
    line('Spare belt', '320 h · in window')
    expect(within(card('Spare belt')).getByText('Replace window')).toBeTruthy()
    line('2M Red', '520 h · 20 h over')
    expect(within(card('2M Red')).getByText('Replace now')).toBeTruthy()
    // no rating: the hours alone, no verdict
    line('SL-1500C', '10 h')
    expect(within(card('SL-1500C')).getByText('Turntable')).toBeTruthy()
    expect(within(card('A-S501')).getByText(/^Since /)).toBeTruthy()
    expect(within(card('Cork mat')).getByText('Not hours-tracked')).toBeTruthy()
  })
})

describe('the header pill', () => {
  it('names the worn part healthy, then Getting close, then in its replacement window, as its hours change', async () => {
    const sty = piece({ type: 'stylus', name: 'ATN-VM95E', setup: 'den', tracks: true, ratedLow: 300, ratedHigh: 500, minutes: 262 * 60 })
    const { fake } = setup({}, { gear: { sty }, setups: { den: SETUPS.den } })
    expect(await screen.findByRole('button', { name: 'Den stylus: Healthy, 38 h remaining' })).toBeTruthy()
    act(() => fake.remoteDoc('gear/sty', { minutes: 295 * 60 }))
    expect(await screen.findByRole('button', { name: 'Den stylus: Getting close, 5 h remaining' })).toBeTruthy()
    act(() => fake.remoteDoc('gear/sty', { minutes: 320 * 60 }))
    expect(await screen.findByRole('button', { name: 'Den stylus: Replace window, 180 h to its upper rating' })).toBeTruthy()
  })
})

describe('the Listening summary', () => {
  const plays = (n: number, min: number) => Array.from({ length: n }, () => ({ d: '2020-01-01', t: `Played the whole album (~${min} min)` }))
  const order = () => within(group('Listening')).getAllByRole('button').map((b) => b.querySelector('b')!.textContent)

  it('totals the plays, puts the most played first with ties by hours, and follows record changes made elsewhere', async () => {
    const { fake, user } = setup({}, { gear: GEAR, setups: SETUPS }, (s) => {
      s.records.r3.notes = plays(3, 42)
      s.records.r8 = { title: 'Rumours', artist: 'Fleetwood Mac', status: 'own', runtime: 40, notes: plays(4, 40), added: 8 }
    })
    await equipment(user, /cartridge:/)
    const L = group('Listening')
    // Kind of Blue: 3 plays, 2 this month, the last today; Blue Train: 3 plays and more hours
    expect(within(L).getByText(/^2 plays this month · 10 in all · last spun Kind of Blue, /)).toBeTruthy()
    expect(order()).toEqual(['Rumours', 'Blue Train', 'Kind of Blue'])
    expect(within(L).getByRole('button', { name: /Rumours — Fleetwood Mac/ }).textContent).toContain('4 plays · 2.7 h')

    act(() => fake.remote('r3', { notes: plays(4, 42) }))
    await waitFor(() => expect(within(group('Listening')).getByText(/· 11 in all ·/)).toBeTruthy())
    // now four plays each, and Blue Train has the more hours
    expect(order()).toEqual(['Blue Train', 'Rumours', 'Kind of Blue'])
  })
})

describe('Add equipment', () => {
  it('Cancel saves nothing; a stylus saves its setup, tracking, hours so far and rating', async () => {
    const { fake, user } = setup()
    await equipment(user, /cartridge:/)
    await user.click(within(group('Den')).getByRole('button', { name: 'Add equipment' }))
    await screen.findByRole('heading', { name: 'Add equipment' })
    await user.click(btn('Cartridge'))
    await user.click(btn('Cancel'))
    await screen.findByRole('heading', { name: 'Equipment' })
    expect(sets(fake, 'gear/')).toEqual([])

    await user.click(within(group('Den')).getByRole('button', { name: 'Add equipment' }))
    await user.click(await screen.findByRole('button', { name: 'Stylus' }))
    await user.type(screen.getByRole('textbox', { name: 'Make & model' }), 'Test stylus')
    await user.type(screen.getByRole('textbox', { name: 'Hours played so far' }), '12')
    await user.click(btn('Add'))
    await screen.findByRole('heading', { name: 'Test stylus' })
    expect(sets(fake, 'gear/')).toHaveLength(1)
    expect(sets(fake, 'gear/')[0]).toMatchObject({ name: 'Test stylus', setup: 'den', tracks: true, startHours: 12, ratedLow: 300, ratedHigh: 500 })
  })
})

describe('a setup', () => {
  it('saves its name and notes as they are typed, and an empty name as "Untitled setup"', async () => {
    const { fake, user } = setup()
    await equipment(user, /cartridge:/)
    await user.click(within(group('Den')).getByRole('button', { name: 'Rename or edit setup' }))
    await screen.findByRole('heading', { name: 'Den' })
    expect(screen.getByText('Setup · 2 pieces of equipment')).toBeTruthy()
    const name = screen.getByRole('textbox', { name: 'Name' })
    await user.clear(name)
    await user.type(name, 'Study')
    await user.type(screen.getByRole('textbox', { name: 'Notes' }), ', next to the desk')
    await waitFor(() => expect(sets(fake, 'setups/den').at(-1)).toMatchObject({ name: 'Study', note: 'By the window, next to the desk', added: 1 }), { timeout: 2000 })
    expect(screen.getByRole('status').textContent).toBe('Saved')

    await user.clear(name)
    await waitFor(() => expect(sets(fake, 'setups/den').at(-1)).toMatchObject({ name: 'Untitled setup' }), { timeout: 2000 })
    await user.click(btn('‹ All gear'))
    expect(within(await screen.findByRole('group', { name: 'Untitled setup' })).getByText('By the window, next to the desk')).toBeTruthy()
  })

  it('Delete setup asks first, moves its gear out of any setup and deletes it', async () => {
    const { fake, user } = setup()
    await equipment(user, /cartridge:/)
    await user.click(within(group('Den')).getByRole('button', { name: 'Rename or edit setup' }))
    await user.click(await screen.findByRole('button', { name: /Delete setup/ }))
    const dlg = await screen.findByRole('alertdialog')
    expect(within(dlg).getByText('Move its 2 pieces of equipment out of any setup and delete Den?')).toBeTruthy()
    await user.click(within(dlg).getByRole('button', { name: 'Delete' }))
    await screen.findByRole('heading', { name: 'Equipment' })
    await waitFor(() => expect(fake.calls.some((c) => c.op === 'delete' && c.path === 'setups/den')).toBe(true))
    expect(sets(fake, 'gear/sty').at(-1)).toMatchObject({ setup: '' })
    expect(sets(fake, 'gear/amp').at(-1)).toMatchObject({ setup: '' })
    expect(screen.queryByRole('group', { name: 'Den' })).toBeNull()
    const loose = group('Not in a setup')
    for (const n of [/ATN-VM95E/, /A-S501/, /Cork mat/]) expect(within(loose).getByRole('button', { name: n })).toBeTruthy()
  })

  it('an empty setup asks only to delete it', async () => {
    const { user } = setup()
    await equipment(user, /cartridge:/)
    await user.click(within(group('Office')).getByRole('button', { name: 'Rename or edit setup' }))
    await user.click(await screen.findByRole('button', { name: /Delete setup/ }))
    expect(within(await screen.findByRole('alertdialog')).getByText('Delete Office?')).toBeTruthy()
  })
})

describe('a piece of gear', () => {
  it('Log adds an entry, newest first', async () => {
    const { fake, user } = setup()
    await equipment(user, /cartridge:/)
    await openPiece(user, 'ATN-VM95E')
    const log = group('Log')
    expect(within(log).getByRole('button', { name: 'Log' }).hasAttribute('disabled')).toBe(true)
    await user.type(within(log).getByRole('textbox', { name: 'Log entry' }), 'Cleaned with the brush')
    await user.click(within(log).getByRole('button', { name: 'Log' }))
    await waitFor(() => expect(sets(fake, 'gear/sty').at(-1)).toMatchObject({ notes: [{ d: today(), t: 'Cleaned with the brush' }] }))
    expect(within(log).getByText('Cleaned with the brush')).toBeTruthy()
    expect((within(log).getByRole('textbox', { name: 'Log entry' }) as HTMLInputElement).value).toBe('')
  })

  it('Recent plays shows the last 12, newest first', async () => {
    const P = Array.from({ length: 14 }, (_, i) => ({ d: '2026-01-' + String(i + 1).padStart(2, '0'), title: 'Play ' + (i + 1), min: 40 }))
    const sty = { ...GEAR.sty, plays: P, minutes: 14 * 40 }
    const { user } = setup({}, { gear: { sty }, setups: { den: SETUPS.den } })
    await equipment(user, /stylus:/)
    await openPiece(user, 'ATN-VM95E')
    const rows = within(group('Recent plays')).getAllByRole('listitem')
    expect(rows).toHaveLength(12)
    expect(rows[0].textContent).toContain('Play 14')
    expect(rows[11].textContent).toContain('Play 3')
    expect(within(group('Recent plays')).queryByText('Play 2')).toBeNull()
    expect(rows[0].textContent).toContain('40 min')
  })

  it('a retired piece can be put back in use', async () => {
    const { fake, user } = setup()
    await equipment(user, /cartridge:/)
    await user.click(within(group('Retired')).getByRole('button', { name: /Old stylus/ }))
    await screen.findByRole('heading', { name: 'Old stylus' })
    await user.click(btn('Edit'))
    await user.click(btn('Put back in use'))
    await waitFor(() => expect(sets(fake, 'gear/old').at(-1)).toMatchObject({ status: 'active', retired: '' }))
    await user.click(btn('‹ All gear'))
    expect(within(await screen.findByRole('group', { name: 'Den' })).getByRole('button', { name: /Old stylus/ })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Retired' })).toBeNull()
  })

  it('Delete asks to delete it and its log for good, then it is gone', async () => {
    const { fake, user } = setup()
    await equipment(user, /cartridge:/)
    await openPiece(user, 'A-S501')
    await user.click(btn('Edit'))
    await user.click(btn(/^Delete/))
    const dlg = await screen.findByRole('alertdialog')
    expect(within(dlg).getByText('Delete A-S501 and its log for good?')).toBeTruthy()
    await user.click(within(dlg).getByRole('button', { name: 'Delete' }))
    await screen.findByRole('heading', { name: 'Equipment' })
    await waitFor(() => expect(fake.calls.some((c) => c.op === 'delete' && c.path === 'gear/amp')).toBe(true))
    expect(screen.queryByRole('button', { name: /A-S501/ })).toBeNull()
  })
})

// stands in for a slow write: gear set() calls wait until open() is called
function slowGear(fake: Fake) {
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  type Cap = { collection: (p: string) => { doc: (id?: string) => { set: (d: unknown) => Promise<void> } } }
  const use = async (name: string) => {
    const cap = (await (fake.claude as unknown as { use: (n: string) => Promise<unknown> }).use(name)) as Cap
    if (name !== 'db') return cap
    const collection = (p: string) => {
      const c = cap.collection(p)
      if (p !== 'gear') return c
      return {
        ...c,
        doc: (id?: string) => {
          const d = c.doc(id)
          return { ...d, set: async (data: unknown) => (await gate, d.set(data)) }
        },
      }
    }
    return { ...cap, collection }
  }
  return { claude: { use } as unknown as Window['claude'], open: () => release() }
}

describe('gear writes in flight', () => {
  it('a snapshot arriving before a gear write lands does not undo it, and is shown once the write is done', async () => {
    const fake = fakeClaude({ ...sample(), collections: { gear: GEAR, setups: SETUPS } })
    const slow = slowGear(fake)
    render(
      <RuntimeProvider claude={slow.claude}>
        <App />
      </RuntimeProvider>,
    )
    const user = userEvent.setup()
    await equipment(user, /cartridge:/)
    await openPiece(user, 'ATN-VM95E')
    await user.type(screen.getByRole('textbox', { name: 'Log entry' }), 'Cleaned with the brush')
    await user.click(btn('Log'))
    expect(screen.getByText('Cleaned with the brush')).toBeTruthy()
    // another device changes the turntable: this snapshot doesn't have the entry yet
    act(() => fake.remoteDoc('gear/tt', { minutes: 660 }))
    await settle()
    expect(screen.getByText('Cleaned with the brush')).toBeTruthy()
    slow.open()
    await waitFor(() => expect(sets(fake, 'gear/sty')).toHaveLength(1))
    await settle()
    expect(screen.getByText('Cleaned with the brush')).toBeTruthy()
    await user.click(btn('‹ All gear'))
    expect(within(await screen.findByRole('button', { name: /SL-1500C/ })).getByText('11 h')).toBeTruthy()
  })
})

describe('when a gear write fails', () => {
  it('says "Couldn\'t save equipment"', async () => {
    const { user } = setup({ failWrites: true })
    await equipment(user, /cartridge:/)
    await openPiece(user, 'ATN-VM95E')
    await user.type(screen.getByRole('textbox', { name: 'Log entry' }), 'Cleaned')
    await user.click(btn('Log'))
    expect(await screen.findByText("Couldn't save equipment: Not allowed")).toBeTruthy()
  })

  it('says "Couldn\'t save the setup"', async () => {
    const { user } = setup({ failWrites: true })
    await equipment(user, /cartridge:/)
    await user.click(within(group('Office')).getByRole('button', { name: 'Rename or edit setup' }))
    await user.type(await screen.findByRole('textbox', { name: 'Name' }), ' 2')
    expect(await screen.findByText("Couldn't save the setup: Not allowed", {}, { timeout: 2000 })).toBeTruthy()
  })

  it('says "Couldn\'t delete" for a piece of gear', async () => {
    const { user } = setup({ failWrites: true })
    await equipment(user, /cartridge:/)
    await openPiece(user, 'A-S501')
    await user.click(btn('Edit'))
    await user.click(btn(/^Delete/))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText("Couldn't delete: Not allowed")).toBeTruthy()
  })

  it('says "Couldn\'t delete" for a setup', async () => {
    const { user } = setup({ failWrites: true })
    await equipment(user, /cartridge:/)
    await user.click(within(group('Office')).getByRole('button', { name: 'Rename or edit setup' }))
    await user.click(await screen.findByRole('button', { name: /Delete setup/ }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText("Couldn't delete: Not allowed")).toBeTruthy()
  })

  it('says "Couldn\'t add the setup"', async () => {
    const { user } = setup({ failWrites: true })
    await equipment(user, /cartridge:/)
    await user.click(btn('+ Add another setup'))
    expect(await screen.findByText("Couldn't add the setup: Not allowed", {}, { timeout: 2000 })).toBeTruthy()
  })

  it('suggests what a log entry might say', async () => {
    const { user } = setup()
    await equipment(user, /cartridge:/)
    await openPiece(user, 'ATN-VM95E')
    expect(screen.getByRole('textbox', { name: 'Log entry' }).getAttribute('placeholder')).toBe('e.g. Cleaned with the brush')
  })
})
