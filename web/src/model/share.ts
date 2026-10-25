// The share picture's words: what it shows, and what the sheet says about it (production's #4, with phase 6's notes)
import { countByKey, FKEYS, FLABEL } from './filter'
import type { Rec } from './record'

// what the wall shows when Share is tapped: its filter and search, and how many records it has in all
export type Shown = { list: Rec[]; total: number; filtered: boolean; searched: boolean }

// at most this many sleeves in the picture, then "+ N more"
export const SHARE_MAX = 40

// the counts under the picture's title, for what it shows: "3 owned  ·  2 on the way"
export function countsLine(list: Rec[]): string {
  const n = countByKey(list)
  return FKEYS.filter((k) => n[k])
    .map((k) => n[k] + ' ' + FLABEL[k])
    .join('  ·  ')
}

// said only when the picture is narrowed, so half a wall isn't posted unnoticed
export function narrowedNote({ list, total, filtered, searched }: Shown): string {
  if (list.length >= total || (!filtered && !searched)) return ''
  return `${list.length} of ${total} records, as ${filtered && searched ? 'filtered and searched' : filtered ? 'filtered' : 'searched'}.`
}

// what didn't make it into the picture, said quietly under it
export function missedNote(covers: number, photo: boolean): string {
  return [
    covers ? `${covers === 1 ? "A cover couldn't" : "Some covers couldn't"} be drawn, so ${covers === 1 ? 'it shows as a plain sleeve' : 'they show as plain sleeves'}.` : '',
    photo ? "The background photo couldn't be drawn, so the picture uses the plain wall color." : '',
  ]
    .filter(Boolean)
    .join(' ')
}
