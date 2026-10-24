// The copies a wanted record hunts, ported from app/vinyl-wall.html. The first lives in the record's own fields (copyName,
// pressing, label, catalog, budget, discogsId), so Discogs sync and older walls read it as before; any others are in
// moreCopies, in the order they were added. Owned and ordered records keep only moreCopies: the copies still wanted.
import { kindOf, pressingText, type Rec } from './record'

export type Copy = { name: string; pressing: string; label: string; catalog: string; budget: string; discogsId: number | '' }
export const COPY_KEYS = ['name', 'pressing', 'label', 'catalog', 'budget'] as const

const s = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')
const did = (v: unknown): number | '' => {
  const n = parseInt(String(v), 10)
  return n > 0 ? n : ''
}
export const emptyCopy = (): Copy => ({ name: '', pressing: '', label: '', catalog: '', budget: '', discogsId: '' })

export function wantCopies(r: Rec): Copy[] {
  const more = (Array.isArray(r.moreCopies) ? r.moreCopies : []).filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
  return [
    { name: s(r.copyName), pressing: pressingText(r), label: s(r.label), catalog: s(r.catalog), budget: s(r.budget), discogsId: did(r.discogsId) },
    ...more.map((c) => ({ name: s(c.name), pressing: s(c.pressing), label: s(c.label), catalog: s(c.catalog), budget: s(c.budget), discogsId: did(c.discogsId) })),
  ]
}

// a copy's name for headings and the copy picker: its name, else its pressing, else its Discogs release, else "Copy N"
export const copyTitle = (c: Copy, i: number) =>
  c.name || c.pressing.split('\n')[0].trim() || (c.discogsId ? 'Discogs release ' + c.discogsId : 'Copy ' + (i + 1))
export const copyHas = (c: Copy) => COPY_KEYS.some((k) => c[k])

// the sync's matcher's own discogsMatch values (tools/discogs_sync.py); any other value was chosen by someone
export const AUTO_MATCH = [
  'master main release', 'vinyl: master main release', 'vinyl: earliest original pressing', 'vinyl: first matching release',
  'catalog', 'catalog+pressing',
]
const origLabel = (r: Rec) => (!r.aboutBlocked && r.about?.label) || ''

// the record's own fields are a copy the person chose only when they filled them in: an album label the lookup found, or a
// Discogs release the matcher picked, isn't one
export function firstCopyChosen(r: Rec): boolean {
  const c = wantCopies(r)[0]
  const auto = AUTO_MATCH.includes(String(r.discogsMatch))
  const typed = !(Array.isArray(r.autoFilled) && r.autoFilled.includes('label'))
  return !!(c.name || c.pressing || c.catalog || c.budget || (c.discogsId && !auto) || (typed && c.label && c.label !== origLabel(r)))
}

// the copies still wanted, with their index in wantCopies: a hunt's own, or an owned or ordered record's moreCopies
export function stillCopies(r: Rec): [Copy, number][] {
  const C = wantCopies(r)
  const L: [Copy, number][] = kindOf(r) === 'wish' ? C.map((c, i) => [c, i]) : C.slice(1).map((c, i) => [c, i + 1])
  return L.filter(([c, i]) => (i ? copyHas(c) : firstCopyChosen(r)))
}
export const copiesLegend = (r: Rec) =>
  (stillCopies(r).length > 1 ? 'The copies you ' : 'The copy you ') + (kindOf(r) === 'wish' ? 'want' : 'still want')

// a lone hunted copy's label shows only when it names the copy: beside the rest of it, or typed and not the album's own
export function copyLabelShown(r: Rec, c: Copy, i: number): boolean {
  const typed = !(Array.isArray(r.autoFilled) && r.autoFilled.includes('label'))
  return (
    i > 0 || !!(c.name || c.pressing || c.catalog || c.budget) || (!!c.discogsId && !AUTO_MATCH.includes(String(r.discogsMatch))) ||
    (typed && !!c.label && c.label !== origLabel(r))
  )
}

// the copies as a list (from edit mode) back into the record: a hunt's first goes into its own fields, the rest into
// moreCopies; an owned or ordered record writes only moreCopies (its own fields are its copy)
export function copiesPatch(r: Rec, L: Copy[]): Record<string, unknown> {
  const [a, ...rest] = L
  return kindOf(r) === 'wish'
    ? { copyName: a.name, pressing: a.pressing, label: a.label, catalog: a.catalog, budget: a.budget, discogsId: a.discogsId, moreCopies: rest }
    : { moreCopies: rest }
}

// the copies a move from the hunt asks to choose between (an empty copy, or one with only a release, isn't offered)
export const pickable = (r: Rec) => (kindOf(r) === 'wish' ? wantCopies(r).filter(copyHas) : [])

// the picked copy becomes the edition or your copy; the hunt's other offered copies stay on as copies still wanted
export function pickPatch(r: Rec, ci: number): Record<string, unknown> {
  const C = pickable(r)
  if (C.length < 2) return {}
  const k = Math.max(0, Math.min(C.length - 1, ci | 0))
  const c = C[k]
  return {
    copyName: c.name, pressing: c.pressing, label: c.label, catalog: c.catalog, budget: c.budget, discogsId: c.discogsId || '',
    moreCopies: C.filter((_, j) => j !== k),
  }
}

