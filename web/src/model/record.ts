// Record helpers ported from app/vinyl-wall.html. Pure: no React, no db.

export type Note = { d?: string; t?: string; [k: string]: unknown }
export type Track = { pos?: string; title?: string; dur?: string }
export type About = {
  summary?: string
  released?: string
  label?: string
  producers?: unknown
  recorded?: string
  genres?: unknown
  tracks?: unknown
  [k: string]: unknown
}
export type Rec = {
  id: string
  title?: string
  artist?: string
  status?: string
  year?: string | number
  runtime?: number | string
  label?: string
  catalog?: string
  why?: string
  pressing?: string
  discogsId?: number | string
  acquired?: string
  paid?: string
  shop?: string
  shopUrl?: string
  mediaGrade?: string
  sleeveGrade?: string
  matrix?: string
  coverAsset?: string
  priority?: number
  eta?: string
  added?: number
  deleted?: boolean
  aboutBlocked?: boolean
  about?: About
  autoFilled?: string[]
  notes?: unknown
  [k: string]: unknown
}

export type Kind = 'own' | 'ordered' | 'wish'
// a missing or unknown status means owned, as in production
export const kindOf = (r: Rec): Kind => (r.status === 'wish' ? 'wish' : r.status === 'ordered' ? 'ordered' : 'own')
export const KIND_LABEL: Record<Kind, string> = { own: 'Owned', ordered: 'Ordered', wish: 'Wanted' }

// the wall's order: owned by when added, then on order by expected arrival, then the hunt by priority
export function wallOrder(records: Rec[]): Rec[] {
  const ord = records.filter((r) => kindOf(r) === 'ordered').sort((a, b) => (a.eta || '9999').localeCompare(b.eta || '9999'))
  const own = records.filter((r) => kindOf(r) === 'own').sort((a, b) => (a.added || 0) - (b.added || 0))
  const wish = records
    .filter((r) => kindOf(r) === 'wish')
    .sort((a, b) => (a.priority || 2) - (b.priority || 2) || (a.added || 0) - (b.added || 0))
  return [...own, ...ord, ...wish]
}

export const coverUrl = (r: Rec) => (r.coverAsset ? '/_blob/' + r.coverAsset : '')

// the pressing as typed, minus a "(Discogs r…)" note that only repeats the linked release
export function pressingText(r: Rec): string {
  const id = String(r.discogsId || '').replace(/\D/g, '')
  let p = String(r.pressing || '')
  if (id) p = p.replace(new RegExp('\\s*\\(Discogs r?' + id + '\\)', 'i'), '')
  return p.trim()
}

export const GRADES: [string, string][] = [
  ['', 'Not graded'],
  ['M', 'Mint (M)'],
  ['NM', 'Near mint (NM)'],
  ['VG+', 'Very good plus (VG+)'],
  ['VG', 'Very good (VG)'],
  ['G+', 'Good plus (G+)'],
  ['G', 'Good (G)'],
  ['F', 'Fair (F)'],
  ['P', 'Poor (P)'],
]
const GRADE_NAME: Record<string, string> = { M: 'Mint', NM: 'Near mint', F: 'Fair', P: 'Poor' }
export function gradeText(r: Rec): string {
  const g = (v: string | undefined, w: string) => (v ? `${GRADE_NAME[v] || v} ${w}` : '')
  return [g(r.mediaGrade, 'vinyl'), g(r.sleeveGrade, 'sleeve')].filter(Boolean).join(' · ')
}

export function okUrl(u: unknown): string {
  try {
    const x = new URL(String(u || ''))
    return /^https?:$/.test(x.protocol) ? x.href : ''
  } catch {
    return ''
  }
}
// the shop's website: "roughtrade.com" gets https:// in front; anything still not http(s) won't link
export function shopHref(u: unknown): string {
  const s = String(u || '').trim()
  return okUrl(/^[a-z][a-z\d+.-]*:/i.test(s) || !s.includes('.') ? s : 'https://' + s)
}

// a runout's parts, separated by " · " or ";"
export const runParts = (m: unknown) =>
  String(m || '')
    .split(/\s+·\s+|\s*;\s*/)
    .map((x) => x.trim())
    .filter(Boolean)

export function today(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10)
}
export function shortDate(d: string): string {
  const t = new Date(d + 'T12:00')
  return isNaN(+t) ? d : t.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
export function playDate(d: string): string {
  if (!/^\d{4}-\d\d-\d\d$/.test(d)) return d
  const y = d.slice(0, 4)
  return shortDate(d) + (y !== today().slice(0, 4) ? ', ' + y : '')
}
export const longDate = (d: unknown) =>
  typeof d === 'string' && /^\d{4}-\d\d-\d\d$/.test(d)
    ? new Date(d + 'T12:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : String(d || '')

// Plays: notes written by Log play ("Played <kind>[ on <setup>] (~N min)")
const PLAY_NOTE = /^Played (one side|the whole album|\d+ tracks?)\b(.*?)\(~(\d+) min\)/
const noteList = (r: Rec): Note[] =>
  (Array.isArray(r.notes) ? r.notes : []).filter((n): n is Note => !!n && typeof n === 'object')
export const isPlay = (n: Note) => PLAY_NOTE.test(String(n.t ?? ''))
export const VIBES = ['Background', 'Easy', 'Locked in', 'Lost in it', 'Goosebumps']
const MOOD_VIBE: Record<string, number> = { loved: 5, good: 3, meh: 2 }
// the vibe of a spin, 1–5 (older plays kept a mood, read here as a vibe); 0 when none
export const vibeOf = (n: Note) => {
  const v = +(n.vibe ?? MOOD_VIBE[String(n.mood)] ?? 0)
  return v >= 1 && v <= 5 ? v : 0
}

// ref finds the play's note again for the journal (see model/notes.ts)
export type Play = {
  key: number
  ref: { i: number; d?: string; t?: string }
  day: string
  date: string
  what: string
  // ● a whole album, ◐ a side, ◔ tracks
  icon: string
  setup: string
  min: number
  vibe: number
  thoughts: string
}
export type PlayMonth = { month: string; name: string; plays: Play[]; min: number }

// the play history, newest first, grouped by month
export function playMonths(r: Rec): PlayMonth[] {
  const T = recordTracks(r)
  const title = (p: unknown) => T.find((t) => t.pos === p)?.title || String(p)
  const rows = noteList(r)
    .map((n, i) => ({ n, i }))
    .filter((x) => isPlay(x.n))
    .sort((a, b) => String(b.n.d || '').localeCompare(String(a.n.d || '')) || b.i - a.i)
  const months: PlayMonth[] = []
  for (const { n, i } of rows) {
    const t = String(n.t)
    const m = PLAY_NOTE.exec(t)!
    const d = String(n.d || '')
    const tp = Array.isArray(n.tracks) ? n.tracks : []
    const cnt = tp.length || +(/^Played (\d+)/.exec(t) || [])[1] || 0
    // only Log play's own wording ("Played <kind>[ on <setup>] (~N min)[. comment]") reads compactly; a play typed by
    // hand shows as written
    const on = /^(?: on (.+))? $/.exec(m[2])
    // the kind the pattern read: "the whole album", "one side" or "N tracks"
    const whole = m[1] === 'the whole album'
    const side = m[1] === 'one side'
    const what = !on
      ? t
      : whole
      ? 'Whole album'
      : side
        ? n.side
          ? 'Side ' + n.side
          : 'One side'
        : `${cnt} track${cnt === 1 ? '' : 's'}${tp.length ? ' · ' + tp.slice(0, 2).map(title).join(', ') + (tp.length > 2 ? ` +${tp.length - 2}` : '') : ''}`
    const play: Play = {
      key: i,
      ref: { i, d: n.d, t: n.t },
      day: d,
      date: d ? playDate(d) : '',
      what,
      icon: whole ? '●' : side ? '◐' : '◔',
      setup: on?.[1] || '',
      min: +m[3] || 0,
      vibe: vibeOf(n),
      thoughts: String(n.j ?? (on ? t.slice(m[0].length).replace(/^\.\s*/, '') : '')).trim(),
    }
    const month = /^\d{4}-\d\d-\d\d$/.test(d) ? d.slice(0, 7) : ''
    let g = months[months.length - 1]
    if (!g || g.month !== month) {
      const name = month
        ? new Date(month + '-15T12:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        : 'Undated'
      months.push((g = { month, name, plays: [], min: 0 }))
    }
    g.plays.push(play)
    g.min += play.min
  }
  return months
}

export const fmtH = (h: number) => (h < 10 ? h.toFixed(1) : Math.round(h).toString())

export function recordTracks(r: Rec): Track[] {
  const T = !r.aboutBlocked && Array.isArray(r.about?.tracks) ? (r.about!.tracks as unknown[]) : []
  return T.filter((t): t is Track => !!t && typeof t === 'object' && !!(t as Track).title)
}

// key info about the album (from Wikidata, with the record's own label as a fallback)
export function keyInfo(r: Rec): [string, string][] {
  const ab: About = (!r.aboutBlocked && r.about) || {}
  const list = (a: unknown) => (Array.isArray(a) ? a.filter(Boolean).map(String).join(', ') : '')
  const f: [string, string][] = []
  if (ab.released) f.push(['Released', longDate(ab.released)])
  const k = kindOf(r)
  const lab = ab.label || (k !== 'wish' ? r.label : '')
  const cat = k !== 'wish' && !(r.matrix && k !== 'ordered') ? r.catalog : ''
  if (lab || cat) f.push(['Label', [lab, cat].filter(Boolean).join(' · ')])
  if (list(ab.producers)) f.push(['Producer', list(ab.producers)])
  // the place, then the dates on their own line (split at the last " · ")
  if (ab.recorded) {
    const t = String(ab.recorded)
    const i = t.lastIndexOf(' · ')
    f.push(['Recorded', i < 0 ? t : t.slice(0, i) + '\n' + t.slice(i + 3)])
  }
  if (list(ab.genres)) f.push(['Genre', list(ab.genres)])
  return f
}

// Sleeves. The disc label and generated cover colours come from the title and artist, as in production: per-record data
// (like a cover photo), not design tokens.
const hash = (s: string) => {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0
  return Math.abs(h)
}
export const hueOf = (r: Rec) => hash((r.title || '') + (r.artist || '')) % 360
// a generated sleeve's two colours, corner to corner, on the wall and in the share picture
export const faceColors = (hue: number) => [`hsl(${hue} 45% 32%)`, `hsl(${(hue + 40) % 360} 50% 18%)`] as const

export const OSTAT: Record<string, string> = { preorder: 'Pre-order', ordered: 'Ordered', shipped: 'Shipped', delayed: 'Delayed' }
// an order's state as one of OSTAT's; anything else stored there (an old "delivered") reads as Ordered
export const orderStatusOf = (r: Rec) => (Object.hasOwn(OSTAT, String(r.orderStatus)) ? String(r.orderStatus) : 'ordered')
export type Tag = { text: string; tone: 'ship' | 'want' | 'paper' | 'someday' }
// the hang tag: an order's state and expected date, or a hunt's priority (no budget, by the owner's choice); none on owned
// records
export function tagOf(r: Rec): Tag | null {
  const k = kindOf(r)
  if (k === 'ordered') return { text: OSTAT[orderStatusOf(r)] + (r.eta ? ' · ' + shortDate(r.eta) : ''), tone: 'ship' }
  if (k !== 'wish') return null
  const p = r.priority == 1 ? 1 : r.priority == 3 ? 3 : 2
  return { text: ['Top want', 'Want', 'Someday'][p - 1], tone: p === 1 ? 'want' : p === 3 ? 'someday' : 'paper' }
}
