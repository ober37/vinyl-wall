// Logging plays and their journal, as logPlay and the journal handlers in app/vinyl-wall.html write them.
// Gear minutes are left to the Equipment slice: a play with no setups is exactly what production writes without gear.
import { findNote, notesOf, type NoteRef } from './notes'
import { recordTracks, today, type Note, type Rec } from './record'
export { VIBES, vibeOf } from './record'

export type PlayKind = 'full' | 'side' | 'tracks'

export const sideOf = (pos: unknown) => (/^([A-Z])/.exec(String(pos || '')) || [])[1] || ''
const trackSecs = (dur: unknown) => {
  const m = /^(\d+):(\d\d)$/.exec(String(dur || ''))
  return m ? +m[1] * 60 + +m[2] : 0
}

// the sides to offer: from the tracklist, else A and B
export function recordSides(r: Rec): string[] {
  const S = [...new Set(recordTracks(r).map((t) => sideOf(t.pos)).filter(Boolean))]
  return S.length ? S : ['A', 'B']
}

// minutes for picked tracks: their durations, a track without one counting as the record's average track
function tracksMin(r: Rec, pos: string[]) {
  const T = recordTracks(r)
  const known = T.map((t) => trackSecs(t.dur)).filter(Boolean)
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : ((+r.runtime! || 40) * 60) / Math.max(T.length, 1)
  return Math.max(1, Math.ceil(pos.reduce((n, p) => n + (trackSecs(T.find((t) => t.pos === p)?.dur) || avg), 0) / 60))
}

// picks that cover a whole side log as that side, and every track as the whole album, so the counts stay honest
export function collapsePick(r: Rec, kind: PlayKind, side: string, picks: string[]) {
  if (kind !== 'tracks') return { kind, side: kind === 'side' ? side : '', tracks: [] as string[] }
  const T = recordTracks(r)
  const sides = [...new Set(picks.map(sideOf))]
  if (picks.length === T.length) return { kind: 'full' as const, side: '', tracks: [] }
  if (sides.length === 1 && sides[0] && T.filter((t) => sideOf(t.pos) === sides[0]).every((t) => picks.includes(t.pos!)))
    return { kind: 'side' as const, side: sides[0], tracks: [] }
  return { kind, side: '', tracks: picks }
}

export function playNote(r: Rec, kind: PlayKind, side: string, tracks: string[]): Note {
  const rt = +r.runtime! || 40
  const min = kind === 'tracks' ? tracksMin(r, tracks) : kind === 'side' ? Math.round(rt / 2) : rt
  const t =
    (kind === 'tracks'
      ? `Played ${tracks.length} track${tracks.length > 1 ? 's' : ''}`
      : kind === 'side'
        ? 'Played one side'
        : 'Played the whole album') + ` (~${min} min)`
  return { d: today(), t, ...(side ? { side } : {}), ...(tracks.length ? { tracks } : {}) }
}

// the journal's save: thoughts in j, the vibe set or cleared (an old mood goes), a new date moves the play
export function saveJournal(r: Rec, ref: NoteRef, j: { text: string; vibe: number; date?: string }): Note[] | null {
  const notes = notesOf(r)
  const i = findNote(notes, ref)
  if (i < 0) return null
  const n: Note = { ...notes[i], j: j.text.trim() }
  delete n.mood
  if (j.vibe) n.vibe = j.vibe
  else delete n.vibe
  if (j.date && /^\d{4}-\d\d-\d\d$/.test(j.date)) n.d = j.date
  notes[i] = n
  return notes
}
