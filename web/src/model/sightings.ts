// Sightings (#152): a wanted record seen on a shop's racks, not bought yet. Kept on the record as `sightings`, newest
// first, each with the shop: its id on your list (`shopId`, which a rename keeps, so the sighting follows the shop) and
// the name it had (`shop`, for a shop not on the list or since removed), the day and, when remembered, the price, the
// pressing and a note. Never deleted by age: after RECENT_DAYS it stops counting as a lead to go back for.
import { kindOf, longDate, today, type Rec } from './record'
import type { Shop } from './shops'

export type Sighting = { id: string; shopId?: string; shop: string; d: string; price?: string; pressing?: string; note?: string }
export const RECENT_DAYS = 30

const DAY = /^\d{4}-\d\d-\d\d$/
const text = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '')

// the record's sightings, cleaned (a shop and a day each), newest first
export function sightingsOf(r: Rec): Sighting[] {
  const list = Array.isArray(r.sightings) ? r.sightings : []
  return list
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && !!text(s.shop, 80) && DAY.test(String(s.d)))
    .map((s, i) => {
      const x: Sighting = { id: text(s.id, 40) || 'g' + i, shop: text(s.shop, 80), d: String(s.d) }
      const sid = text(s.shopId, 40)
      if (sid) x.shopId = sid
      for (const k of ['price', 'pressing', 'note'] as const) {
        const v = text(s[k], k === 'note' ? 400 : 120)
        if (v) x[k] = v
      }
      return x
    })
    .sort((a, b) => b.d.localeCompare(a.d))
}

// the shop's name now: as your list has it (renamed or not), else as it was written
export const seenAt = (s: Sighting, list: Shop[]) => (s.shopId && list.find((x) => x.id === s.shopId)?.name) || s.shop

// whole days from a day to today (0 today)
export const daysSince = (d: string, now = today()) => Math.round((+new Date(now + 'T12:00') - +new Date(d + 'T12:00')) / 864e5)
export const agoText = (d: string, now = today()) => {
  const n = daysSince(d, now)
  return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n < RECENT_DAYS + 1 ? `${n} days ago` : longDate(d)
}

// a wanted record's newest sighting from the last RECENT_DAYS days: the lead to go back for
export function recentSighting(r: Rec, now = today()): Sighting | undefined {
  if (kindOf(r) !== 'wish') return undefined
  const s = sightingsOf(r)[0]
  return s && daysSince(s.d, now) <= RECENT_DAYS ? s : undefined
}

// the patch that adds one (list: your shops, so one named as the list names it is linked by its id), and the one that
// takes one off (by its id, or its shop and day when one written in chat has none); null when it's already gone
export function addSighting(r: Rec, s: Omit<Sighting, 'id' | 'shopId'>, list: Shop[]): { sightings: Record<string, unknown>[] } {
  const keep = Array.isArray(r.sightings) ? r.sightings : []
  const name = s.shop.trim().slice(0, 80)
  const add: Record<string, unknown> = { id: Math.random().toString(36).slice(2, 12), shop: name, d: s.d }
  const on = list.find((x) => x.name.toLowerCase() === name.toLowerCase())
  if (on) add.shopId = on.id
  for (const k of ['price', 'pressing', 'note'] as const) if (s[k]?.trim()) add[k] = s[k]!.trim()
  return { sightings: [add, ...keep] }
}
export function removeSighting(r: Rec, s: Sighting): { sightings: unknown[] } | null {
  const keep = Array.isArray(r.sightings) ? r.sightings : []
  const i = keep.findIndex((x) => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    return o.id ? o.id === s.id : text(o.shop, 80) === s.shop && o.d === s.d
  })
  return i < 0 ? null : { sightings: keep.filter((_, j) => j !== i) }
}
