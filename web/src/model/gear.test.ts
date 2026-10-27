import { describe, expect, it } from 'vitest'
import { ALL_SETUPS, gearForPlay, gearOfPlay, gState, offText, pillOf, playOff, replaced, type Gear, type Setup } from './gear'

const stylus = (min: number, x: Partial<Gear> = {}): Gear => ({ id: 's', type: 'stylus', name: 'VM95E', tracks: true, ratedLow: 300, ratedHigh: 500, minutes: min, setup: 'den', ...x })
const S: Setup[] = [{ id: 'den', name: 'Den', added: 1 }, { id: 'lr', name: 'Living room', added: 2 }]

describe('wear', () => {
  it('goes healthy, getting close, replace window, replace now', () => {
    expect(gState(stylus(60 * 100)).label).toBe('Healthy')
    expect(gState(stylus(60 * 295)).tone).toBe('warn')
    expect(gState(stylus(60 * 300)).label).toBe('Replace window')
    expect(gState(stylus(60 * 500)).label).toBe('Replace now')
    expect(gState(stylus(0, { ratedLow: '', ratedHigh: '' })).label).toBe('Tracking')
  })
})

describe('the header pill', () => {
  it('invites an owner with no gear, counts unrated gear, and shows the worst rated part', () => {
    expect(pillOf([], S)).toMatchObject({ label: '', aria: 'Add your gear' })
    expect(pillOf([{ id: 'a', type: 'amp' }, { id: 'b', type: 'speakers' }], S)).toMatchObject({ label: 'Gear', aria: 'Equipment: 2 items' })
    const p = pillOf([stylus(60 * 250), stylus(60 * 100, { id: 't', type: 'belt', ratedLow: 1000, ratedHigh: '' })], S)
    expect(p).toMatchObject({ label: 'Stylus', aria: 'Den stylus: Healthy, 50 h remaining' })
    expect(pillOf([stylus(60 * 320)], S).aria).toBe('Den stylus: Replace window, 180 h to its upper rating')
    expect(pillOf([stylus(60 * 520, { setup: '' })], S).aria).toBe('Stylus: Replace now, 20 h past its rating')
  })
})

describe('plays on gear', () => {
  const gear: Gear[] = [
    stylus(60),
    { id: 'tt', type: 'turntable', tracks: true, setup: 'lr', minutes: 0 },
    { id: 'hp', type: 'headphones', tracks: true, setup: ALL_SETUPS, minutes: 0 },
    { id: 'old', type: 'belt', tracks: true, setup: 'gone', minutes: 0 },
    { id: 'amp', type: 'amp', tracks: false, setup: 'den' },
    { id: 'ret', type: 'stylus', tracks: true, setup: 'den', status: 'retired' },
  ]
  it('adds the minutes to tracked gear in that setup, shared gear and gear in no setup', () => {
    const hits = gearForPlay(gear, S, 'den', { id: 'r1', title: 'Kind of Blue' }, 46, '2026-10-24')
    expect(hits.map((x) => x.g.id).sort()).toEqual(['hp', 'old', 's'])
    expect(hits.find((x) => x.g.id === 's')!.data).toMatchObject({ minutes: 106, installed: '2026-10-24', plays: [{ d: '2026-10-24', id: 'r1', title: 'Kind of Blue', min: 46, setup: 'den' }] })
  })
  it('adds to all tracked gear when there are no setups, without a setup on the entry', () => {
    const hits = gearForPlay(gear, [], '', { id: 'r1' }, 20, '2026-10-24')
    expect(hits).toHaveLength(4)
    expect(hits[0].data.plays[0]).not.toHaveProperty('setup')
  })
  it('finds the entries again to take them off, and names what they were', () => {
    const g = { ...stylus(106), plays: [{ d: '2026-10-24', id: 'r1', title: 'x', min: 46 }] }
    const hits = gearOfPlay([g], 'r1', { d: '2026-10-24', t: 'Played the whole album on Den (~46 min)' })
    expect(hits).toEqual([{ g, k: 0, m: 46 }])
    expect(playOff(g, 0, 46)).toEqual({ minutes: 60, plays: [] })
    expect(offText(hits)).toBe(' ~46 min come off your stylus.')
    expect(gearOfPlay([g], 'r1', { d: '2026-10-23', t: 'Played the whole album (~46 min)' })).toEqual([])
  })
})

it('Replace retires the old one and starts a fresh one in the same setup', () => {
  const { old, fresh } = replaced({ ...stylus(60 * 320), specs: '1.8 g', notes: [] }, '2026-10-24')
  expect(old).toMatchObject({ status: 'retired', retired: '2026-10-24', notes: [{ t: 'Retired at 320 h. Replaced with a new one.' }] })
  expect(fresh).toMatchObject({ type: 'stylus', name: 'VM95E', setup: 'den', ratedLow: 300, ratedHigh: 500, specs: '1.8 g', minutes: 0, startHours: 0, installed: '2026-10-24' })
})
