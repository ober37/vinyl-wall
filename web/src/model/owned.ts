// The copies an owned record has (#121). The first lives in the record's own fields (copyName, pressing, label, catalog,
// matrix, discogsId, grades, paid, shop, shopUrl, acquired, barcodes), so Discogs sync and older walls read it as before;
// any others are in ownedCopies, each with the same fields by the same names (name for copyName), in the order they came.
import { notesOf } from './notes'
import { buyHosts, wantCopies, type Barcodes } from './copies'
import { kindOf, pressingText, today, type Rec } from './record'

export type OwnCopy = {
  name: string
  pressing: string
  label: string
  catalog: string
  matrix: string
  discogsId: number | ''
  mediaGrade: string
  sleeveGrade: string
  paid: string
  shop: string
  shopUrl: string
  acquired: string
  barcodes?: Barcodes
}
const TEXT = ['name', 'pressing', 'label', 'catalog', 'matrix', 'mediaGrade', 'sleeveGrade', 'paid', 'shop', 'shopUrl', 'acquired'] as const

const s = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')
const did = (v: unknown): number | '' => {
  const n = parseInt(String(v), 10)
  return n > 0 ? n : ''
}
const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined)

export const emptyOwned = (): OwnCopy => ({
  name: '',
  pressing: '',
  label: '',
  catalog: '',
  matrix: '',
  discogsId: '',
  mediaGrade: '',
  sleeveGrade: '',
  paid: '',
  shop: '',
  shopUrl: '',
  acquired: '',
})

// the copies after the first, as stored (anything that isn't a copy is skipped)
export function moreOwned(r: Rec): OwnCopy[] {
  const L = Array.isArray(r.ownedCopies) ? r.ownedCopies : []
  return L.filter((c): c is Record<string, unknown> => !!obj(c)).map((c) => {
    const o: OwnCopy = { ...emptyOwned(), discogsId: did(c.discogsId) }
    for (const k of TEXT) o[k] = s(c[k])
    const b = obj(c.barcodes)
    if (b && typeof b.rid === 'number' && Array.isArray(b.codes)) o.barcodes = b as Barcodes
    return o
  })
}

// The background task keeps each copy after the first as its own Discogs collection item, all of them in the record's
// discogsSync.ownedInsts as {rid, instanceId, adopted} (tools/discogs_sync.py); a copy's release is never guessed
type Inst = { rid?: number }
const syncedRids = (r: Rec) => {
  const L = (obj(r.discogsSync)?.ownedInsts ?? []) as Inst[]
  return Array.isArray(L) ? L.map((x) => x?.rid) : []
}

// the first copy, from the record's own fields, as one of ownedCopies (a library file's, beside its others)
export function firstAsCopy(r: Rec): OwnCopy {
  const o: OwnCopy = { ...emptyOwned(), discogsId: did(r.discogsId), name: s(r.copyName) }
  for (const k of TEXT) if (k !== 'name') o[k] = s(r[k])
  o.pressing = pressingText(r)
  const b = obj(r.barcodes)
  if (b && typeof b.rid === 'number' && Array.isArray(b.codes)) o.barcodes = b as Barcodes
  return o
}

// a copy after the first as a record of its own: the album's fields with the copy's over them, so it reads (facts,
// Discogs links, sync line) as the first copy does
export function copyRec(r: Rec, c: OwnCopy): Rec {
  const { name, ...rest } = c
  const sync = obj(r.discogsSync)
  const synced = !!c.discogsId && syncedRids(r).includes(c.discogsId)
  return {
    ...r,
    copyName: name,
    ...rest,
    discogsMatch: '',
    ownedCopies: undefined,
    discogsSync: synced ? { state: 'synced', where: 'collection', at: sync?.at } : {},
  }
}

// every copy of an owned record, each as a record: the record itself, then the others; none on wanted or ordered records
export const ownedRecs = (r: Rec): Rec[] => (kindOf(r) === 'own' ? [r, ...moreOwned(r).map((c) => copyRec(r, c))] : [])

// a copy's name for headings, as a copy wanted is named (copyTitle): its name, else its pressing's first line, else its
// Discogs release, else "Copy N"
export const ownedTitle = (c: Rec, i: number) =>
  s(c.copyName) || pressingText(c).split('\n')[0].trim() || (did(c.discogsId) ? 'Discogs release ' + did(c.discogsId) : 'Copy ' + (i + 1))

// the grades in short, for a copy's row: "NM / VG+", or one of them
export const gradeShort = (c: Rec) => [c.mediaGrade, c.sleeveGrade].filter(Boolean).join(' / ')

// Got this copy: a copy still wanted on an owned record (ci its index in wantCopies) joins the copies you own, bought
// today, with what was paid and where; its budget and links stay behind
export function gotPatch(
  r: Rec,
  ci: number,
  det: { paid: string; shop: string; shopUrl?: string },
): { patch: Record<string, unknown>; msg: string } | null {
  // as wantCopies reads them, so ci points at the same one
  const more = (Array.isArray(r.moreCopies) ? r.moreCopies : []).filter((x) => !!obj(x))
  const c = wantCopies(r)[ci]
  if (kindOf(r) !== 'own' || ci < 1 || !c || ci > more.length) return null
  const L = buyHosts(c.buyLinks)
  const got: OwnCopy = {
    ...emptyOwned(),
    name: c.name,
    pressing: c.pressing,
    label: c.label,
    catalog: c.catalog,
    discogsId: c.discogsId,
    ...(c.barcodes ? { barcodes: c.barcodes } : {}),
    paid: det.paid,
    shop: det.shop,
    shopUrl: det.shopUrl || (L.length === 1 ? L[0][1] : ''),
    acquired: today(),
  }
  const said = [det.paid ? '$' + det.paid : '', det.shop ? 'from ' + det.shop : ''].filter(Boolean).join(' ')
  const notes = notesOf(r)
  notes.push({
    d: today(),
    t: said ? 'Found another copy · ' + said : 'Found another copy.',
  })
  return {
    patch: {
      ownedCopies: [...(Array.isArray(r.ownedCopies) ? r.ownedCopies : []), got],
      moreCopies: more.filter((_, j) => j !== ci - 1),
      notes,
    },
    msg: 'Added to your copies. Bought today.',
  }
}
