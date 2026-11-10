// Sightings (#152): a wanted record seen on a shop's racks, not bought yet. Kept on the record as `sightings`, newest
// first, each with the shop: its id on your list (`shopId`, which a rename keeps, so the sighting follows the shop) and
// the name it had (`shop`, for a shop not on the list or since removed), the day and, when remembered, the price, the
// pressing and a note. Never deleted by age: after RECENT_DAYS it stops counting as a lead to go back for. Bought there
// (Got it at that shop), it keeps the day as `bought` and stops being a lead.
import { kindOf, longDate, today, type Rec } from './record'
import type { Shop } from './shops'

export type Sighting = { id: string; shopId?: string; shop: string; d: string; price?: string; pressing?: string; note?: string; bought?: string }
export const RECENT_DAYS = 30

const DAY = /^\d{4}-\d\d-\d\d$/
const text = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '')

// the record's sightings, cleaned (a shop and a day each), newest first
export function sightingsOf(r: Rec): Sighting[] {
  const list = Array.isArray(r.sightings) ? r.sightings : []
  // one without an id (written in chat) goes by its place in the stored list
  return list
    .map((s, i) => [s, i] as const)
    .filter((e): e is readonly [Record<string, unknown>, number] => !!e[0] && typeof e[0] === 'object' && !!text(e[0].shop, 80) && DAY.test(String(e[0].d)))
    .map(([s, i]) => {
      const x: Sighting = { id: text(s.id, 40) || 'g' + i, shop: text(s.shop, 80), d: String(s.d) }
      const sid = text(s.shopId, 40)
      if (sid) x.shopId = sid
      if (DAY.test(String(s.bought))) x.bought = String(s.bought)
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

// a wanted record's newest sighting from the last RECENT_DAYS days, not bought: the lead to go back for
export function recentSighting(r: Rec, now = today()): Sighting | undefined {
  if (kindOf(r) !== 'wish') return undefined
  const s = sightingsOf(r).find((x) => !x.bought)
  return s && daysSince(s.d, now) <= RECENT_DAYS ? s : undefined
}

// a sighting at this shop: by its id, or by name when it was logged without one
const isAt = (s: Sighting, shop: { id?: string; name: string }) =>
  s.shopId ? s.shopId === shop.id : s.shop.toLowerCase() === shop.name.toLowerCase()

// Seen here: every record seen at a shop, newest first
export function sightingsAt(records: Rec[], shop: Shop): { r: Rec; s: Sighting }[] {
  return records
    .filter((r) => !r.deleted)
    .flatMap((r) => sightingsOf(r).filter((s) => isAt(s, shop)).map((s) => ({ r, s })))
    .sort((a, b) => b.s.d.localeCompare(a.s.d))
}

// Got it at a shop where it was seen: those sightings are marked bought today; {} when none was
export function boughtPatch(r: Rec, name: string, list: Shop[]): { sightings?: unknown[] } {
  const n = name.trim()
  if (!n) return {}
  const shop = list.find((x) => x.name.toLowerCase() === n.toLowerCase()) ?? { name: n }
  const keep = Array.isArray(r.sightings) ? r.sightings : []
  const at = new Set(sightingsOf(r).filter((s) => !s.bought && isAt(s, shop)).map((s) => s.id))
  if (!at.size) return {}
  const t = today()
  return { sightings: keep.map((x, i) => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    return at.has(text(o.id, 40) || 'g' + i) ? { ...o, bought: t } : x
  }) }
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
