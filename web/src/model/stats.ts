// Listening stats and badges, as playStats, rankedPlays, leader and badgesHTML in app/vinyl-wall.html: counted from the
// play notes Log play writes ("Played … (~N min)"), owned records only.
import { isPlay, kindOf, today, type Note, type Rec } from './record'

export type Stats = { count: number; min: number; month: number; mmin: number; last: string }
export type Ranked = Stats & { r: Rec }

const MIN = /\(~(\d+) min\)/
// dates are read as text, since an imported file may hold anything
export function playStats(r: Rec, day = today()): Stats {
  const mo = day.slice(0, 7)
  const s: Stats = { count: 0, min: 0, month: 0, mmin: 0, last: '' }
  for (const n of Array.isArray(r.notes) ? (r.notes as Note[]) : []) {
    if (!n || typeof n !== 'object' || !isPlay(n)) continue
    const d = String(n.d ?? '')
    const t = +(MIN.exec(String(n.t))?.[1] ?? 0)
    s.count++
    s.min += t
    if (d.startsWith(mo)) {
      s.month++
      s.mmin += t
    }
    if (d > s.last) s.last = d
  }
  return s
}

// most played first: more plays, then more minutes, then the latest play
const byPlays = (n: 'count' | 'month', t: 'min' | 'mmin') => (a: Ranked, b: Ranked) => b[n] - a[n] || b[t] - a[t] || b.last.localeCompare(a.last)

// owned records with plays, ranked; kept until the records change (each snapshot is a new array) or the day turns
let cache: { recs: Rec[]; day: string; list: Ranked[] } | null = null
export function rankedPlays(records: Rec[], day = today()): Ranked[] {
  if (cache && cache.recs === records && cache.day === day) return cache.list
  const list = records
    .filter((r) => !r.deleted && kindOf(r) === 'own')
    .map((r) => ({ r, ...playStats(r, day) }))
    .filter((x) => x.count)
    .sort(byPlays('count', 'min'))
  cache = { recs: records, day, list }
  return list
}

// a ranking's leader earns its badge with at least 2 and more than anyone else; a tie earns nothing
function leader(L: Ranked[], n: 'count' | 'month') {
  return L[0] && L[0][n] >= 2 && !(L[1] && L[1][n] === L[0][n]) ? L[0].r.id : null
}

export type Metal = 'gold' | 'silver' | 'bronze' | 'hot'
export type Badge = { metal: Metal; icon: 'trophy' | 'flame' | 'disc'; name: string }
// what a record has earned: most played ever, top this month, and the highest hours mark reached
export function badgesOf(r: Rec, records: Rec[], day = today()): Badge[] {
  const P = rankedPlays(records, day)
  const S = P.find((x) => x.r.id === r.id)
  if (!S) return []
  const out: Badge[] = []
  if (leader(P, 'count') === r.id) out.push({ metal: 'gold', icon: 'trophy', name: 'Most played ever' })
  if (leader(P.filter((x) => x.month).sort(byPlays('month', 'mmin')), 'month') === r.id) out.push({ metal: 'hot', icon: 'flame', name: 'Top this month' })
  const h = S.min / 60
  const tier: [Metal, string] | null = h >= 100 ? ['gold', '100+'] : h >= 50 ? ['silver', '50+'] : h >= 10 ? ['bronze', '10+'] : null
  if (tier) out.push({ metal: tier[0], icon: 'disc', name: tier[1] + ' hours' })
  return out
}
