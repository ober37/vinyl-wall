// Research, ported from app/vinyl-wall.html. It happens in the person's Claude chat beside the wall: the vinyl-wall skill
// saves a summary to researchLog (newest first). The page shows it, hands over a prompt that names the record, pins and
// removes entries, and adds a researched pressing as a copy you want ("+ Want").
import { emptyCopy, firstCopyChosen, stillCopies, wantCopies } from './copies'
import { shortDate, type Rec } from './record'

export type Research = {
  id?: string
  at?: string
  question?: string
  headline?: string
  summary?: string
  sources?: unknown
  pressings?: unknown
  check?: unknown
  where?: unknown
  price?: string
  shops?: unknown
  pinned?: boolean
  [k: string]: unknown
}

// older walls kept a single `research` object; it reads as one entry
export function researchEntries(r: Rec): Research[] {
  const log = Array.isArray(r.researchLog) ? (r.researchLog as Research[]) : []
  return log.length ? log : r.research && typeof r.research === 'object' ? [{ id: 'legacy', ...(r.research as Research) }] : []
}
// an entry's key: its id, else its place in the list
export const entryKey = (e: Research, i: number) => e.id || String(i)

export function firstSentence(t: unknown): string {
  const x = String(t || '').trim()
  const m = x.match(/^.+?[.!?](\s|$)/)
  return (m ? m[0] : x).trim().slice(0, 140)
}
export const strList = (a: unknown) => (Array.isArray(a) ? a.filter((x) => x !== null && x !== undefined && x !== '').map(String) : [])
export const sourceList = (a: unknown) =>
  (Array.isArray(a) ? a : [])
    .filter((x): x is { title?: unknown; url: string } => !!x && /^https?:\/\//i.test(String(x.url || '')))
    .map((x) => ({ title: String(x.title || x.url), url: String(x.url) }))

// pinning writes the whole list, so an older single research entry moves into researchLog; one entry is pinned at a time
export function pinPatch(r: Rec, key: string) {
  const log = researchEntries(r).map((e, i) => {
    const { pinned, ...rest } = e
    return entryKey(e, i) === key && !pinned ? { ...rest, pinned: true } : rest
  })
  return { researchLog: log, research: null }
}
export const removeResearchPatch = (r: Rec, key: string) => ({
  researchLog: researchEntries(r).filter((e, i) => entryKey(e, i) !== key),
  research: null,
})

// a researched pressing is "<pressing>: <why>"
export const pressOf = (t: unknown) => String(t || '').split(': ')[0].trim()
// already wanted: the same pressing in other words (one contains the other, past a few letters), or the copy's catalog no.
export function alreadyWanted(r: Rec, item: string): boolean {
  const low = (v: unknown) => String(v || '').trim().toLowerCase()
  const a = low(pressOf(item))
  return stillCopies(r).some(([c]) => {
    const b = low(c.pressing)
    const cat = low(c.catalog)
    return (!!b && (a === b || (Math.min(a.length, b.length) >= 8 && (a.includes(b) || b.includes(a))))) || (cat.length >= 4 && low(item).includes(cat))
  })
}

// what + Want adds, and how to take it back: the record's first copy when it has none yet, else another copy. A release the
// matcher picked isn't this pressing, so it goes (Undo puts it back) and the sync matches the pressing afresh
export type Wanted = { ci: number; p: string; did: { discogsId: unknown; discogsMatch: string } | null }
export function wantPatch(r: Rec, p: string): { patch: Record<string, unknown>; undo: Wanted } {
  const C = wantCopies(r)
  const first = !firstCopyChosen(r)
  const did = first && r.discogsId ? { discogsId: r.discogsId, discogsMatch: String(r.discogsMatch || '') } : null
  const patch = first
    ? { pressing: p, ...(did ? { discogsId: '', discogsMatch: '' } : {}) }
    : { moreCopies: [...C.slice(1), { ...emptyCopy(), pressing: p }] }
  return { patch, undo: { ci: first ? 0 : C.length, p, did } }
}
// Undo takes back only the copy it added, if it's still there as added
export function undoWantPatch(r: Rec, w: Wanted): Record<string, unknown> | null {
  const C = wantCopies(r)
  if (w.ci === 0 && C[0].pressing === w.p) return { pressing: '', ...(w.did || {}) }
  if (w.ci && C[w.ci] && C[w.ci].pressing === w.p) return { moreCopies: C.slice(1).filter((_, j) => j !== w.ci - 1) }
  return null
}

// the prompt Copy for Claude hands over: the record, the wall once settings know its address, and the entry followed up
export function resPrompt(r: Rec, wallUrl: unknown, e?: Research): string {
  const url = /^https:\/\//.test(String(wallUrl || '')) ? String(wallUrl) : ''
  return [
    e
      ? `Follow up on my research from ${(e.at && shortDate(e.at)) || e.at}: "${(e.headline || firstSentence(e.summary)).replace(/[.!?]$/, '')}"`
      : 'Research a record on my Vinyl Wall',
    `Record: "${r.title}" by ${r.artist} (record ${r.id})`,
    ...(url ? [`Wall: ${url}`] : []),
    `Use the vinyl-wall skill, and save ${e ? 'a new summary' : 'a summary to the record'} when we're done.`,
    '',
    e ? 'My follow-up: ' : 'My question: ',
  ].join('\n')
}
