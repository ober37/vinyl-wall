import { playDate, runParts, type Rec } from './record'

// discogsMatch values the background task's matcher writes (app/tools/discogs_sync.py): a release matched for you,
// not one you chose. dev/test_discogs.py checks this list covers every value the matcher writes.
// prettier-ignore
export const AUTO_MATCH = ["master main release", "vinyl: master main release", "vinyl: earliest original pressing", "vinyl: first matching release", "catalog", "catalog+pressing"]

// what the matcher's choice reads as on the release line
export const MATCH_TEXT: Record<string, string> = {
  'master main release': 'master release',
  'vinyl: master main release': 'master release',
  'vinyl: earliest original pressing': 'earliest original pressing',
  'vinyl: first matching release': 'first matching release',
  catalog: 'catalog number',
  'catalog+pressing': 'catalog number and pressing',
}

// a release number, or a pasted Discogs release link: the number, "" for nothing, null for anything else
export function releaseOf(v: string): number | '' | null {
  const t = v.trim()
  if (!t) return ''
  const m = /discogs\.com\/(?:[^/]+\/)?release\/(\d+)/i.exec(t) || /^\[?\s*[r#]?\s*(\d+)\s*\]?$/i.exec(t)
  const n = m ? parseInt(m[1], 10) : NaN
  return n > 0 ? n : null
}

// the task's "2026-10-24 18:02 UTC" as a local day: "Oct 24", with the year when it isn't this one
export function syncDay(at: unknown): string {
  const t = new Date(String(at || '').replace(' UTC', 'Z').replace(' ', 'T'))
  if (isNaN(+t)) return String(at || '')
  return playDate(new Date(t.getTime() - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10))
}

export type Sync = { state?: string; at?: string; where?: string; msg?: string }
function syncState(r: Rec, changed: boolean): string {
  const s = (r.discogsSync || {}) as Sync
  if (changed || r.needsSync) return 'Waiting to sync…'
  if (s.state === 'synced') return `Synced to your ${s.where === 'collection' ? 'collection' : 'wantlist'} · ${syncDay(s.at)}`
  if (s.state === 'no-match') return String(s.msg || 'No match found on Discogs')
  if (s.state === 'error') return 'Sync failed: ' + (s.msg || '')
  return 'Not synced yet'
}
// the release line under the number (production's discogsHTML): waiting, synced, no match or failed, and how it was matched
export function syncLine(r: Rec, changed: boolean): string {
  const m = changed ? '' : String(r.discogsMatch || '')
  return syncState(r, changed) + (m ? ' · ' + (MATCH_TEXT[m] ? `Matched automatically (${MATCH_TEXT[m]})` : m) : '')
}

// the matcher picked a general release, not a pressing
export const generalMatch = (m: unknown) => /master|first/.test(String(m || ''))

// what Copy runout puts on the clipboard for a Discogs submission (production's runoutText)
export const runoutText = (matrix: string, pressing: string, catalog: string) =>
  `Matrix / Runout: ${matrix}\n(Observed on my copy: ${[pressing, catalog].filter(Boolean).join(', ')}.)`

// a runout as rows by side: "Side A: x · Side B: y", or unlabelled parts given the next letter not taken
export function runSides(m: unknown): { side: string; v: string }[] {
  const parts = runParts(m).map((p) => /^Side ([A-Z])\s*:\s*(.*)$/i.exec(p) ?? p)
  const taken = new Set(parts.flatMap((x) => (typeof x === 'string' ? [] : [x[1].toUpperCase()])))
  let next = 65
  return parts.map((x) => {
    if (typeof x !== 'string') return { side: x[1].toUpperCase(), v: x[2] }
    while (taken.has(String.fromCharCode(next))) next++
    const side = String.fromCharCode(next)
    taken.add(side)
    return { side, v: x }
  })
}
export const runJoin = (rows: { side: string; v: string }[]) =>
  rows
    .filter((x) => x.v.trim())
    .map((x) => `Side ${x.side}: ${x.v.trim()}`)
    .join(' · ')
