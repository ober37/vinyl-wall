// The edit form's fields and the patch they write. Mirrors collect()/schedule()/write() in app/vinyl-wall.html:
// only fields the form owns, only when they changed, in production's stored shapes.
import { ORDER_KEYS, wantCopies, type Copy } from './copies'
import { moreOwned, type OwnCopy } from './owned'
import { kindOf, orderStatusOf, pressingText, shopHref, type Rec } from './record'
import { RELOOK_ABOUT } from './task'

export type Form = {
  title: string
  artist: string
  why: string
  year: string
  runtime: string
  // owned records (paid, shop and shopUrl on ordered ones too)
  label?: string
  catalog?: string
  pressing?: string
  acquired?: string
  paid?: string
  shop?: string
  shopUrl?: string
  mediaGrade?: string
  sleeveGrade?: string
  matrix?: string
  // the Discogs release (on wanted and ordered records, the first copy's)
  discogsId?: number | ''
  // wanted and ordered records: the first copy's own fields (label, catalog and pressing above too)
  copyName?: string
  budget?: string
  // wanted records: the first copy's links, a line each while editing, and its release date
  buyLinks?: string[]
  releaseDate?: string
  // wanted records: 1 Top, 2 Want, 3 Someday
  priority?: string
  // ordered records: the order (paid, shop and shopUrl above too); orderNotes only when an older record has some
  orderStatus?: string
  orderDate?: string
  eta?: string
  orderNum?: string
  carrier?: string
  tracking?: string
  orderNotes?: string
  // every kind: the copies after the first (on owned and ordered records, the ones still wanted)
  moreCopies?: Copy[]
  // owned records: the copies you own after the first (#121)
  ownedCopies?: OwnCopy[]
}

// fields whose changes Discogs sync pushes (production's SYNCED)
const SYNCED = new Set([
  'title', 'artist', 'status', 'pressing', 'matrix', 'shop', 'acquired', 'paid', 'why', 'mediaGrade', 'sleeveGrade', 'priority',
  'budget', 'copyName', 'moreCopies', 'ownedCopies', 'orderDate', 'orderStatus', 'eta', 'discogsId', 'deleted',
])
// every write goes through this: a synced field changed means the background task pushes it to Discogs, and a release
// written without saying how it was matched is the person's own choice, not the matcher's ("set by you", so the release
// line still says how it was matched)
export function withSync(patch: Record<string, unknown>) {
  const p = 'discogsId' in patch && !('discogsMatch' in patch) ? { ...patch, discogsMatch: patch.discogsId === '' ? '' : 'set by you' } : patch
  return Object.keys(p).some((k) => SYNCED.has(k)) ? { ...p, needsSync: true } : p
}

const s = (v: unknown) => (v === undefined || v === null ? '' : String(v))
// a copy's links as stored: blank lines gone, each address made linkable when it can be
const tidyLinks = (L: string[]) => L.map((u) => u.trim()).filter(Boolean).map((u) => shopHref(u) || u)

export function toForm(r: Rec): Form {
  const f: Form = { title: s(r.title), artist: s(r.artist), why: s(r.why), year: s(r.year), runtime: s(r.runtime) }
  const k = kindOf(r)
  const [c0, ...more] = wantCopies(r)
  f.moreCopies = more
  if (k !== 'own')
    Object.assign(f, { label: c0.label, catalog: c0.catalog, pressing: c0.pressing, copyName: c0.name, budget: c0.budget, discogsId: c0.discogsId })
  if (k === 'ordered') {
    Object.assign(f, {
      paid: s(r.paid),
      shop: s(r.shop),
      shopUrl: s(r.shopUrl),
      orderStatus: orderStatusOf(r),
      orderDate: s(r.orderDate),
      eta: s(r.eta),
      orderNum: s(r.orderNum),
      carrier: s(r.carrier),
      tracking: s(r.tracking),
    })
    if (r.orderNotes) f.orderNotes = s(r.orderNotes)
  }
  if (k === 'wish') Object.assign(f, { priority: String(r.priority == 1 ? 1 : r.priority == 3 ? 3 : 2), buyLinks: c0.buyLinks, releaseDate: c0.releaseDate })
  if (k === 'own')
    Object.assign(f, {
      copyName: s(r.copyName),
      label: s(r.label),
      catalog: s(r.catalog),
      pressing: pressingText(r),
      acquired: s(r.acquired),
      paid: s(r.paid),
      shop: s(r.shop),
      shopUrl: s(r.shopUrl),
      mediaGrade: s(r.mediaGrade),
      sleeveGrade: s(r.sleeveGrade),
      matrix: s(r.matrix),
      discogsId: c0.discogsId,
      ownedCopies: moreOwned(r),
    })
  return f
}

// the form as stored values: trimmed, runtime a number or "", paid without its "$", the shop's and copies' addresses made
// linkable, priority a number
export function stored(f: Form): Record<string, unknown> {
  const o: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(f)) if (typeof v === 'string') o[k] = k === 'why' || k === 'orderNotes' ? v : v.trim()
  if (f.discogsId !== undefined) o.discogsId = f.discogsId
  if (f.priority !== undefined) o.priority = +f.priority || 2
  if (f.buyLinks) o.buyLinks = tidyLinks(f.buyLinks)
  if (f.moreCopies)
    o.moreCopies = f.moreCopies.map((c) => ({
      name: c.name.trim(), pressing: c.pressing.trim(), label: c.label.trim(), catalog: c.catalog.trim(), budget: c.budget.trim(), discogsId: c.discogsId,
      buyLinks: tidyLinks(c.buyLinks),
      releaseDate: c.releaseDate,
      ...(c.barcodes ? { barcodes: c.barcodes } : {}),
      ...(c.releaseTracks ? { releaseTracks: c.releaseTracks } : {}),
      // a copy on order keeps its order (#139), stored as the record's own is
      ...(c.orderStatus
        ? {
            ...Object.fromEntries(ORDER_KEYS.map((k) => [k, k === 'orderNotes' ? (c[k] ?? '') : (c[k] ?? '').trim()])),
            paid: (c.paid ?? '').trim().replace(/^\$\s*/, ''),
            shopUrl: shopHref((c.shopUrl ?? '').trim()) || (c.shopUrl ?? '').trim(),
          }
        : {}),
    }))
  if (f.ownedCopies)
    o.ownedCopies = f.ownedCopies.map((c) => {
      // (a runtime only when one's typed: blank is its release's or the album's, #138)
      const t = Object.fromEntries(Object.entries(c).filter(([k, v]) => k !== 'runtime' || String(v).trim()).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]))
      return { ...t, paid: c.paid.trim().replace(/^\$\s*/, ''), shopUrl: shopHref(c.shopUrl.trim()) || c.shopUrl.trim() }
    })
  const n = parseInt(f.runtime, 10)
  o.runtime = isNaN(n) ? '' : n
  if (f.paid !== undefined) o.paid = f.paid.trim().replace(/^\$\s*/, '')
  if (f.shopUrl !== undefined) o.shopUrl = shopHref(f.shopUrl.trim()) || f.shopUrl.trim()
  return o
}

const LOOKED_UP = ['year', 'label', 'runtime', 'coverAsset']

// what to write: the fields that differ from the baseline, plus the autoFilled bookkeeping (needsSync is withSync's)
export function patchFor(r: Rec, baseline: Form, form: Form): Record<string, unknown> {
  const a = stored(baseline)
  const b = stored(form)
  const patch: Record<string, unknown> = {}
  for (const k in b) if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) patch[k] = b[k]
  const keys = Object.keys(patch)
  if (!keys.length) return patch
  // a field the person typed is no longer auto-filled
  if (Array.isArray(r.autoFilled) && keys.some((k) => r.autoFilled!.includes(k)))
    patch.autoFilled = r.autoFilled.filter((k) => !(k in patch))
  // a new title or artist is a different album: what the lookup matched may be wrong, so it looks it up again, and a
  // Not this artist, which was about the old match, comes off (#63)
  if (('title' in patch || 'artist' in patch) && (r.aboutBlocked || r.aboutAt || r.artistRef || r.about))
    Object.assign(patch, RELOOK_ABOUT, { artistRef: '', about: null }, r.aboutBlocked ? { aboutBlocked: false } : {})
  // and a lookup that gave up on the old one starts over (#69)
  if (('title' in patch || 'artist' in patch) && r.lookTries) patch.lookTries = 0
  // and what the lookup filled in for the old album (year, label, runtime, cover) is looked up again, replaced only by what
  // it finds for the new one (#94)
  const auto = (patch.autoFilled ?? r.autoFilled) as string[] | undefined
  if (('title' in patch || 'artist' in patch) && auto?.some((k) => LOOKED_UP.includes(k))) Object.assign(patch, { needsEnrich: true, relook: true })
  return patch
}

// the form's text fields, which the inputs edit
export type TextKey = { [K in keyof Form]-?: Form[K] extends string | undefined ? K : never }[keyof Form]
