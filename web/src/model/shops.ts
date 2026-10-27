// Your shops (settings.shops, #79): where Search elsewhere and research in the Claude chat look for a copy, local shops
// first. A wall that never edited the list has the defaults; an edited one keeps exactly what it saved, even nothing.
import { kindOf, shopHref, type Rec } from './record'

export type ShopKind = 'local' | 'online' | 'market'
// search: the shop's search with {q} where "artist title" goes. upc (a product page by barcode, {upc}) and shopify (its
// product data can be read) are found and used by the chat, not shown. A local shop also keeps how to reach it and a line about it
export type Shop = {
  id: string
  name: string
  kind: ShopKind
  url?: string
  search?: string
  upc?: string
  shopify?: boolean
  place?: string
  phone?: string
  email?: string
  about?: string
}

export const KINDS: [ShopKind, string][] = [
  ['local', 'Local'],
  ['online', 'Online'],
  ['market', 'Marketplace'],
]
export const DEFAULT_SHOPS: Shop[] = [
  { id: 'revolver', name: 'Revolver', kind: 'online', url: 'https://shop.revolvermag.com/', search: 'https://shop.revolvermag.com/search?q={q}', shopify: true },
  { id: 'amazon', name: 'Amazon', kind: 'online', url: 'https://www.amazon.com/', search: 'https://www.amazon.com/s?k={q}%20vinyl&i=popular' },
  { id: 'discogs', name: 'Discogs Marketplace', kind: 'market', url: 'https://www.discogs.com/sell', search: 'https://www.discogs.com/sell/list?q={q}&format=Vinyl' },
  { id: 'ebay', name: 'eBay', kind: 'market', url: 'https://www.ebay.com/', search: 'https://www.ebay.com/sch/i.html?_nkw={q}%20vinyl%20LP&_sacat=176985' },
]

const https = (v: unknown) => (/^https:\/\/[^\s]+$/i.test(String(v || '').trim()) ? String(v).trim() : '')
const text = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '')

// the stored list, cleaned: only named shops, links only when https, unknown kinds read as online
export function shopsOf(settings: Record<string, unknown>): Shop[] {
  if (!Array.isArray(settings.shops)) return DEFAULT_SHOPS
  return settings.shops
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && !!text(s.name, 80))
    .map((s, i) => {
      const kind = KINDS.some(([k]) => k === s.kind) ? (s.kind as ShopKind) : 'online'
      const shop: Shop = { id: text(s.id, 40) || 's' + i, name: text(s.name, 80), kind }
      const url = https(s.url)
      const search = https(s.search)
      if (url) shop.url = url
      if (search.includes('{q}')) shop.search = search
      const upc = https(s.upc)
      if (upc.includes('{upc}')) shop.upc = upc
      if (s.shopify === true) shop.shopify = true
      if (kind === 'local')
        for (const k of ['place', 'phone', 'email', 'about'] as const) {
          const v = text(s[k], k === 'about' ? 400 : 120)
          if (v) shop[k] = v
        }
      return shop
    })
}

// a typed website made linkable: https:// added when there's no scheme, anything else dropped, as is a name that isn't
// a domain (like "slashorg.")
export function siteUrl(v: string): string {
  const t = v.trim()
  if (!t) return ''
  try {
    const u = new URL(/^[a-z]+:/i.test(t) ? t : 'https://' + t)
    return (u.protocol === 'https:' || u.protocol === 'http:') && /^([a-z\d-]+\.)+[a-z]{2,}$/i.test(u.hostname) ? u.href : ''
  } catch {
    return ''
  }
}

// where a shop looks for this album: its search, else its website
export const shopLink = (s: Shop, r: { artist?: unknown; title?: unknown }) =>
  s.search ? s.search.replace('{q}', encodeURIComponent(`${r.artist || ''} ${r.title || ''}`.trim())) : s.url || ''
export const mapLink = (s: Shop) => (s.place ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${s.name} ${s.place}`) : '')
export const telLink = (s: Shop) => (s.phone && /\d/.test(s.phone) ? 'tel:' + s.phone.replace(/[^\d+]/g, '') : '')
export const mailLink = (s: Shop) => (s.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email) ? 'mailto:' + s.email : '')
// how to reach a local shop: the links it has, of Call, Email and Map
export const reachOf = (s: Shop): [string, string][] =>
  s.kind === 'local' ? ([['Call', telLink(s)], ['Email', mailLink(s)], ['Map', mapLink(s)]] as [string, string][]).filter(([, u]) => u) : []
// the town (an address's second-to-last part) or the website's domain, to tell shops apart in a list
export function shopWhere(s: Shop): string {
  if (s.kind === 'local' && s.place) {
    const p = s.place.split(',').map((x) => x.trim()).filter(Boolean)
    return p.length > 2 ? p[p.length - 2] : p.length > 1 ? p[p.length - 1] : p[0]
  }
  try {
    return new URL(s.url || s.search || '').hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

// Search elsewhere's order: local shops with a web store, local shops without, online shops, marketplaces; A to Z in each
const rank = (s: Shop) => (s.kind === 'local' ? (s.url || s.search ? 0 : 1) : s.kind === 'online' ? 2 : 3)
export const shopOrder = (list: Shop[]) => [...list].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))

// before your shops: the album's vinyl releases on Discogs, to pick the pressing
export const discogsReleases = (r: Rec) =>
  `https://www.discogs.com/search/?q=${encodeURIComponent(`${r.artist} ${r.title}`)}&type=all&format_exact=Vinyl`

// a file's shops brought onto a wall that has its own (an import): shops it doesn't have are added, and a shop it has
// (by name) gets only the details it's missing, so nothing typed on this wall changes
export function mergeShops(wall: Shop[], file: Shop[]): { list: Shop[]; added: number; filled: number } {
  const list = wall.map((s) => ({ ...s }))
  let added = 0
  let filled = 0
  for (const f of file) {
    const s = list.find((x) => x.name.toLowerCase() === f.name.toLowerCase())
    if (!s) {
      list.push(f)
      added++
      continue
    }
    let more = false
    for (const k of ['url', 'search', 'upc', 'shopify', 'place', 'phone', 'email', 'about'] as const)
      if (f[k] && !s[k] && (s.kind === 'local' || !['place', 'phone', 'email', 'about'].includes(k))) {
        ;(s as Record<string, unknown>)[k] = f[k]
        more = true
      }
    if (more) filled++
  }
  return { list, added, filled }
}

// a research entry's "<shop>: <result>" line, split so the shop's name can link to its search
export function shopLine(line: string, list: Shop[]): { shop?: Shop; name: string; rest: string } {
  const i = line.indexOf(': ')
  if (i < 0) return { name: '', rest: line }
  const name = line.slice(0, i)
  return { shop: list.find((s) => s.name.toLowerCase() === name.trim().toLowerCase()), name, rest: line.slice(i + 2) }
}

const host = (u: unknown) => {
  try {
    return new URL(String(u || '')).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}
// the shop on your list a record came from (#89), worked out on display: by website, the name settling a website two
// shops share, else by name. A marketplace match keeps the record's own seller and link (see shopShown)
export function shopOf(r: { shop?: unknown; shopUrl?: unknown }, list: Shop[]): Shop | undefined {
  const name = String(r.shop || '').trim().toLowerCase()
  const h = host(shopHref(r.shopUrl))
  const same = h ? list.filter((s) => host(s.url) === h || host(s.search) === h) : []
  if (same.length === 1) return same[0]
  return name ? (same.length ? same : list).find((s) => s.name.toLowerCase() === name) : undefined
}
export const shopShown = (r: { shop?: unknown; shopUrl?: unknown }, list: Shop[]) => {
  const s = shopOf(r, list)
  return s && s.kind !== 'market' ? s : undefined
}

// Settings → Shops' Not on your list yet: the shops your owned and ordered records came from that aren't on the list,
// by name (or website), with how many records and the first website seen
export function unlistedShops(records: Rec[], list: Shop[]): { name: string; url: string; count: number }[] {
  const by = new Map<string, { name: string; url: string; count: number }>()
  for (const r of records) {
    if (r.deleted || r.example || kindOf(r) === 'wish' || shopOf(r, list)) continue
    const href = shopHref(r.shopUrl)
    const name = String(r.shop || '').trim() || host(href)
    if (!name) continue
    const k = name.toLowerCase()
    const e = by.get(k) || { name, url: '', count: 0 }
    e.count++
    if (!e.url && siteUrl(href)) e.url = new URL(href).origin + '/'
    by.set(k, e)
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

// the shops to suggest where a record came from (#99): up to 5 whose name has what's typed, those starting with it first,
// then in Search elsewhere's order; none before anything's typed or once it's a shop's name exactly
export function shopSuggest(list: Shop[], typed: string): string[] {
  const q = typed.trim().toLowerCase()
  if (!q || list.some((s) => s.name.toLowerCase() === q)) return []
  const hits = shopOrder(list.filter((s) => s.name.toLowerCase().includes(q)))
  return [...hits.filter((s) => s.name.toLowerCase().startsWith(q)), ...hits.filter((s) => !s.name.toLowerCase().startsWith(q))].slice(0, 5).map((s) => s.name)
}

// the website a shop picked where a record came from fills in (#99): a listed shop's, not a marketplace's (its link is
// the seller's)
export function shopSite(list: Shop[], name: string): string {
  const s = list.find((x) => x.name.toLowerCase() === name.trim().toLowerCase())
  return s && s.kind !== 'market' ? s.url || '' : ''
}
// whether a record's link is at a shop's website (a product page there), and so stays when that shop is picked
export const sameSite = (a: unknown, b: unknown) => !!host(shopHref(a)) && host(shopHref(a)) === host(shopHref(b))
