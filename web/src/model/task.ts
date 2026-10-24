// The background task's side of the page, as in app/vinyl-wall.html: what's waiting for it (sent as the start message),
// whether a run is under way, and the update check.
import type { Rec } from './record'

export type Settings = Record<string, unknown> & {
  taskId?: string
  run?: { startedMs?: number }
  discogs?: Record<string, unknown>
  update?: { latest?: string; checkedMs?: number }
}

// not looked up yet, or looked up by an older version (below aboutV 3, an album with no summary gets one more try)
export const aboutPending = (r: Rec) =>
  !r.aboutBlocked &&
  (!r.aboutAt ||
    (!r.aboutV && !!r.about && r.about.source !== 'claude') ||
    (Number(r.aboutV || 0) < 3 && !r.about?.summary))
// look the album info up again: an empty aboutAt and aboutV read as never looked up, here and in lookup.py (#60)
export const RELOOK_ABOUT = { aboutAt: '', aboutV: 0 }
// waiting for the task: a cover or details (needsEnrich) or album info
export const lookingUp = (r: Rec) => !r.example && !r.deleted && (!!r.needsEnrich || aboutPending(r))

// what's waiting; `fresh` leaves out records a run already tried (still no cover or runtime)
export function pendingParts(records: Rec[], s: Settings, fresh: boolean, now = Date.now()): string[] {
  const dz = s.discogs || {}
  const live = records.filter((r) => !r.deleted && !r.example)
  const w: string[] = []
  if (dz.hasToken && (!dz.status || dz.status === 'pending')) w.push('verify the Discogs connection (Part B)')
  if (dz.importRequested) w.push('import from Discogs (Part D): settings/site discogs.importRequested is true')
  const look = live.filter((r) => r.needsEnrich || (!fresh && (!r.coverAsset || !r.runtime)) || aboutPending(r)).length
  if (look) w.push(`look up covers, details and album info (Part L) for ${look} record${look > 1 ? 's' : ''}`)
  const sync = records.filter((r) => !r.example && (r.needsSync || r.deleted || !r.discogsSync)).length
  if (now - (s.update?.checkedMs || 0) > 24 * 3600000) w.push('check for a newer release (Part E)')
  if (sync && dz.status === 'ok') w.push(`sync ${sync} record${sync > 1 ? 's' : ''} to Discogs (Part C)`)
  return w
}
export function pendingWork(records: Rec[], s: Settings): string {
  const w = pendingParts(records, s, false)
  return (
    'Started from the wall. Waiting now: ' +
    (w.length ? w.join('; ') + '. Run only these parts, in the usual order.' : 'nothing specific; run every part and do whatever is pending.')
  )
}
// what a manual lookup says while it runs (a title ending in "." doesn't get four dots)
export const lookingUpNotice = (title: unknown) =>
  'Looking up ' + String(title || 'this record').replace(/\.+$/, '') + '… the cover usually appears within a few minutes.'

// one run at a time: starting marks settings.run, the task clears it; a mark older than an hour is a run that died
export const runActive = (s: Settings, now = Date.now()) => now - (s.run?.startedMs || 0) < 60 * 60000

const PLAIN = /^\d+\.\d+\.\d+$/
export function newer(a: unknown, b: unknown): boolean {
  const x = String(a || '').replace(/^v/, '')
  const y = String(b || '').replace(/^v/, '')
  if (!PLAIN.test(x)) return false
  const X = x.split('.').map(Number)
  const Y = y.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((X[i] || 0) !== (Y[i] || 0)) return (X[i] || 0) > (Y[i] || 0)
  return false
}
// installing an update replaces the page, which only Claude in chat can do: Settings shows the sentence to send
export const updateAsk = (s: Settings) =>
  `Update my Vinyl Wall using https://raw.githubusercontent.com/ober37/vinyl-wall/v${s.update?.latest}/SETUP.md`
