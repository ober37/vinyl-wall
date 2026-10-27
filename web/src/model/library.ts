// Export and import of a library file, ported from exportLibrary/readLibrary/applyLibrary in app/vinyl-wall.html. Same file
// (vinylWall: 1) both ways, so files move between this page and production's. Pure: no React, no db.
/* The file holds records, gear, setups and the page's look. Never the Discogs token (it isn't loaded here) or anything
   tied to one wall: the task id, the Discogs connection, update state, data version. */
import { wantCopies, type Copy } from './copies'
import { aboutPending } from './task'
import { BACKGROUNDS, HANGS } from './site'
import { mergeShops, shopsOf } from './shops'
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

// "12 records, 2 pieces of equipment, 1 setup and 2 shops"
export function libCount(recs: number, gear: number, setups: number, shops = 0): string {
  const part = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : '')
  const a = [part(recs, 'record', 'records'), part(gear, 'piece of equipment', 'pieces of equipment'), part(setups, 'setup', 'setups'), part(shops, 'shop', 'shops')].filter(Boolean)
  return a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a[0] || 'nothing'
}

const byId = (list: Doc[]) => Object.fromEntries(list.filter((x) => !x.example && !x.deleted).map(({ id, ...d }) => [id, d]))

// the file, minus the covers (read from the wall's images by the caller): records, gear and setups as stored, the look,
// and the artists the records point at
export function exportFile(p: { records: Rec[]; gear: Doc[]; setups: Doc[]; artists: Doc[]; settings: Data; app: string }): LibFile {
  const site: Data = {}
  for (const k of ['title', 'bg', 'dim', 'hang', 'shops']) if (p.settings[k] !== undefined) site[k] = p.settings[k]
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
  // on a wall with records, the shops the file adds and fills in (an empty wall takes the file's list whole)
  shops: { added: number; filled: number }
  // what's already on the wall and gets its missing details from the file (#90): [the wall's id, the file's doc]; an
  // artist's is the whole doc to write
  fills: { recs: [string, Data][]; gear: [string, Data][]; setups: [string, Data][]; artists: [string, Data][] }
}
// what a file adds to this wall, or why it adds nothing. have: every record, including ones marked deleted (they're on
// their way off Discogs, so they don't come back)
export function planImport(text: string, w: { records: Doc[]; artists: Doc[]; gear: Doc[]; setups: Doc[]; settings?: Data }): Plan | string {
  let snap: LibFile | null = null
  try {
    snap = JSON.parse(text)
  } catch {
    /* not JSON */
  }
  if (!snap || !Number.isInteger(snap.vinylWall) || typeof snap.records !== 'object' || !snap.records)
    return "This file wasn't made by Export on a Vinyl Wall."
  if (snap.vinylWall > 1) return 'This file was made by a newer Vinyl Wall. Update this wall first, then import it.'
  // every record already here, or brought in by an earlier one in this file, by id, Discogs release, and artist and title
  const byId = new Map<string, Doc | null>(w.records.map((r) => [r.id, r]))
  const R = new Map<number, Doc | null>()
  const K = new Map<string, Doc | null>()
  const remember = (d: Data, wall: Doc | null) => {
    rids(d).forEach((n) => R.has(n) || R.set(n, wall))
    if (!K.has(key(d))) K.set(key(d), wall)
  }
  w.records.forEach((r) => remember(r, r))
  const recs: [string, Data][] = []
  const fillRecs: [string, Data][] = []
  const filled = new Set<string>()
  let skipped = 0
  for (const [id, d] of Object.entries(snap.records)) {
    if (!d || typeof d !== 'object' || d.deleted || !d.title) continue
    const n = rids(d).find((x) => R.has(x))
    const match = byId.has(id) ? byId.get(id) : n !== undefined ? R.get(n) : K.has(key(d)) ? K.get(key(d)) : undefined
    if (match !== undefined) {
      // on the wall: it gets what it's missing, once; one this file brings in (null) or the wall deleted is skipped
      if (match && !match.deleted && !filled.has(match.id) && Object.keys(fillPatch(match, d)).length) {
        fillRecs.push([match.id, d])
        filled.add(match.id)
      } else skipped++
      continue
    }
    recs.push([id, d])
    byId.set(id, null)
    remember(d, null)
  }
  const fresh = (list: Record<string, Data> | undefined, have: Doc[]) =>
    Object.entries(list || {}).filter(([id, d]) => d && typeof d === 'object' && !d.example && !d.deleted && !have.some((x) => x.id === id))
  // the file's artists come in for the records it brings in or gives album info; one the wall has gets what it's missing
  const refs = new Set([...recs.map(([, d]) => d.artistRef), ...fillRecs.map(([id, d]) => fillPatch(byId.get(id)!, d).artistRef)].filter(Boolean))
  const on = <T extends Doc>(list: Record<string, Data> | undefined, have: T[], fill: (w: T, f: Data) => Data) =>
    Object.entries(list || {}).flatMap(([id, d]): [string, Data][] => {
      const x = have.find((h) => h.id === id)
      return x && d && typeof d === 'object' && !d.example && !d.deleted && Object.keys(fill(x, d)).length ? [[id, d]] : []
    })
  const p: Plan = {
    recs,
    gear: fresh(snap.gear, w.gear),
    setups: fresh(snap.setups, w.setups),
    artists: fresh(snap.artists, w.artists).filter(([id, d]) => refs.has(id) && /^[\w.-]{1,100}$/.test(id) && typeof d.name === 'string'),
    fills: {
      recs: fillRecs,
      gear: on(snap.gear, w.gear, gearFill),
      setups: on(snap.setups, w.setups, setupFill),
      artists: on(snap.artists, w.artists, artistFill).map(([id, d]) => {
        const { id: _, ...x } = w.artists.find((a) => a.id === id)!
        return [id, { ...x, ...artistFill(x, d) }]
      }),
    },
    skipped,
    site: snap.settings?.site || {},
    empty: !w.records.some((r) => !r.deleted),
    known: w.artists.map((a) => a.id),
    covers: snap.covers && typeof snap.covers === 'object' ? snap.covers : {},
    shops: { added: 0, filled: 0 },
  }
  if (!p.empty) {
    const m = shopsFrom(w.settings || {}, p.site)
    if (m) p.shops = { added: m.added, filled: m.filled }
  }
  const F = p.fills
  if (p.recs.length + p.gear.length + p.setups.length + p.shops.added + p.shops.filled + F.recs.length + F.gear.length + F.setups.length === 0)
    return 'Everything in this file is already on the wall.'
  return p
}
// the file's shops merged into this wall's, or null when that changes nothing
export function shopsFrom(settings: Data, site: Data) {
  if (!Array.isArray(site.shops)) return null
  const m = mergeShops(shopsOf(settings), shopsOf(site))
  return m.added || m.filled ? m : null
}
// one sentence per action: "Adds 3 records and 2 shops. Fills in missing details on 12 records and 1 shop you already
// have. Skips 5 records that have nothing new." Done says it as "Added …. Filled in …" (#90)
function planWords(p: Plan, done: boolean) {
  const F = p.fills
  const adds = libCount(p.recs.length, p.gear.length, p.setups.length, p.shops.added)
  const fills = libCount(F.recs.length, F.gear.length, F.setups.length, p.shops.filled)
  return [
    adds !== 'nothing' ? `${done ? 'Added' : 'Adds'} ${adds}.` : '',
    fills !== 'nothing' ? `${done ? 'Filled' : 'Fills'} in missing details on ${fills}${done ? '' : ' you already have'}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
}
export const planSummary = (p: Plan) =>
  planWords(p, false) + (p.skipped ? ` Skips ${p.skipped} record${p.skipped === 1 ? '' : 's'} that ${p.skipped === 1 ? 'has' : 'have'} nothing new.` : '')

// what a record may carry in from a file: its own fields, never another wall's sync or lookup state
// prettier-ignore
const IMPORT_FIELDS = ["title", "artist", "year", "label", "catalog", "pressing", "matrix", "runtime", "status", "why", "notes", "shop", "shopUrl", "acquired", "paid",
  "mediaGrade", "sleeveGrade", "priority", "budget", "copyName", "buyLinks", "moreCopies", "orderDate", "orderStatus", "eta", "orderNum", "carrier", "tracking", "orderNotes", "discogsId",
  "discogsMatch", "coverAsset", "coverOriginal", "coverBlocked", "researchLog", "added", "autoFilled", "about", "aboutAt", "aboutV", "artistRef", "aboutBlocked"]
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
  if (r.buyLinks !== undefined) r.buyLinks = wantCopies({ id: '', buyLinks: r.buyLinks } as Rec)[0].buyLinks
  r.needsSync = 'check' // checked against this wall's Discogs account, if it has one (quietly: see syncing)
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

// What an import fills in on what the wall already has (#90). Empty: missing, "", null, [] or {}; the wall's value always
// wins. Lists gain what the wall lacks and never lose an entry
const empty = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) ? !v.length : typeof v === 'object' && !Object.keys(v as object).length)
const statusOf = (d: Data) => (d.status === 'wish' ? 'wish' : d.status === 'ordered' ? 'ordered' : 'own')
// a record's facts about the album and its pressing fill in whatever its status; what belongs to one status (what was paid,
// grades, an order's tracking, a hunt's budget) only when the wall and the file agree on it, so a wanted record doesn't
// pick up a price and grades from a copy owned elsewhere
// prettier-ignore
const ALBUM_FIELDS = ['title', 'artist', 'year', 'label', 'catalog', 'pressing', 'matrix', 'runtime', 'why']
// prettier-ignore
const STATUS_FIELDS: Record<string, string[]> = {
  own: ['acquired', 'paid', 'shop', 'shopUrl', 'mediaGrade', 'sleeveGrade'],
  ordered: ['copyName', 'paid', 'shop', 'shopUrl', 'orderDate', 'orderStatus', 'eta', 'orderNum', 'carrier', 'tracking', 'orderNotes'],
  wish: ['copyName', 'budget', 'buyLinks'],
}
// the file's entries the wall's list doesn't have, after the wall's own; null when there are none
function addMissing(wall: unknown, file: unknown, k: (x: Data) => string): Data[] | null {
  if (!Array.isArray(file)) return null
  const W = (Array.isArray(wall) ? wall : []) as Data[]
  const have = new Set(W.filter((x) => x && typeof x === 'object').map(k))
  const add = (file as Data[]).filter((x) => x && typeof x === 'object' && !have.has(k(x)) && have.add(k(x)))
  return add.length ? [...W, ...add] : null
}
const noteKey = (n: Data) => (n.id ? 'id:' + n.id : JSON.stringify([n.d ?? '', n.t ?? '']))
const entryKey = (e: Data) => (e.id ? 'id:' + e.id : JSON.stringify(e))
const copyKeys = (c: Copy) => [c.discogsId ? 'r:' + c.discogsId : '', c.pressing ? 'p:' + libNorm(c.pressing) : ''].filter(Boolean)

// a record's patch: what it's missing from the file's copy. A cover is the file's asset id, which the caller maps to this
// wall's (or drops); album info comes only to a record with none, so a looked-up record isn't redone
export function fillPatch(w: Data, raw: Data): Data {
  const f = importable(raw)
  const p: Data = {}
  const same = statusOf(w) === statusOf(f)
  for (const k of [...ALBUM_FIELDS, ...(same ? STATUS_FIELDS[statusOf(w)] : [])]) if (empty(w[k]) && !empty(f[k])) p[k] = f[k]
  if (empty(w.discogsId) && !empty(f.discogsId)) {
    p.discogsId = f.discogsId
    if (typeof f.discogsMatch === 'string' && f.discogsMatch) p.discogsMatch = f.discogsMatch
  }
  if (empty(w.coverAsset) && !w.coverBlocked && typeof f.coverAsset === 'string' && f.coverAsset) p.coverAsset = f.coverAsset
  if (!w.aboutBlocked && empty(w.about) && empty(w.artistRef) && !f.aboutBlocked && (!empty(f.about) || !empty(f.artistRef)))
    for (const k of ['about', 'aboutAt', 'aboutV', 'artistRef']) if (!empty(f[k])) p[k] = f[k]
  const notes = addMissing(w.notes, f.notes, noteKey)
  if (notes) p.notes = notes
  const log = addMissing(w.researchLog, f.researchLog, entryKey)
  if (log) p.researchLog = log
  if (same) {
    const have = new Set(wantCopies(w as Rec).flatMap(copyKeys))
    const add = wantCopies(f as Rec)
      .slice(1)
      .filter((c) => copyKeys(c).length && !copyKeys(c).some((k) => have.has(k)) && copyKeys(c).every((k) => have.add(k)))
    if (add.length) p.moreCopies = [...(Array.isArray(w.moreCopies) ? w.moreCopies : []), ...add]
  }
  // a filled-in field the file's lookup filled stays marked, so a later lookup may still better it
  const auto = (Array.isArray(f.autoFilled) ? f.autoFilled : []).filter((k) => k in p)
  if (auto.length) p.autoFilled = [...new Set([...(Array.isArray(w.autoFilled) ? w.autoFilled : []), ...auto])]
  return p
}
// a piece of equipment's patch: its empty fields, notes it lacks, and plays it lacks (by record, date and minutes) with
// their minutes, so a stylus's hours count each play once
export function gearFill(w: Data, f: Data): Data {
  const p: Data = {}
  for (const [k, v] of Object.entries(f)) if (!['plays', 'minutes', 'notes', 'example', 'deleted', 'id'].includes(k) && empty(w[k]) && !empty(v)) p[k] = v
  const notes = addMissing(w.notes, f.notes, noteKey)
  if (notes) p.notes = notes
  const plays = addMissing(w.plays, f.plays, (x) => JSON.stringify([x.id ?? '', x.d ?? '', +(x.min as number) || 0]))
  if (plays) {
    p.plays = plays
    const had = new Set(((Array.isArray(w.plays) ? w.plays : []) as Data[]).map((x) => JSON.stringify([x.id ?? '', x.d ?? '', +(x.min as number) || 0])))
    p.minutes = (+(w.minutes as number) || 0) + plays.filter((x) => !had.has(JSON.stringify([x.id ?? '', x.d ?? '', +(x.min as number) || 0]))).reduce((a, x) => a + (+(x.min as number) || 0), 0)
  }
  return p
}
export const setupFill = (w: Data, f: Data): Data =>
  Object.fromEntries((['name', 'note'] as const).filter((k) => empty(w[k]) && typeof f[k] === 'string' && f[k]).map((k) => [k, f[k]]))
// an artist's: the lookup's fields it lacks
export function artistFill(w: Data, f: Data): Data {
  const a = importableArtist(f)
  return Object.fromEntries(Object.entries(a).filter(([k, v]) => empty(w[k]) && !empty(v)))
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
      if (!r.coverBlocked) r.needsEnrich = true
    }
    if (!r.aboutBlocked && r.artistRef && !artistIds.has(String(r.artistRef))) {
      delete r.aboutAt
      delete r.aboutV
    }
    return [id, r]
  })
}

// an empty wall takes the file's look: title, a known preset or the photo (given its id on this wall), softening, hanging,
// and its shops
export function lookPatch(site: Data, photoId: string | null): Data {
  const bg = (site.bg || {}) as Data
  const patch: Data = {}
  if (typeof site.title === 'string') patch.title = site.title.slice(0, 60)
  if (bg.kind === 'preset' && BACKGROUNDS.some(([k]) => k === bg.preset)) patch.bg = { kind: 'preset', preset: bg.preset }
  else if (bg.kind === 'photo' && photoId) patch.bg = { kind: 'photo', assetId: photoId }
  if (typeof site.dim === 'number') patch.dim = site.dim
  if (HANGS.some(([k]) => k === site.hang)) patch.hang = site.hang
  if (Array.isArray(site.shops)) patch.shops = shopsOf(site)
  return patch
}

// "Added 12 records. We'll look up covers for 4 of them. This takes a few minutes." recs: the records added
export function doneMessage(p: Plan, recs: Data[]): string {
  const enrich = recs.some((d) => d.needsEnrich)
  const about = recs.some((d) => aboutPending(d as Rec))
  const lookups = recs.filter((d) => d.needsEnrich || aboutPending(d as Rec)).length
  const what = enrich && about ? 'covers or album info' : enrich ? 'covers' : 'album info'
  // with records filled in too, "them" could mean either, so it counts
  const whom = p.fills.recs.length ? `${lookups} record${lookups === 1 ? '' : 's'}` : lookups === recs.length ? (lookups === 1 ? 'it' : 'them') : lookups + ' of them'
  return planWords(p, true) + (lookups ? ` We'll look up ${what} for ${whom}. This takes a few minutes.` : '')
}
