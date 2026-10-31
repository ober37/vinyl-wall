import { runParts, type Rec } from './record'

// discogsMatch values the background task's matcher writes (app/tools/discogs_sync.py): a release matched for you,
// not one you chose. dev/test_discogs.py checks this list covers every value the matcher writes.
// prettier-ignore
export const AUTO_MATCH = ["master main release", "vinyl: master main release", "vinyl: earliest original pressing", "vinyl: first matching release", "catalog", "catalog+pressing"]

// a release number, or a pasted Discogs release link: the number, "" for nothing, null for anything else
export function releaseOf(v: string): number | '' | null {
  const t = v.trim()
  if (!t) return ''
  const m = /discogs\.com\/(?:[^/]+\/)?release\/(\d+)/i.exec(t) || /^\[?\s*[r#]?\s*(\d+)\s*\]?$/i.exec(t)
  const n = m ? parseInt(m[1], 10) : NaN
  return n > 0 ? n : null
}

export type Sync = { state?: string; at?: string; where?: string; msg?: string }
// what went wrong with the last sync, for the sheet's status line (#121): nothing while Discogs isn't connected or an edit
// waits to sync, so an old failure doesn't linger. A failure doesn't say why: the task's message is for Claude, not the
// person, who can only try again
export const SYNC_FAILED = 'Sync failed'
export function syncProblem(r: Rec, discogsOn: boolean): string {
  const s = (r.discogsSync || {}) as Sync
  if (!discogsOn || r.needsSync) return ''
  if (s.state === 'no-match') return 'No vinyl pressing found on Discogs'
  if (s.state === 'error') return SYNC_FAILED
  return ''
}

// the matcher picked a general release, not a pressing
export const generalMatch = (m: unknown) => /master|first/.test(String(m || ''))

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
