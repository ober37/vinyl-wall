// A new record, as createRecord in app/vinyl-wall.html writes it, and the cover and artist fixes edit mode makes.
import { stored, type Form } from './edit'
import type { Kind, Rec } from './record'
import { RELOOK_ABOUT } from './task'

// the doc a new record is set with: what was typed, its status, an empty log, when it was added and its priority (2 unless
// a hunt chose one; every kind gets one); a cover uploaded first goes in with it. Missing a cover, year or label means the task looks it up.
// No needsSync: a new record has no discogsSync yet, which is what the task's sync looks for.
export function newDoc(form: Form, kind: Kind, coverId: string | null, now = Date.now()): Record<string, unknown> {
  const d: Record<string, unknown> = { priority: 2, ...stored(form), status: kind, notes: [], added: now }
  // a new record has no Discogs release yet, and only a hunt shows its (empty) list of other copies
  delete d.discogsId
  if (kind !== 'wish') delete d.moreCopies
  if (kind === 'ordered' && !d.orderStatus) d.orderStatus = 'ordered'
  if (coverId) d.coverAsset = coverId
  if (!d.coverAsset || !d.year || !d.label) d.needsEnrich = true
  return d
}

// the same album added in the last two minutes: a second "Hang it" opens that one instead of hanging it twice
export function dupeOf(records: Rec[], doc: Record<string, unknown>, now = Date.now()): Rec | undefined {
  const key = (doc.artist + '|' + doc.title).toLowerCase()
  return records.find((r) => (r.artist + '|' + r.title).toLowerCase() === key && now - (r.added || 0) < 120000)
}

// an uploaded cover replaces the looked-up one and stops the lookup waiting for it (and lifts a Remove cover)
export const coverPatch = (r: Rec, id: string) => ({
  coverAsset: id,
  needsEnrich: false,
  autoFilled: (r.autoFilled || []).filter((k) => k !== 'coverAsset'),
  ...(r.coverBlocked ? { coverBlocked: false } : {}),
})
// "Remove cover": back to the plain sleeve, and the lookup doesn't put one back until an upload or Find cover & details (#62)
export const removeCoverPatch = (r: Rec) => ({
  coverAsset: '',
  coverBlocked: true,
  ...(r.coverOriginal ? { coverOriginal: '' } : {}),
  ...(r.autoFilled?.includes('coverAsset') ? { autoFilled: r.autoFilled.filter((k) => k !== 'coverAsset') } : {}),
})

// "Find cover & details" looks the album info up again too, unless it's been turned off (aboutBlocked, set from the chat),
// and lifts a Remove cover
export const enrichPatch = (r: Rec) => ({
  needsEnrich: true,
  ...(r.aboutBlocked ? {} : RELOOK_ABOUT),
  ...(r.coverBlocked ? { coverBlocked: false } : {}),
})
