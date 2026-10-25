import { describe, expect, it } from 'vitest'
import { newDoc } from './create'
import { patchFor, toForm } from './edit'
import { discogsLinks, trackUrl } from './orders'
import { orderStatusOf, tagOf, type Rec } from './record'
import { badgesOf, playStats, rankedPlays } from './stats'

describe('orders', () => {
  it("links a tracking number to its carrier's page, a pasted link as it is, anything else to a search", () => {
    expect(trackUrl('USPS', '9400 1')).toBe('https://tools.usps.com/go/TrackConfirmAction?tLabels=9400%201')
    expect(trackUrl('ups ground', '1Z9')).toBe('https://www.ups.com/track?tracknum=1Z9')
    expect(trackUrl('FedEx', '77')).toBe('https://www.fedex.com/fedextrack/?trknbr=77')
    expect(trackUrl('DHL', '55')).toBe('https://www.dhl.com/us-en/home/tracking.html?tracking-id=55')
    expect(trackUrl('Royal Mail', 'AB1')).toBe('https://www.google.com/search?q=royal%20mail%20tracking%20AB1')
    expect(trackUrl('', ' https://track.example.com/x?id=1 ')).toBe('https://track.example.com/x?id=1')
    expect(trackUrl('', 'javascript:alert(1)')).toBe('https://www.google.com/search?q=tracking%20javascript%3Aalert(1)')
    expect(trackUrl('UPS', '')).toBe('')
  })

  it("links the edition ordered on Discogs, or searches for it, without repeats", () => {
    const q = encodeURIComponent('Steely Dan Aja')
    expect(discogsLinks({ id: 'a', title: 'Aja', artist: 'Steely Dan', status: 'ordered', discogsId: 42 })).toEqual([
      ['The edition you ordered', 'https://www.discogs.com/release/42'],
      ['What it sells for', 'https://www.discogs.com/sell/history/42'],
      ['Other pressings', `https://www.discogs.com/search/?q=${q}&type=release&format_exact=Vinyl`],
    ])
    expect(discogsLinks({ id: 'a', title: 'Aja', artist: 'Steely Dan', status: 'ordered' }).map((l) => l[0])).toEqual([
      'Find the edition',
      'Past sales (Popsike)',
    ])
  })

  it('reads an order state it has no option for as Ordered', () => {
    expect(orderStatusOf({ id: 'a', orderStatus: 'delivered' })).toBe('ordered')
    expect(orderStatusOf({ id: 'a', orderStatus: 'toString' })).toBe('ordered')
    expect(orderStatusOf({ id: 'a', orderStatus: 'delayed' })).toBe('delayed')
    expect(tagOf({ id: 'a', status: 'ordered', orderStatus: 'delivered' })?.text).toBe('Ordered')
  })

  it("edits an order's fields in production's shapes; reading them writes nothing", () => {
    const r: Rec = { id: 'a', title: 'Aja', artist: 'Steely Dan', status: 'ordered', orderStatus: 'delivered', paid: '30', orderNotes: 'Left at door ' }
    const base = toForm(r)
    expect(base.orderStatus).toBe('ordered')
    expect(patchFor(r, base, { ...base })).toEqual({})
    const p = patchFor(r, base, { ...base, orderStatus: 'shipped', tracking: ' 1Z9 ', paid: '$32', orderNotes: 'Left at door, wet ' })
    expect(p).toEqual({ orderStatus: 'shipped', tracking: '1Z9', paid: '32', orderNotes: 'Left at door, wet ' })
    // only an older record with order notes shows the box
    expect(toForm({ id: 'b', status: 'ordered' }).orderNotes).toBeUndefined()
    expect(toForm({ id: 'c', status: 'own' }).orderStatus).toBeUndefined()
  })

  it('a new order keeps the state chosen in Add details now', () => {
    const f = { ...toForm({ id: '', status: 'ordered' }), title: 'Aja', artist: 'Steely Dan', orderStatus: 'preorder', eta: '2026-12-01' }
    const d = newDoc(f, 'ordered', null)
    expect(d).toMatchObject({ status: 'ordered', orderStatus: 'preorder', eta: '2026-12-01' })
    expect(newDoc({ title: 'X', artist: 'Y', why: '', year: '', runtime: '' }, 'ordered', null).orderStatus).toBe('ordered')
  })
})

const play = (d: string, min = 40, how = 'the whole album') => ({ d, t: `Played ${how} (~${min} min)` })
const own = (id: string, notes: unknown[], extra: Partial<Rec> = {}): Rec => ({ id, title: id, status: 'own', notes, ...extra })
const DAY = '2026-10-24'

describe('listening stats and badges', () => {
  it('counts only play notes: plays, minutes, this month and the latest', () => {
    const r = own('a', [play('2026-09-30', 46), { d: '2026-10-02', t: 'Cleaned it (~10 min)' }, play('2026-10-03', 23, 'one side'), 'junk', null])
    expect(playStats(r, DAY)).toEqual({ count: 2, min: 69, month: 1, mmin: 23, last: '2026-10-03' })
  })

  it('ranks owned records only, most played first', () => {
    const recs = [own('a', [play('2026-10-01')]), own('b', [play('2026-10-01'), play('2026-10-02')]), own('c', [play('2026-10-01')], { status: 'ordered' })]
    expect(rankedPlays(recs, DAY).map((x) => x.r.id)).toEqual(['b', 'a'])
  })

  it('the leader with 2 or more plays earns Most played ever and Top this month; a tie earns neither', () => {
    const a = own('a', [play('2026-09-01'), play('2026-09-02'), play('2026-10-01')])
    const b = own('b', [play('2026-10-05'), play('2026-10-06')])
    expect(badgesOf(a, [a, b], DAY).map((x) => x.name)).toEqual(['Most played ever'])
    expect(badgesOf(b, [a, b], DAY).map((x) => x.name)).toEqual(['Top this month'])
    // the month turns: nobody has a play in November yet
    expect(badgesOf(b, [a, b], '2026-11-01')).toEqual([])
    const c = own('c', [play('2026-10-05'), play('2026-10-06')])
    expect(badgesOf(b, [b, c], DAY)).toEqual([])
    const solo = own('d', [play('2026-10-05')])
    expect(badgesOf(solo, [solo], DAY)).toEqual([])
  })

  it('marks 10, 50 and 100 hours in bronze, silver and gold', () => {
    const hrs = (h: number) => own('h', [play('2025-01-01', h * 60), play('2025-01-02', 0)])
    const tier = (h: number) => badgesOf(hrs(h), [hrs(h), own('z', [play('2025-01-01'), play('2025-01-01'), play('2025-01-01')])], DAY)
    expect(tier(9.9)).toEqual([])
    expect(tier(10)).toEqual([{ metal: 'bronze', icon: 'disc', name: '10+ hours' }])
    expect(tier(50)[0].metal).toBe('silver')
    expect(tier(100)[0]).toEqual({ metal: 'gold', icon: 'disc', name: '100+ hours' })
  })
})
