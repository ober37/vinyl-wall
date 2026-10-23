// The wall's filter (the counts under the title) and search, as in app/vinyl-wall.html
import { kindOf, wallOrder, type Rec } from './record'

export const FKEYS = ['own', 'ord', 'p1', 'p2', 'p3'] as const
export type FKey = (typeof FKEYS)[number]
export const FLABEL: Record<FKey, string> = { own: 'owned', ord: 'on the way', p1: 'top want', p2: 'want', p3: 'someday' }

export function fkey(r: Rec): FKey {
  const k = kindOf(r)
  return k === 'ordered' ? 'ord' : k === 'wish' ? (r.priority == 1 ? 'p1' : r.priority == 3 ? 'p3' : 'p2') : 'own'
}

// capitals and accents don't matter
export const fold = (t: unknown) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
const words = (q: string) => fold(q).split(/\s+/).filter(Boolean)
// every typed word must appear in the title, artist, label or year
const matches = (r: Rec, w: string[]) => {
  const hay = fold([r.title, r.artist, r.label, r.year].join(' '))
  return w.every((x) => hay.includes(x))
}

// the counts, the badges actually filtering (chosen ones some record has), and the records shown in wall order.
// Nothing chosen, or only badges no record has, shows them all.
export function shownList(records: Rec[], filter: FKey[], query: string) {
  const all = wallOrder(records)
  const n: Partial<Record<FKey, number>> = {}
  for (const r of all) n[fkey(r)] = (n[fkey(r)] || 0) + 1
  const on = FKEYS.filter((k) => filter.includes(k) && n[k])
  const w = words(query)
  return { n, on, list: all.filter((r) => (!on.length || on.includes(fkey(r))) && (!w.length || matches(r, w))) }
}
