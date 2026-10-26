// Your shops (settings.shops, #79): where Search elsewhere and research in the Claude chat look for a copy, local shops
// first. A wall that never edited the list has the defaults; an edited one keeps exactly what it saved, even nothing.
import type { Rec } from './record'

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

// a typed website made linkable: https:// added when there's no scheme, anything else dropped
export function siteUrl(v: string): string {
  const t = v.trim()
  if (!t) return ''
  try {
    const u = new URL(/^[a-z]+:/i.test(t) ? t : 'https://' + t)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''
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

// a research entry's "<shop>: <result>" line, split so the shop's name can link to its search
export function shopLine(line: string, list: Shop[]): { shop?: Shop; name: string; rest: string } {
  const i = line.indexOf(': ')
  if (i < 0) return { name: '', rest: line }
  const name = line.slice(0, i)
  return { shop: list.find((s) => s.name.toLowerCase() === name.trim().toLowerCase()), name, rest: line.slice(i + 2) }
}
