import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../App'
import { today } from '../model/record'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'

type C = Record<string, Record<string, unknown>>
const SETUPS: C = { den: { name: 'Den', note: 'By the window', added: 1 }, lr: { name: 'Living room', note: '', added: 2 } }
const GEAR: C = {
  sty: { type: 'stylus', name: 'ATN-VM95E', setup: 'den', status: 'active', tracks: true, ratedLow: 300, ratedHigh: 500, startHours: 290, minutes: 0, plays: [], notes: [{ d: '2026-10-01', t: 'Set tracking force to 2 g' }], added: 1 },
  tt: { type: 'turntable', name: 'SL-1500C', setup: 'lr', status: 'active', tracks: true, minutes: 600, plays: [], notes: [], added: 2 },
  hp: { type: 'headphones', name: 'HD 600', setup: '*', status: 'active', tracks: true, minutes: 0, plays: [], notes: [], added: 3 },
  amp: { type: 'amp', name: 'A-S501', setup: 'den', status: 'active', tracks: false, installed: '2024-05-01', added: 4 },
}

function setup(opts: Parameters<typeof fakeClaude>[1] = {}, collections: Record<string, C> = { gear: GEAR, setups: SETUPS }) {
  const fake = fakeClaude({ ...sample(), collections }, opts)
  render(
    <RuntimeProvider claude={fake.claude}>
      <App />
    </RuntimeProvider>,
  )
  return { fake, user: userEvent.setup() }
}
type Fake = ReturnType<typeof fakeClaude>
const sets = (fake: Fake, path: string) => fake.calls.filter((c) => c.op === 'set' && c.path.startsWith(path)).map((c) => ({ path: c.path, ...c.data! }))
const btn = (name: string | RegExp) => screen.getByRole('button', { name })
const equipment = async (user: ReturnType<typeof userEvent.setup>, pill: RegExp) => {
  await user.click(await screen.findByRole('button', { name: pill }))
  await screen.findByRole('heading', { name: 'Equipment' })
}

describe('the header pill', () => {
  it('shows the stylus wear and opens Equipment', async () => {
    const { user } = setup()
    const pill = await screen.findByRole('button', { name: 'Den stylus: Getting close, 10 h remaining' })
    // its name shows as a tooltip on hover
    await userEvent.hover(pill)
    expect(await screen.findByText('Den stylus: Getting close, 10 h remaining')).toBeTruthy()
    await equipment(user, /stylus:/)
    for (const name of ['Listening', 'Den', 'Living room', 'Shared equipment']) expect(screen.getByRole('group', { name })).toBeTruthy()
    expect(within(screen.getByRole('group', { name: 'Den' })).getByText('By the window')).toBeTruthy()
  })

  it('invites an owner with no gear, and is hidden from viewers until there is some', async () => {
    setup({}, {})
    expect(await screen.findByRole('button', { name: 'Add your gear' })).toBeTruthy()
  })
  it('is hidden from a viewer with no gear', async () => {
    setup({ canWrite: false }, {})
    await screen.findByRole('button', { name: /Open Kind of Blue/ })
    expect(screen.queryByRole('button', { name: 'Add your gear' })).toBeNull()
  })
})

describe('the Equipment sheet', () => {
  it('a first setup: Add your turntable makes "My setup" and adds its turntable, then opens it', async () => {
    const { fake, user } = setup({}, {})
    await equipment(user, /Add your gear/)
    await user.click(btn('Add your turntable'))
    await screen.findByRole('heading', { name: 'Add equipment' })
    expect(screen.getByText('To My setup')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Turntable' }).getAttribute('aria-pressed')).toBe('true')
    await user.type(screen.getByRole('textbox', { name: 'Make & model' }), 'Technics SL-1500C')
    await user.click(btn('Add'))
    await screen.findByRole('heading', { name: 'Technics SL-1500C' })
    const [su] = sets(fake, 'setups/')
    expect(su).toMatchObject({ name: 'My setup' })
    expect(sets(fake, 'gear/')[0]).toMatchObject({ type: 'turntable', name: 'Technics SL-1500C', setup: su.path.split('/')[1], tracks: true, minutes: 0 })
    await user.click(btn('‹ All gear'))
    expect(await screen.findByRole('button', { name: 'Add another setup' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add your turntable' })).toBeNull()
  })

  it('the Listening summary opens a record, which offers the way back', async () => {
    const { user } = setup()
    await equipment(user, /stylus:/)
    const L = screen.getByRole('group', { name: 'Listening' })
    expect(within(L).getByText(/in all · last spun Kind of Blue/)).toBeTruthy()
    await user.click(within(L).getByRole('button', { name: /Kind of Blue/ }))
    await screen.findByRole('heading', { name: 'Kind of Blue' })
    await user.click(btn('‹ Equipment'))
    expect(await screen.findByRole('heading', { name: 'Equipment' })).toBeTruthy()
  })

  it('a piece of gear: play time and details in view, the fields in edit', async () => {
    const { fake, user } = setup()
    await equipment(user, /stylus:/)
    await user.click(screen.getByRole('button', { name: /ATN-VM95E/ }))
    await screen.findByRole('heading', { name: 'ATN-VM95E' })
    expect(screen.getByText('Getting close')).toBeTruthy()
    expect(screen.getByText('Set tracking force to 2 g')).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Make & model' })).toBeNull()
    await user.type(screen.getByRole('textbox', { name: 'Minutes played off the wall' }), '45')
    await user.click(btn('Add time'))
    await waitFor(() => expect(sets(fake, 'gear/sty').at(-1)).toMatchObject({ minutes: 45, plays: [{ title: 'Manual entry', min: 45 }] }))

    await user.click(btn('Edit'))
    const name = screen.getByRole('textbox', { name: 'Make & model' })
    await user.clear(name)
    await user.type(name, 'VM95ML')
    await user.click(btn('Done'))
    await waitFor(() => expect(sets(fake, 'gear/sty').at(-1)).toMatchObject({ name: 'VM95ML', ratedLow: 300, startHours: 290, notes: [{ t: 'Set tracking force to 2 g' }] }))
  })

  it('Replace asks calmly, retires this one and opens the new one', async () => {
    const { fake, user } = setup()
    await equipment(user, /stylus:/)
    await user.click(screen.getByRole('button', { name: /ATN-VM95E/ }))
    await user.click(await screen.findByRole('button', { name: 'Replace with a new one' }))
    const dlg = await screen.findByRole('alertdialog')
    expect(within(dlg).getByText('Retire this stylus at 290 h and start a fresh one at 0 h today?')).toBeTruthy()
    expect(within(dlg).getByRole('button', { name: 'Not yet' })).toBeTruthy()
    await user.click(within(dlg).getByRole('button', { name: 'Replace' }))
    await waitFor(() => expect(sets(fake, 'gear/')).toHaveLength(2))
    const [old, fresh] = sets(fake, 'gear/')
    expect(old).toMatchObject({ path: 'gear/sty', status: 'retired', retired: today() })
    expect(fresh).toMatchObject({ name: 'ATN-VM95E', setup: 'den', minutes: 0, startHours: 0, notes: [{ t: 'Installed as a replacement.' }] })
    expect(await screen.findByText('0.0')).toBeTruthy()
  })

  it('deleting a log entry asks first', async () => {
    const { fake, user } = setup()
    await equipment(user, /stylus:/)
    await user.click(screen.getByRole('button', { name: /ATN-VM95E/ }))
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    const dlg = await screen.findByRole('alertdialog')
    await user.click(within(dlg).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(sets(fake, 'gear/sty').at(-1)).toMatchObject({ notes: [] }))
  })

  it('a viewer sees the gear without any way to change it', async () => {
    const { user } = setup({ canWrite: false })
    await equipment(user, /stylus:/)
    expect(screen.queryByRole('button', { name: 'Add equipment' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add another setup' })).toBeNull()
    await user.click(screen.getByRole('button', { name: /ATN-VM95E/ }))
    await screen.findByRole('heading', { name: 'ATN-VM95E' })
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Replace with a new one' })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})

describe('plays on gear', () => {
  it('Log play names the setup and adds its minutes to the gear on it and shared gear', async () => {
    const { fake, user } = setup()
    await user.click(await screen.findByRole('button', { name: /Open Blue Train/ }))
    await screen.findByRole('heading', { name: 'Blue Train' })
    await user.click(screen.getByRole('combobox', { name: 'Played on' }))
    await user.click(await screen.findByRole('option', { name: 'Den' }))
    await user.click(btn('Log play'))
    expect(await screen.findByText('Logged 42 min on 2 pieces of gear. ATN-VM95E at 291 h · Getting close.')).toBeTruthy()
    const rec = fake.calls.filter((c) => c.path === 'records/r3' && c.op === 'update').at(-1)!.data!
    expect((rec.notes as { t: string }[]).at(-1)!.t).toBe('Played the whole album on Den (~42 min)')
    await waitFor(() => expect(sets(fake, 'gear/').map((x) => x.path).sort()).toEqual(['gear/hp', 'gear/sty']))
    expect(sets(fake, 'gear/sty')[0]).toMatchObject({ minutes: 42, plays: [{ id: 'r3', min: 42, setup: 'den' }] })

    // Undo takes the minutes back off
    await user.click(btn('Undo'))
    await waitFor(() => expect(sets(fake, 'gear/sty').at(-1)).toMatchObject({ minutes: 0, plays: [] }))
  })

  it('a wall with one setup names it without asking', async () => {
    const { fake, user } = setup({}, { setups: { den: SETUPS.den }, gear: { sty: GEAR.sty } })
    await user.click(await screen.findByRole('button', { name: /Open Blue Train/ }))
    await screen.findByRole('heading', { name: 'Blue Train' })
    expect(screen.queryByRole('combobox', { name: 'Played on' })).toBeNull()
    await user.click(btn('Log play'))
    await waitFor(() => expect(sets(fake, 'gear/sty')).toHaveLength(1))
    const rec = fake.calls.filter((c) => c.path === 'records/r3' && c.op === 'update').at(-1)!.data!
    expect((rec.notes as { t: string }[]).at(-1)!.t).toBe('Played the whole album on Den (~42 min)')
  })

  it('deleting a play says what comes off the gear, and takes it off', async () => {
    const hp = { ...GEAR.hp, minutes: 46, plays: [{ d: today(), id: 'r1', title: 'Kind of Blue', min: 46, setup: 'lr' }] }
    const { fake, user } = setup({}, { setups: SETUPS, gear: { ...GEAR, hp } })
    await user.click(await screen.findByRole('button', { name: /Open Kind of Blue/ }))
    await screen.findByRole('heading', { name: 'Kind of Blue' })
    const row = screen.getByText(/Whole album · Living room/).closest('li')!
    await user.click(within(row).getByRole('button', { name: /Thoughts|Edit/ }))
    await user.click(btn('Delete this play'))
    const dlg = await screen.findByRole('alertdialog')
    expect(within(dlg).getByText('Delete this play? ~46 min come off your headphones.')).toBeTruthy()
    await user.click(within(dlg).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(sets(fake, 'gear/hp').at(-1)).toMatchObject({ minutes: 0, plays: [] }))
  })

  it('a play just logged still offers Undo after its sheet is closed and opened again', async () => {
    const { fake, user } = setup({}, { setups: { den: SETUPS.den }, gear: { sty: GEAR.sty } })
    await user.click(await screen.findByRole('button', { name: /Open Blue Train/ }))
    await screen.findByRole('heading', { name: 'Blue Train' })
    await user.click(btn('Log play'))
    await screen.findByRole('button', { name: 'Undo' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Blue Train' })).toBeNull())
    await user.click(screen.getByRole('button', { name: /Open Blue Train/ }))
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(sets(fake, 'gear/sty').at(-1)).toMatchObject({ minutes: 0, plays: [] }))
  })
})
