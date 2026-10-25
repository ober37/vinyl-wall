// About the artist: the artist doc the background task wrote (Part L) from MusicBrainz, Wikidata and Wikipedia. Links come
// only from typed Wikidata ids, never free text; anything that isn't http(s) is dropped.
import { okUrl, type Rec } from './record'

export type Artist = { name: string; summary: string; credit: 'claude' | 'wikipedia' | 'discogs'; wiki: string; links: [string, string][] }

// the kinds shown, in this order, one link each
export const LINK_KINDS: Record<string, string> = {
  website: 'Website',
  instagram: 'Instagram',
  youtube: 'YouTube',
  spotify: 'Spotify',
  bandcamp: 'Bandcamp',
  applemusic: 'Apple Music',
  soundcloud: 'SoundCloud',
  tiktok: 'TikTok',
  x: 'X',
  facebook: 'Facebook',
}
const ORDER = Object.keys(LINK_KINDS)
export const LINKS_SHOWN = 5

// the record's artist, unless Not this artist turned it off; null when there's nothing to show
export function artistOf(r: Rec, artists: ({ id: string } & Record<string, unknown>)[]): Artist | null {
  if (!r.artistRef || r.aboutBlocked) return null
  const A = artists.find((a) => a.id === r.artistRef)
  if (!A) return null
  const links = ((Array.isArray(A.links) ? A.links : []) as ({ kind?: unknown; url?: unknown } | null)[])
    .map((l) => ({ k: String(l?.kind ?? ''), u: okUrl(l?.url) }))
    .filter((l) => l.u && Object.hasOwn(LINK_KINDS, l.k))
    .filter((l, i, a) => a.findIndex((x) => x.k === l.k) === i)
    .sort((a, b) => ORDER.indexOf(a.k) - ORDER.indexOf(b.k))
    .map((l): [string, string] => [LINK_KINDS[l.k], l.u])
  const summary = typeof A.summary === 'string' ? A.summary.trim() : ''
  if (!summary && !links.length) return null
  return {
    name: (typeof A.name === 'string' && A.name) || r.artist || '',
    summary,
    credit: A.source === 'claude' ? 'claude' : A.source === 'discogs' ? 'discogs' : 'wikipedia',
    wiki: okUrl(A.wiki),
    links,
  }
}
