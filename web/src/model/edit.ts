// The edit form's fields and the patch they write. Mirrors collect()/schedule()/write() in app/vinyl-wall.html:
// only fields the form owns, only when they changed, in production's stored shapes.
import { kindOf, pressingText, shopHref, type Rec } from './record'

export type Form = {
  title: string
  artist: string
  why: string
  year: string
  runtime: string
  // owned records only
  label?: string
  catalog?: string
  pressing?: string
  acquired?: string
  paid?: string
  shop?: string
  shopUrl?: string
  mediaGrade?: string
  sleeveGrade?: string
}

// fields whose changes Discogs sync pushes (production's SYNCED)
const SYNCED = new Set([
  'title', 'artist', 'status', 'pressing', 'matrix', 'shop', 'acquired', 'paid', 'why', 'mediaGrade', 'sleeveGrade', 'priority',
  'budget', 'copyName', 'moreCopies', 'orderDate', 'orderStatus', 'eta', 'discogsId', 'deleted',
])
// every write goes through this: a synced field changed means the background task pushes it to Discogs
export const withSync = (patch: Record<string, unknown>) =>
  Object.keys(patch).some((k) => SYNCED.has(k)) ? { ...patch, needsSync: true } : patch

const s = (v: unknown) => (v === undefined || v === null ? '' : String(v))

export function toForm(r: Rec): Form {
  const f: Form = { title: s(r.title), artist: s(r.artist), why: s(r.why), year: s(r.year), runtime: s(r.runtime) }
  if (kindOf(r) === 'own')
    Object.assign(f, {
      label: s(r.label),
      catalog: s(r.catalog),
      pressing: pressingText(r),
      acquired: s(r.acquired),
      paid: s(r.paid),
      shop: s(r.shop),
      shopUrl: s(r.shopUrl),
      mediaGrade: s(r.mediaGrade),
      sleeveGrade: s(r.sleeveGrade),
    })
  return f
}

// the form as stored values: trimmed, runtime a number or "", paid without its "$", the shop's address made linkable
export function stored(f: Form): Record<string, unknown> {
  const o: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(f)) if (v !== undefined) o[k] = k === 'why' ? v : v.trim()
  const n = parseInt(f.runtime, 10)
  o.runtime = isNaN(n) ? '' : n
  if (f.paid !== undefined) o.paid = f.paid.trim().replace(/^\$\s*/, '')
  if (f.shopUrl !== undefined) o.shopUrl = shopHref(f.shopUrl.trim()) || f.shopUrl.trim()
  return o
}

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
  return patch
}
