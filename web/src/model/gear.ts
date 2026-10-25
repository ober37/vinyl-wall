// Equipment, as the gear and setup code in app/vinyl-wall.html keeps it: gear/<id> docs (written whole) and setups/<id>
// docs. A play adds its minutes to the tracked gear it was played on (gear.plays {d,id,title,min,setup}).
import { fmtH, isPlay, today, type Note } from './record'

export type Gear = {
  id: string
  type?: string
  name?: string
  // a setup id, ALL_SETUPS for shared gear, or "" (none)
  setup?: string
  status?: string
  retired?: string
  tracks?: boolean
  ratedLow?: number | string
  ratedHigh?: number | string
  installed?: string
  startHours?: number | string
  minutes?: number
  plays?: GearPlay[]
  notes?: Note[]
  shop?: string
  paid?: string
  warranty?: string
  specs?: string
  added?: number
  example?: boolean
  [k: string]: unknown
}
export type GearPlay = { d: string; id?: string; title: string; min: number; setup?: string }
export type Setup = { id: string; name?: string; note?: string; added?: number }

type GType = { label: string; tracks: boolean; ratedLow?: number; ratedHigh?: number; hint?: string }
export const GEAR_TYPES: Record<string, GType> = {
  turntable: { label: 'Turntable', tracks: true },
  cartridge: { label: 'Cartridge', tracks: true },
  stylus: { label: 'Stylus', tracks: true, ratedLow: 300, ratedHigh: 500, hint: "Most styluses are rated for a few hundred hours. Check the maker's spec." },
  preamp: { label: 'Phono preamp', tracks: false },
  amp: { label: 'Amplifier / receiver', tracks: false },
  speakers: { label: 'Speakers', tracks: false },
  headphones: { label: 'Headphones', tracks: false },
  mat: { label: 'Slipmat', tracks: false },
  belt: { label: 'Drive belt', tracks: true },
  cleaning: { label: 'Cleaning gear', tracks: false },
  other: { label: 'Other', tracks: false },
}
export const GEAR_ORDER = Object.keys(GEAR_TYPES)
export const GEAR_EXAMPLE: Record<string, string> = {
  turntable: 'Technics SL-1500C', cartridge: 'Ortofon 2M Red', stylus: 'Audio-Technica ATN-VM95E', preamp: 'Schiit Mani 2', amp: 'Yamaha A-S501',
  speakers: 'KEF Q150', headphones: 'Sennheiser HD 600', mat: 'Cork slipmat', belt: 'Replacement belt for AT-LP60X', cleaning: 'Record brush and fluid', other: 'Make and model',
}
export const typeOf = (g: Gear) => GEAR_TYPES[g.type || ''] || GEAR_TYPES.other
export const gName = (g: Gear) => g.name || GEAR_TYPES[g.type || '']?.label || 'Equipment'

export const gHours = (g: Gear) => (+g.startHours! || 0) + (+g.minutes! || 0) / 60
export const lowOf = (g: Gear) => +g.ratedLow! || 0
export const highOf = (g: Gear) => +g.ratedHigh! || 0
// a type's typical rating, as the rating fields hold it
export const ratingOf = (type: string) => ({ lo: String(GEAR_TYPES[type]?.ratedLow || ''), hi: String(GEAR_TYPES[type]?.ratedHigh || '') })

// "Getting close" starts this many hours before the lower rating (a percentage left 60 h on a 300 h stylus)
const WARN_HOURS = 10
export type Tone = '' | 'warn' | 'bad'
export function gState(g: Gear): { tone: Tone; label: string; msg: string } {
  const h = gHours(g), lo = lowOf(g), hi = highOf(g)
  if (g.status === 'retired') return { tone: '', label: 'Retired', msg: `Retired${g.retired ? ' ' + g.retired : ''} at ${fmtH(h)} h.` }
  if (!g.tracks) return { tone: '', label: 'In use', msg: '' }
  if (!lo && !hi) return { tone: '', label: 'Tracking', msg: 'No rated life set. Hours are logged for reference.' }
  const top = hi || lo
  if (hi && h >= hi) return { tone: 'bad', label: 'Replace now', msg: `Past the ${hi} h upper rating.` }
  if (lo && h >= lo) return { tone: 'bad', label: 'Replace window', msg: hi ? `Inside the ${lo}–${hi} h replacement window.` : `Past the ${lo} h rating.` }
  if (lo && lo - h <= WARN_HOURS) return { tone: 'warn', label: 'Getting close', msg: `About ${Math.round(lo - h)} h until the ${lo} h mark. A good time to order a spare.` }
  return { tone: '', label: 'Healthy', msg: `About ${Math.round((lo || top) - h)} h until the ${lo || top} h mark.` }
}
export const fmtLeft = (x: number) => (Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : fmtH(x))
// how far a tracked part is from its rating: hours to go until the lower one, then in the window, then over
export function wearLeft(g: Gear) {
  const h = gHours(g), lo = lowOf(g), hi = highOf(g), top = hi || lo
  if (!top) return ''
  return lo && h < lo ? `${fmtLeft(lo - h)} h to go` : hi && h < hi ? 'in window' : fmtLeft(h - top) === '0' ? 'at rated life' : `${fmtLeft(h - top)} h over`
}
export const rated = (g: Gear) => !!(lowOf(g) || highOf(g))
// the card meter fills toward the lower rating, which is where the warnings are measured
export const wearPct = (g: Gear) => {
  const r = lowOf(g) || highOf(g)
  return r ? Math.min(100, (gHours(g) / r) * 100) : 0
}

export const ALL_SETUPS = '*'
export const sortSetups = (s: Setup[]) => s.slice().sort((a, b) => (a.added || 0) - (b.added || 0))
export const setupName = (setups: Setup[], id: string | undefined) =>
  id === ALL_SETUPS ? 'Shared' : setups.find((x) => x.id === id)?.name || 'No setup'
// gear with no (or a deleted) setup counts toward every play, like shared gear, until it's assigned
export const inSetup = (g: Gear, id: string, setups: Setup[]) =>
  g.setup === id || g.setup === ALL_SETUPS || !setups.some((x) => x.id === g.setup)
export const activeGear = (gear: Gear[]) =>
  gear
    .filter((g) => g.status !== 'retired')
    .sort((a, b) => GEAR_ORDER.indexOf(a.type || '') - GEAR_ORDER.indexOf(b.type || '') || (a.added || 0) - (b.added || 0))
// the tracked part nearest its rating, for the header
export function worstGear(gear: Gear[]): Gear | null {
  const r = activeGear(gear).filter((g) => g.tracks && rated(g))
  const use = (g: Gear) => gHours(g) / (lowOf(g) || highOf(g))
  return r.sort((a, b) => use(b) - use(a))[0] || null
}

// the header's Equipment button: the worst rated part and its name ("Office stylus: Healthy, 298 h remaining"), else
// a count of the gear, else (owners with no gear) an invitation
export function pillOf(gear: Gear[], setups: Setup[]) {
  const w = worstGear(gear)
  if (!w) {
    const n = activeGear(gear).length
    return { label: n ? 'Gear' : '', gear: null, aria: n ? `Equipment, ${n} item${n > 1 ? 's' : ''}` : 'Add your gear' }
  }
  const S = gState(w), lo = lowOf(w), hi = highOf(w), h = gHours(w), top = hi || lo
  const type = typeOf(w).label
  const who = setups.some((x) => x.id === w.setup) ? `${setupName(setups, w.setup)} ${type.toLowerCase()}` : type
  const over = fmtLeft(h - top)
  const left =
    lo && h < lo ? `${fmtLeft(lo - h)} h remaining` : hi && h < hi ? `${fmtLeft(hi - h)} h to its upper rating` : over === '0' ? 'at its rating' : `${over} h past its rating`
  return { label: type, gear: w, aria: `${who}: ${S.label}, ${left}` }
}

// a play: which setup it's on (the remembered one, else the first), and the minutes for the gear on it
const LAST = 'rw.lastSetup'
export function lastSetup(setups: Setup[]) {
  let v: string | null = null
  try {
    v = localStorage.getItem(LAST)
  } catch {
    // storage blocked: the first setup
  }
  const S = sortSetups(setups)
  return S.find((x) => x.id === v)?.id || S[0]?.id || ''
}
export function rememberSetup(id: string) {
  try {
    localStorage.setItem(LAST, id)
  } catch {
    // not remembered
  }
}
// what logging min minutes of a record writes to each piece of gear (all tracked gear when there are no setups)
export function gearForPlay(gear: Gear[], setups: Setup[], setup: string, rec: { id: string; title?: string }, min: number, day = today()) {
  const has = setups.length > 0
  return activeGear(gear)
    .filter((g) => g.tracks && (!has || inSetup(g, setup, setups)))
    .map((g) => ({
      g,
      data: {
        installed: g.installed || day,
        minutes: (+g.minutes! || 0) + min,
        plays: [...(g.plays || []), { d: day, id: rec.id, title: rec.title || '', min, ...(has ? { setup } : {}) }].slice(-200),
      },
    }))
}
// the gear entries that hold a play's minutes (same record, date and minutes, newest first), so deleting the play takes
// them back off and a date change moves them
const MIN = /\(~(\d+) min\)/
export function gearOfPlay(gear: Gear[], recId: string, n: Note) {
  const m = +(MIN.exec(String(n.t ?? ''))?.[1] ?? 0), d = String(n.d || '')
  const out: { g: Gear; k: number; m: number }[] = []
  if (!m || !isPlay(n)) return out
  for (const g of gear) {
    const P = g.plays || []
    for (let k = P.length - 1; k >= 0; k--)
      if (P[k].id === recId && P[k].d === d && +P[k].min === m) {
        out.push({ g, k, m })
        break
      }
  }
  return out
}
export const playOff = (g: Gear, k: number, m: number) => ({ minutes: Math.max(0, (+g.minutes! || 0) - m), plays: (g.plays || []).filter((_, j) => j !== k) })
export const playMoved = (g: Gear, k: number, d: string) => ({ plays: (g.plays || []).map((x, j) => (j === k ? { ...x, d } : x)) })
// "~46 min come off your stylus and cartridge."
export function offText(hits: { g: Gear; m: number }[]) {
  if (!hits.length) return ''
  const L = [...new Set(hits.map((x) => typeOf(x.g).label.toLowerCase()))]
  return ` ~${hits[0].m} min come off your ${L.length > 1 ? L.slice(0, -1).join(', ') + ' and ' + L[L.length - 1] : L[0]}.`
}
// the line after Log play: the one piece that took the minutes by name, or how many, and the most worn rated part
// among them (production names the most worn part on the whole wall, which read as if it had been played)
export function loggedText(min: number, pieces: Gear[]) {
  if (!pieces.length) return 'Logged the listen. Add your gear to track wear.'
  if (pieces.length === 1) return `Logged ${min} min on ${gName(pieces[0])}.`
  const w = worstGear(pieces)
  const S = w && gState(w)
  return `Logged ${min} min on ${pieces.length} pieces of gear.` + (w ? ` ${gName(w)} at ${fmtH(gHours(w))} h${S!.tone ? ' · ' + S!.label : ''}.` : '')
}

// a typed number, or '' as production stores an empty one
export const num = (s: string) => (isNaN(parseFloat(s)) ? '' : parseFloat(s))

// a new piece of gear, as Add saves it: only what its type needs
export function newGear(type: string, setup: string, f: { name: string; installed: string; start: string; lo: string; hi: string }) {
  const T = GEAR_TYPES[type]
  return {
    type, name: f.name.trim(), setup, status: 'active', tracks: T.tracks,
    ratedLow: T.ratedHigh ? num(f.lo) : '', ratedHigh: T.ratedHigh ? num(f.hi) : '',
    installed: f.installed || today(), startHours: T.tracks ? num(f.start) || 0 : 0, minutes: 0, plays: [], notes: [], added: Date.now(),
  }
}
// Replace with a new one: this one retires with a note, and a fresh one starts at 0 h today with its name, rating and notes
export function replaced(g: Gear, day = today()) {
  const h = fmtH(gHours(g))
  return {
    old: { status: 'retired', retired: day, notes: [...(g.notes || []), { d: day, t: `Retired at ${h} h. Replaced with a new one.` }] },
    fresh: {
      type: g.type, name: g.name, setup: g.setup, status: 'active', tracks: g.tracks, ratedLow: g.ratedLow, ratedHigh: g.ratedHigh, specs: g.specs || '',
      installed: day, startHours: 0, minutes: 0, plays: [], notes: [{ d: day, t: 'Installed as a replacement.' }], added: Date.now(),
    },
  }
}
