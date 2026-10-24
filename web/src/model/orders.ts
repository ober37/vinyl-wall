// An order's links, as trackUrl and ownLinks in app/vinyl-wall.html build them.
import { kindOf, type Rec } from './record'

// the carrier's tracking page for a number; a pasted http(s) link as it is; any other carrier a web search. No number, no link
export function trackUrl(carrier: unknown, n: unknown): string {
  const num = String(n || '').trim()
  if (!num) return ''
  if (/^https?:\/\//i.test(num)) {
    try {
      const u = new URL(num)
      if (/^https?:$/.test(u.protocol)) return u.href
    } catch {
      // not a link after all: searched for below
    }
  }
  const q = encodeURIComponent(num)
  const c = String(carrier || '').toLowerCase()
  if (c.includes('usps')) return 'https://tools.usps.com/go/TrackConfirmAction?tLabels=' + q
  if (c.includes('ups')) return 'https://www.ups.com/track?tracknum=' + q
  if (c.includes('fedex')) return 'https://www.fedex.com/fedextrack/?trknbr=' + q
  if (c.includes('dhl')) return 'https://www.dhl.com/us-en/home/tracking.html?tracking-id=' + q
  return 'https://www.google.com/search?q=' + encodeURIComponent((c ? c + ' ' : '') + 'tracking ' + num)
}

// the record's own pressing on Discogs (or a search for it), what it sells for, and other pressings; no repeats
export function discogsLinks(r: Rec): [string, string][] {
  const q = encodeURIComponent(`${r.artist} ${r.title}`)
  const ord = kindOf(r) === 'ordered'
  const id = r.discogsId ? encodeURIComponent(String(r.discogsId)) : ''
  const search = `https://www.discogs.com/search/?q=${q}&type=release&format_exact=Vinyl`
  const L: [string, string][] = [
    id ? [ord ? 'The edition you ordered' : 'Your pressing', `https://www.discogs.com/release/${id}`] : [ord ? 'Find the edition' : 'Find your pressing', search],
    id ? ['What it sells for', `https://www.discogs.com/sell/history/${id}`] : ['Past sales (Popsike)', `https://www.popsike.com/php/quicksearch.php?searchtext=${q}`],
    ['Other pressings', search],
  ]
  return L.filter((x, i, a) => a.findIndex((y) => y[1] === x[1]) === i)
}
