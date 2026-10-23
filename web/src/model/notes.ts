// A record's notes are one array, replaced whole on every write. These change it from the latest copy of the record,
// finding the note by what it says rather than trusting an index that another write may have shifted.
import { today, type Note, type Rec } from './record'

export type NoteRef = { i: number; d?: string; t?: string }

export const notesOf = (r: Rec): Note[] => (Array.isArray(r.notes) ? [...(r.notes as Note[])] : [])
export const refOf = (n: Note, i: number): NoteRef => ({ i, d: n.d, t: n.t })

// the note's index in this array, or -1 when it's gone or changed
export function findNote(notes: Note[], ref: NoteRef): number {
  const same = (n: Note | undefined) => !!n && typeof n === 'object' && n.d === ref.d && n.t === ref.t
  if (same(notes[ref.i])) return ref.i
  return notes.findIndex(same)
}

export const addNote = (r: Rec, t: string) => [...notesOf(r), { d: today(), t }]

export function editNote(r: Rec, ref: NoteRef, t: string): Note[] | null {
  const notes = notesOf(r)
  const i = findNote(notes, ref)
  if (i < 0) return null
  notes[i] = { ...notes[i], t }
  return notes
}

export function deleteNote(r: Rec, ref: NoteRef): Note[] | null {
  const notes = notesOf(r)
  const i = findNote(notes, ref)
  if (i < 0) return null
  notes.splice(i, 1)
  return notes
}

// written notes (not plays), newest first, with their refs
export function writtenNotes(r: Rec, isPlay: (n: Note) => boolean) {
  return notesOf(r)
    .map((n, i) => ({ n, ref: refOf(n, i) }))
    .filter((x) => x.n && typeof x.n === 'object' && !isPlay(x.n))
    .reverse()
}
