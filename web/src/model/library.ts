// Export and import of a library file, ported from exportLibrary/readLibrary/applyLibrary in app/vinyl-wall.html. Same file
// (vinylWall: 1) both ways, so files move between this page and production's. Pure: no React, no db.
/* The file holds records, gear, setups and the page's look. Never the Discogs token (it isn't loaded here) or anything
   tied to one wall: the task id, the Discogs connection, update state, data version. */
import { wantCopies } from './copies'
import { aboutPending } from './task'
import { BACKGROUNDS, HANGS } from './site'
import type { Rec } from './record'

type Doc = Record<string, unknown> & { id: string }
type Data = Record<string, unknown>
export type LibFile = {
  vinylWall: number
  exportedAt?: string
  app?: string
  settings?: { site?: Data }
  setups?: Record<string, Data>
  gear?: Record<string, Data>
  records: Record<string, Data>
  artists?: Record<string, Data>
  covers?: Record<string, string>
}

export const nowUTC = () => new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'

// same matching as app/tools/discogs_import.py: ignore case, punctuation, "the", "&"/"and", Discogs' "(2)" and "*"
export const libNorm = (s: unknown) =>
  String(s || '')
    .toLowerCase()
    .replace(/\s*\(\d+\)|\*/g, '')
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && w !== 'the')
    .join('')
const rids = (d: Data) => [d.discogsId, (d.discogsSync as Data | undefined)?.rid].map((v) => parseInt(String(v), 10)).filter(Boolean)
const key = (d: Data) => libNorm(d.artist) + '|' + libNorm(d.title)

// "12 records, 2 pieces of equipment and 1 setup"
export function libCount(recs: number, gear: number, setups: number): string {
  const part = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : '')
  const a = [part(recs, 'record', 'records'), part(gear, 'piece of equipment', 'pieces of equipment'), part(setups, 'setup', 'setups')].filter(Boolean)
  return a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a[0] || 'nothing'
}

const byId = (list: Doc[]) => Object.fromEntries(list.filter((x) => !x.example && !x.deleted).map(({ id, ...d }) => [id, d]))

// the file, minus the covers (read from the wall's images by the caller): records, gear and setups as stored, the look,
// and the artists the records point at
export function exportFile(p: { records: Rec[]; gear: Doc[]; setups: Doc[]; artists: Doc[]; settings: Data; app: string }): LibFile {
  const site: Data = {}
  for (const k of ['title', 'bg', 'dim', 'hang']) if (p.settings[k] !== undefined) site[k] = p.settings[k]
  const records = byId(p.records as Doc[])
  const refs = new Set(Object.values(records).map((r) => r.artistRef).filter(Boolean))
  return {
    vinylWall: 1, exportedAt: nowUTC(), app: p.app, settings: { site }, setups: byId(p.setups), gear: byId(p.gear), records,
    artists: byId(p.artists.filter((a) => refs.has(a.id))), covers: {},
  }
}
// the images a file carries: every record's cover, and a photo background
export function coverIds(f: LibFile): { ids: string[]; covers: Set<string> } {
  const covers = new Set(Object.values(f.records).map((r) => r.coverAsset).filter((x): x is string => typeof x === 'string' && !!x))
  const bg = f.settings?.site?.bg as Data | undefined
  const ids = [...covers]
  if (bg?.kind === 'photo' && typeof bg.assetId === 'string' && !covers.has(bg.assetId)) ids.push(bg.assetId)
  return { ids, covers }
}

export type Plan = {
  recs: [string, Data][]
  gear: [string, Data][]
  setups: [string, Data][]
  artists: [string, Data][]
  skipped: number
  site: Data
  // the wall had no records: it takes the file's look too
  empty: boolean
  // the artists already on the wall, as read for this plan
  known: string[]
  covers: Record<string, string>
}
// what a file adds to this wall, or why it adds nothing. have: every record, including ones marked deleted (they're on
// their way off Discogs, so they don't come back)
export function planImport(text: string, w: { records: Doc[]; artists: Doc[]; gear: Doc[]; setups: Doc[] }): Plan | string {
  let snap: LibFile | null = null
  try {
    snap = JSON.parse(text)
  } catch {
    /* not JSON */
  }
  if (!snap || !Number.isInteger(snap.vinylWall) || typeof snap.records !== 'object' || !snap.records)
    return "This file wasn't made by Export on a Vinyl Wall."
  if (snap.vinylWall > 1) return 'This file was made by a newer Vinyl Wall. Update this wall first, then import it.'
  const ids = new Set(w.records.map((r) => r.id))
  const R = new Set<number>()
  const K = new Set<string>()
  const remember = (d: Data) => {
    rids(d).forEach((n) => R.add(n))
    K.add(key(d))
  }
  w.records.forEach(remember)
  const recs: [string, Data][] = []
  let skipped = 0
  for (const [id, d] of Object.entries(snap.records)) {
    if (!d || typeof d !== 'object' || d.deleted || !d.title) continue
    if (ids.has(id) || rids(d).some((n) => R.has(n)) || K.has(key(d))) {
      skipped++
      continue
    }
    recs.push([id, d])
    ids.add(id)
    remember(d)
  }
  const fresh = (list: Record<string, Data> | undefined, have: Doc[]) =>
    Object.entries(list || {}).filter(([id, d]) => d && typeof d === 'object' && !d.example && !d.deleted && !have.some((x) => x.id === id))
  // artists the wall already has stay as they are; the file's others come in only for the records being brought in
  const refs = new Set(recs.map(([, d]) => d.artistRef).filter(Boolean))
  const p: Plan = {
    recs,
    gear: fresh(snap.gear, w.gear),
    setups: fresh(snap.setups, w.setups),
    artists: fresh(snap.artists, w.artists).filter(([id, d]) => refs.has(id) && /^[\w.-]{1,100}$/.test(id) && typeof d.name === 'string'),
    skipped,
    site: snap.settings?.site || {},
    empty: !w.records.some((r) => !r.deleted),
    known: w.artists.map((a) => a.id),
    covers: snap.covers && typeof snap.covers === 'object' ? snap.covers : {},
  }
  if (p.recs.length + p.gear.length + p.setups.length === 0) return 'Everything in this file is already on the wall.'
  return p
}
export const planSummary = (p: Plan) =>
  `Adds ${libCount(p.recs.length, p.gear.length, p.setups.length)}.` +
  (p.skipped ? ` ${p.skipped} record${p.skipped === 1 ? ' is' : 's are'} already on the wall and will be skipped.` : '')

// what a record may carry in from a file: its own fields, never another wall's sync or lookup state
// prettier-ignore
const IMPORT_FIELDS = ["title", "artist", "year", "label", "catalog", "pressing", "matrix", "runtime", "status", "why", "notes", "shop", "shopUrl", "acquired", "paid",
  "mediaGrade", "sleeveGrade", "priority", "budget", "copyName", "moreCopies", "orderDate", "orderStatus", "eta", "orderNum", "carrier", "tracking", "orderNotes", "discogsId",
  "discogsMatch", "coverAsset", "coverOriginal", "researchLog", "added", "autoFilled", "about", "aboutAt", "aboutV", "artistRef", "aboutBlocked"]
// what an artist may carry in: the lookup's own fields, with the right types
const ARTIST_FIELDS: Record<string, string> = { name: 'string', wiki: 'string', wikidata: 'string', intro: 'string', summary: 'string', source: 'string', fetchedAt: 'number' }
export function importableArtist(d: Data): Data {
  const a: Data = {}
  for (const [k, t] of Object.entries(ARTIST_FIELDS)) if (typeof d[k] === t) a[k] = d[k]
  if (Array.isArray(d.links))
    a.links = d.links.filter((l) => l && typeof l.kind === 'string' && typeof l.url === 'string').map((l) => ({ kind: l.kind, url: l.url }))
  return a
}
export function importable(d: Data): Data {
  const r: Data = {}
  for (const k of IMPORT_FIELDS) if (d[k] !== undefined) r[k] = d[k]
  if (!Array.isArray(r.notes)) r.notes = []
  if (r.copyName !== undefined && typeof r.copyName !== 'string') delete r.copyName
  if (r.moreCopies !== undefined) r.moreCopies = wantCopies({ id: '', moreCopies: r.moreCopies } as Rec).slice(1)
  r.needsSync = true // synced afresh to this wall's Discogs account, if it has one
  return r
}

// a cover from the file, only a photo (never SVG): its data: URL, or null
export const fileImage = (p: Plan, id: unknown) =>
  typeof id === 'string' && Object.hasOwn(p.covers, id) && /^data:image\/(jpeg|png|webp);base64,/.test(p.covers[id]) ? p.covers[id] : null
export function imageFile(u: string): File {
  const [head, b64] = u.split(',')
  const bin = atob(b64)
  const a = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i)
  const type = head.slice(5).split(';')[0]
  return new File([a], 'cover.' + type.split('/')[1], { type })
}

// the records' documents as written: a cover this wall holds (or one just uploaded from the file) stays, anything else is
// looked up again, and so is the album info of a record whose artist isn't coming and isn't here
export function recordWrites(p: Plan, has: (id: unknown) => boolean, moved: Map<string, string>, artistIds: Set<string>): [string, Data][] {
  return p.recs.map(([id, d]) => {
    const r = importable(d)
    if (!has(r.coverOriginal)) delete r.coverOriginal
    if (moved.has(r.coverAsset as string)) r.coverAsset = moved.get(r.coverAsset as string)
    else if (!has(r.coverAsset)) {
      delete r.coverAsset
      r.needsEnrich = true
    }
    if (!r.aboutBlocked && r.artistRef && !artistIds.has(String(r.artistRef))) {
      delete r.aboutAt
      delete r.aboutV
    }
    return [id, r]
  })
}

// an empty wall takes the file's look: title, a known preset or the photo (given its id on this wall), softening, hanging
export function lookPatch(site: Data, photoId: string | null): Data {
  const bg = (site.bg || {}) as Data
  const patch: Data = {}
  if (typeof site.title === 'string') patch.title = site.title.slice(0, 60)
  if (bg.kind === 'preset' && BACKGROUNDS.some(([k]) => k === bg.preset)) patch.bg = { kind: 'preset', preset: bg.preset }
  else if (bg.kind === 'photo' && photoId) patch.bg = { kind: 'photo', assetId: photoId }
  if (typeof site.dim === 'number') patch.dim = site.dim
  if (HANGS.some(([k]) => k === site.hang)) patch.hang = site.hang
  return patch
}

// "Brought in 12 records. We'll look up covers for 4 of them. This takes a few minutes."
export function doneMessage(p: Plan, recs: Data[]): string {
  const enrich = recs.some((d) => d.needsEnrich)
  const about = recs.some((d) => aboutPending(d as Rec))
  const lookups = recs.filter((d) => d.needsEnrich || aboutPending(d as Rec)).length
  const what = enrich && about ? 'covers or album info' : enrich ? 'covers' : 'album info'
  return (
    `Brought in ${libCount(p.recs.length, p.gear.length, p.setups.length)}.` +
    (lookups
      ? ` We'll look up ${what} for ${lookups === recs.length ? (lookups === 1 ? 'it' : 'them') : lookups + ' of them'}. This takes a few minutes.`
      : '')
  )
}
