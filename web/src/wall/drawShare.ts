// The share picture, drawn on a canvas as production's drawShare (app/vinyl-wall.html): the wall's photo (washed as on the
// wall), title, counts, then the sleeves shown hanging in the wall's style with their tags, in wall order. Covers come from
// the wall's stored images; a record without one, or one that won't load, gets the generated sleeve. Pattern
// backgrounds are drawn as wall.css draws them. Nothing private goes in: hangTag leaves the budget off, and there
// are no prices, orders or notes. Colours are the theme's tokens, read off the page.
import { countsLine, SHARE_MAX } from '../model/share'
import { hangTag } from '../model/copyOrders'
import { coverUrl, faceColors, hueOf, type Rec, type Tag } from '../model/record'
import type { Site } from '../model/site'
import { corkNoise, feltNoise } from './grain'

const W = 1080
const COLS = 5
// drawn at twice its size, so it stays sharp on a phone's screen; a JPEG keeps the photo background a sensible size
const SCALE = 2

type RGBA = [number, number, number, number]
// a token as the colour it resolves to (tokens may be color-mix(), which not every canvas reads)
function readTokens<K extends string>(names: readonly K[]): Record<K, RGBA> {
  const probe = document.createElement('i')
  document.body.append(probe)
  const c = document.createElement('canvas')
  c.width = c.height = 1
  const x = c.getContext('2d', { willReadFrequently: true })!
  const out = {} as Record<K, RGBA>
  for (const n of names) {
    probe.style.color = `var(--${n})`
    x.clearRect(0, 0, 1, 1)
    x.fillStyle = getComputedStyle(probe).color
    x.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = x.getImageData(0, 0, 1, 1).data
    out[n] = [r, g, b, a / 255]
  }
  probe.remove()
  return out
}
const css = ([r, g, b, a]: RGBA, alpha = 1) => `rgba(${r},${g},${b},${a * alpha})`
// one colour mixed toward another (t=0 keeps it)
const mix = (p: RGBA, q: RGBA, t: number): RGBA => p.map((v, i) => (i < 3 ? Math.round(v + (q[i] - v) * t) : v + (q[i] - v) * t)) as RGBA

const TOKENS = [
  'wall', 'wall-2', 'line', 'rail', 'ink', 'ink-2', 'shade', 'gleam', 'cover-ink', 'accent', 'accent-ink', 'want', 'want-ink', 'someday', 'someday-ink', 'paper',
  'paper-ink', 'plank', 'plank-2', 'plank-3', 'nail', 'rust', 'peg-rail', 'peg-rail-2', 'peg-rail-3', 'peg-rail-4', 'peg', 'peg-2', 'peg-3',
  'yarn', 'yarn-2', 'iron', 'iron-hi', 'iron-mid', 'bracket', 'bracket-2', 'cork', 'pin-1', 'pin-2', 'pin-3', 'pin-4', 'pin-5', 'shadow-tone',
] as const
type C = Record<(typeof TOKENS)[number], RGBA>
const TAG_TONE: Record<Tag['tone'], [keyof C, keyof C]> = {
  ship: ['accent', 'accent-ink'],
  want: ['want', 'want-ink'],
  someday: ['someday', 'someday-ink'],
  paper: ['paper', 'paper-ink'],
}
const F = {
  title: '800 84px "Big Shoulders Display"',
  gen: '800 22px "Big Shoulders Display"',
  cap: '600 20px "Instrument Sans"',
  by: '400 17px "Instrument Sans"',
  meta: '500 14px "IBM Plex Mono"',
  mono: '500 20px "IBM Plex Mono"',
  small: '500 13px "IBM Plex Mono"',
}

// an image, or null if it won't load within 10 seconds (one stuck request mustn't hold up the picture)
const loadImg = (src: string) =>
  new Promise<HTMLImageElement | null>((res) => {
    const i = new Image()
    const t = setTimeout(() => {
      i.src = ''
      res(null)
    }, 10000)
    i.onload = () => (clearTimeout(t), res(i))
    i.onerror = () => (clearTimeout(t), res(null))
    i.src = src
  })
// how far down the photo the wall shows (its background-position's second part), 0-1
function photoY(pos = '') {
  const [a, b] = pos.trim().split(/\s+/)
  const v = b || (a === 'top' || a === 'bottom' ? a : 'center')
  const k: Record<string, number> = { top: 0, center: 0.5, bottom: 1 }
  return v in k ? k[v] : Number.isFinite(parseFloat(v)) ? parseFloat(v) / 100 : 0.5
}
function fitText(ctx: CanvasRenderingContext2D, t: string, w: number) {
  if (ctx.measureText(t).width <= w) return t
  while (t && ctx.measureText(t + '…').width > w) t = t.slice(0, -1)
  return t.trimEnd() + '…'
}
function wrapText(ctx: CanvasRenderingContext2D, t: string, w: number, max: number) {
  const out: string[] = []
  let line = ''
  for (const wd of t.split(/\s+/)) {
    const next = line ? line + ' ' + wd : wd
    if (!line || ctx.measureText(next).width <= w) line = next
    else {
      out.push(line)
      line = wd
    }
  }
  if (line) out.push(line)
  if (out.length > max) {
    out.length = max
    out[max - 1] += '…'
  }
  return out.map((l) => fitText(ctx, l, w))
}

// fills a rectangle with a tile made at the picture's scale, laid at its own size
function fillTile(ctx: CanvasRenderingContext2D, tile: HTMLCanvasElement, x: number, y: number, w: number, h: number) {
  const p = ctx.createPattern(tile, 'repeat')!
  p.setTransform(new DOMMatrix().translate(x, y).scale(1 / SCALE))
  ctx.fillStyle = p
  ctx.fillRect(x, y, w, h)
}

// A pattern background as wall.css draws it (.bg-<preset>), over the whole picture
function drawPattern(ctx: CanvasRenderingContext2D, c: C, preset: string, w: number, h: number) {
  const band = (period: number, stripes: [number, number, RGBA][]) => {
    for (let x = 0; x < w; x += period)
      for (const [at, wd, col] of stripes) {
        ctx.fillStyle = css(col)
        ctx.fillRect(x + at, 0, wd, h)
      }
  }
  ctx.fillStyle = css(preset === 'grille' ? mix(c['wall-2'], c.wall, 0.4) : c.wall)
  ctx.fillRect(0, 0, w, h)
  if (preset === 'grooves') {
    // rings around a point off the top right corner
    const [cx, cy] = [w * 1.12, -h * 0.12]
    ctx.strokeStyle = css(mix(c['wall-2'], c.line, 0.2))
    ctx.lineWidth = 1
    for (let r = 3.5; r < Math.hypot(cx, h - cy); r += 4) {
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
    }
  } else if (preset === 'walnut') {
    const rail = (t: number) => mix(c.wall, c.rail, t)
    band(15, [[0, 4, rail(0.22)], [4, 2, rail(0.32)], [6, 7, rail(0.18)], [13, 2, rail(0.27)]])
    band(180, [[178, 2, rail(0.45)]])
  } else if (preset === 'spines') {
    band(47, [[11, 2, c['wall-2']], [29, 1, mix(c.line, c.wall, 0.3)], [41, 6, c['wall-2']]])
  } else if (preset === 'foam') {
    // a soft dimple in every 34px square
    for (let y = 0; y < h; y += 34)
      for (let x = 0; x < w; x += 34) {
        const g = ctx.createRadialGradient(x + 17, y + 17, 0, x + 17, y + 17, 24)
        g.addColorStop(0.28, css(c.wall))
        g.addColorStop(0.72, css(mix(c['wall-2'], c.line, 0.3)))
        ctx.fillStyle = g
        ctx.fillRect(x, y, 34, 34)
      }
  } else if (preset === 'sunburst') {
    // 4° rays from a point above the top edge, every 8°
    const [cx, cy, r] = [w / 2, -h * 0.2, Math.hypot(w, h * 1.2)]
    ctx.fillStyle = css(c['wall-2'])
    for (let a = 4; a < 360; a += 8) {
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, r, ((a - 90) * Math.PI) / 180, ((a - 86) * Math.PI) / 180)
      ctx.fill()
    }
  } else if (preset === 'grille') {
    // a 9px tile with a dot in the middle and one at its corners, made at the picture's scale
    const t = document.createElement('canvas')
    t.width = t.height = 9 * SCALE
    const tx = t.getContext('2d')!
    tx.scale(SCALE, SCALE)
    tx.fillStyle = css(c.ink, 0.16)
    for (const [dx, dy] of [[4.5, 4.5], [0, 0], [9, 0], [0, 9], [9, 9]]) {
      tx.beginPath()
      tx.arc(dx, dy, 1.75, 0, Math.PI * 2)
      tx.fill()
    }
    fillTile(ctx, t, 0, 0, w, h)
  } else if (preset === 'felt') {
    fillTile(ctx, feltNoise(SCALE), 0, 0, w, h)
  }
}

// a slot's strip of cork board, with its grain (wall.css cork .slot::before)
function drawCork(ctx: CanvasRenderingContext2D, c: C, x: number, y: number, w: number) {
  const h = 19
  ctx.save()
  ctx.shadowColor = css(c['shadow-tone'])
  ctx.shadowBlur = 5
  ctx.shadowOffsetY = 2
  ctx.fillStyle = css(c.cork)
  ctx.fillRect(x, y, w, h)
  ctx.restore()
  fillTile(ctx, corkNoise(SCALE), x, y, w, h)
  const g = ctx.createLinearGradient(0, y, 0, y + h)
  g.addColorStop(0, css(c.gleam, 0.12))
  g.addColorStop(1, css(c.shade, 0.14))
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = css(c.gleam, 0.18)
  ctx.fillRect(x, y, w, 1)
  ctx.fillStyle = css(c.shade, 0.3)
  ctx.fillRect(x, y + h - 1, w, 1)
}

// a shadow in the theme's shade, at an opacity
function shadow(ctx: CanvasRenderingContext2D, c: C, a: number, blur: number, y: number, x = 0) {
  ctx.shadowColor = css(c.shade, a)
  ctx.shadowBlur = blur
  ctx.shadowOffsetX = x
  ctx.shadowOffsetY = y
}

// the tag the sleeve wears on the wall, leaning as there
function drawTag(ctx: CanvasRenderingContext2D, tag: Tag, right: number, bottom: number, maxW: number, c: C) {
  const [bg, fg] = TAG_TONE[tag.tone]
  const text = tag.text.toUpperCase()
  ctx.save()
  ctx.font = F.small
  if ('letterSpacing' in ctx) ctx.letterSpacing = '1px'
  const h = 24
  const w = Math.min(maxW, ctx.measureText(text).width + 24)
  ctx.translate(right - w / 2, bottom - h / 2)
  ctx.rotate((6 * Math.PI) / 180)
  ctx.save()
  shadow(ctx, c, 0.28, 6, 3)
  ctx.beginPath()
  ctx.moveTo(-w / 2 + 8, -h / 2)
  ctx.lineTo(w / 2, -h / 2)
  ctx.lineTo(w / 2, h / 2)
  ctx.lineTo(-w / 2 + 8, h / 2)
  ctx.lineTo(-w / 2, 0)
  ctx.closePath()
  ctx.fillStyle = css(c[bg])
  ctx.fill()
  ctx.restore()
  ctx.fillStyle = css(c.wall)
  ctx.beginPath()
  ctx.arc(-w / 2 + 8, 0, 2.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = css(c[fg])
  ctx.textBaseline = 'middle'
  ctx.fillText(fitText(ctx, text, w - 24), -w / 2 + 15, 1)
  ctx.restore()
}

// A slot's plank as the wall draws it (wall.css .slot::before): Barnwood's weathered board with a nail at each end, a
// knot and a crack placed by the slot's place (nth-child counts from 1), or Pegs' Shaker rail. Each slot has its own, so
// the seams between them show as on the wall.
function drawPlank(ctx: CanvasRenderingContext2D, c: C, x: number, y: number, w: number, n: number, barn: boolean) {
  const h = barn ? 21 : 16
  const i = n + 1
  const g = ctx.createLinearGradient(0, y, 0, y + h)
  const stops: [number, keyof C][] = barn
    ? [[0, 'plank'], [0.48, 'plank-2'], [1, 'plank-3']]
    : [[0, 'peg-rail'], [0.45, 'peg-rail-2'], [0.88, 'peg-rail-3'], [1, 'peg-rail-4']]
  for (const [o, k] of stops) g.addColorStop(o, css(c[k]))
  ctx.save()
  ctx.shadowColor = css(c['shadow-tone'])
  ctx.shadowBlur = 9
  ctx.shadowOffsetY = 5
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)
  ctx.restore()
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  // the grain: a repeat of light and dark boards across ([x, width, opacity] in each), fine lines down
  const grain = barn
    ? { period: 109, light: [0, 31, 0.035], dark: [[31, 6, 0.09], [73, 3, 0.05]] }
    : { period: 97, light: [0, 23, 0.035], dark: [[23, 2, 0.14], [61, 2, 0.08]] }
  for (let gx = x; gx < x + w; gx += grain.period) {
    ctx.fillStyle = css(c.gleam, grain.light[2])
    ctx.fillRect(gx, y, grain.light[1], h)
    for (const [at, wd, a] of grain.dark) {
      ctx.fillStyle = css(c.shade, a)
      ctx.fillRect(gx + at, y, wd, h)
    }
  }
  for (let gy = y; gy < y + h; gy += 6) {
    ctx.fillStyle = css(c.shade, barn ? 0.16 : 0.2)
    ctx.fillRect(x, gy, w, 1)
    ctx.fillStyle = css(c.gleam, 0.04)
    ctx.fillRect(x, gy + 3, w, 1)
  }
  if (barn) {
    const knot = i % 3 === 2 ? 0.28 : i % 3 === 0 ? 0.81 : 0.64
    const [crack, crackW] = i % 4 === 0 ? [0, 0] : i % 3 === 2 ? [0.58, 0.3] : i % 3 === 0 ? [0.08, 0.24] : [0.22, 0.38]
    // a crack along the board
    ctx.fillStyle = css(c.shade, 0.45)
    ctx.fillRect(x + crack * w, y + h * 0.34, crackW * w, h * 0.05)
    // a knot
    ctx.save()
    ctx.translate(x + knot * w, y + h * 0.58)
    ctx.scale(13 / 4, 1)
    const kg = ctx.createRadialGradient(0, 0, 0, 0, 0, 4)
    kg.addColorStop(0, css(c.nail, 0.7))
    kg.addColorStop(0.6, css(c.nail, 0.25))
    kg.addColorStop(0.75, css(c.nail, 0))
    ctx.fillStyle = kg
    ctx.fillRect(-4, -4, 8, 8)
    ctx.restore()
    // a nail at each end, with its rust stain
    for (const [nx, ny] of [[x + 12, y + h * 0.52], [x + w - 12, y + h * 0.48]]) {
      const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, 6)
      ng.addColorStop(0, css(c.nail))
      ng.addColorStop(1.8 / 6, css(c.nail))
      ng.addColorStop(2.4 / 6, css(c.rust, 0.55))
      ng.addColorStop(4.5 / 6, css(c.rust, 0.18))
      ng.addColorStop(1, css(c.rust, 0))
      ctx.fillStyle = ng
      ctx.fillRect(nx - 6, ny - 6, 12, 12)
    }
  } else {
    // the peg rail's lit top edge
    ctx.fillStyle = css(c.gleam, 0.12)
    ctx.fillRect(x, y, w, 1)
  }
  // the board's lower edge
  ctx.fillStyle = css(c.shade, barn ? 0.4 : 0.45)
  ctx.fillRect(x, y + h - 2, w, 2)
  ctx.restore()
}

// Barnwood's iron ring on its bracket, centred on cx with the ring's top at y (wall.css .hook)
function drawRing(ctx: CanvasRenderingContext2D, c: C, cx: number, y: number) {
  const cy = y + 13
  // the bracket, screwed into the plank, with its rivet
  const bg = ctx.createLinearGradient(0, y - 10, 0, y)
  bg.addColorStop(0, css(c.bracket))
  bg.addColorStop(1, css(c['bracket-2']))
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.roundRect(cx - 6, y - 10, 12, 10, 2)
  ctx.fill()
  ctx.fillStyle = css(c['iron-hi'])
  ctx.beginPath()
  ctx.arc(cx, y - 5, 1.2, 0, Math.PI * 2)
  ctx.fill()
  // the ring: lit from the top left, with its thin outline in the ink colour
  ctx.save()
  ctx.shadowColor = css(c['shadow-tone'])
  ctx.shadowBlur = 2
  ctx.shadowOffsetY = 2
  ctx.lineWidth = 4
  ctx.strokeStyle = css(c.iron)
  ctx.beginPath()
  ctx.arc(cx, cy, 11, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
  ctx.lineWidth = 4
  for (const [from, to, k] of [[0.75, 1.25, 'iron-mid'], [1.25, 1.75, 'iron-hi']] as const) {
    ctx.strokeStyle = css(c[k])
    ctx.beginPath()
    ctx.arc(cx, cy, 11, from * Math.PI, to * Math.PI)
    ctx.stroke()
  }
  ctx.lineWidth = 1
  ctx.strokeStyle = css(c.ink)
  ctx.beginPath()
  ctx.arc(cx, cy, 13.5, 0, Math.PI * 2)
  ctx.stroke()
}

// Pegs: the loop of twisted yarn from the sleeve's corners up to a turned peg (wall.css .hanger::before/::after, .hook)
function drawPeg(ctx: CanvasRenderingContext2D, c: C, x: number, sw: number, top: number) {
  const px = x + sw / 2
  const py = top - 20
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const loop = () => {
    ctx.beginPath()
    ctx.moveTo(x + sw * 0.1, top + 2)
    ctx.lineTo(px, top - 19)
    ctx.lineTo(x + sw * 0.9, top + 2)
    ctx.stroke()
  }
  ctx.strokeStyle = css(c.yarn)
  ctx.lineWidth = 3.4
  loop()
  ctx.strokeStyle = css(c['yarn-2'])
  ctx.lineWidth = 1.4
  ctx.lineCap = 'butt'
  ctx.setLineDash([2.2, 2.6])
  loop()
  ctx.restore()
  const pg = ctx.createRadialGradient(px - 2.2, py - 2.9, 0, px - 2.2, py - 2.9, 15)
  pg.addColorStop(0, css(c.peg))
  pg.addColorStop(0.08, css(c.peg))
  pg.addColorStop(0.3, css(c['peg-2']))
  pg.addColorStop(0.62, css(c['peg-3']))
  pg.addColorStop(1, css(c['peg-rail-4']))
  ctx.save()
  shadow(ctx, c, 0.5, 4, 3)
  ctx.fillStyle = pg
  ctx.beginPath()
  ctx.arc(px, py, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = css(c.shade, 0.35)
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(px, py, 7.25, 0, Math.PI * 2)
  ctx.stroke()
}

// the cork pins as on the wall: lean and colour by the sleeve's place, from 0 (wall.css's nth-child pattern, which counts from 1)
function pinFor(n: number, c: C) {
  let [tx, la, ll] = [[-8, -58, 5], [5, 52, 5], [-2, -80, 6]][n % 3]
  if (n % 4 === 3) [tx, la] = [10, 70]
  if (n % 7 === 2) [la, ll] = [100, 4]
  return { tx, la: (la * Math.PI) / 180, ll, pin: c[(['pin-1', 'pin-2', 'pin-3', 'pin-4', 'pin-5'] as const)[n % 5]] }
}
function drawPin(ctx: CanvasRenderingContext2D, cx: number, cy: number, P: ReturnType<typeof pinFor>, c: C) {
  const dx = Math.sin(P.la) * P.ll
  const dy = -Math.cos(P.la) * P.ll
  const disc = (x: number, y: number, r: number, hi: number) => {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, 0, x, y, r)
    g.addColorStop(0, css(mix(P.pin, c.gleam, hi)))
    g.addColorStop(0.5, css(P.pin))
    g.addColorStop(1, css(mix(P.pin, c.shade, 0.4)))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.save()
  shadow(ctx, c, 0.45, 2, 2, 1)
  disc(cx, cy, 6.5, 0.3)
  ctx.restore()
  ctx.save()
  ctx.strokeStyle = css(mix(P.pin, c.shade, 0.25))
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + dx, cy + dy)
  ctx.stroke()
  ctx.restore()
  ctx.save()
  shadow(ctx, c, 0.35, 4, 4, 2)
  disc(cx + dx, cy + dy, 5.5, 0.6)
  ctx.restore()
}

export type Drawn = { blob: Blob; missedCovers: number; missedPhoto: boolean }

// a browser that won't let the canvas be saved with covers and the photo in it gets the picture without them
export const drawShare = (list: Rec[], site: Site): Promise<Drawn> =>
  paint(list, site, true).catch((e) => (e?.name === 'SecurityError' ? paint(list, site, false) : Promise.reject(e)))

async function paint(list: Rec[], site: Site, withImages: boolean): Promise<Drawn> {
  const c: C = readTokens(TOKENS)
  await Promise.all(Object.values(F).map((f) => document.fonts.load(f).catch(() => {})))
  const pad = 60
  const gap = 24
  const sw = (W - 2 * pad - (COLS - 1) * gap) / COLS
  const shown = list.slice(0, SHARE_MAX)
  // each sleeve's caption as on the wall: the title (up to 2 lines), the artist, then year · label; a row is as tall as its tallest caption
  const m = document.createElement('canvas').getContext('2d')!
  const caps = shown.map((r) => {
    m.font = F.cap
    const title = wrapText(m, r.title || 'Untitled', sw, 2)
    m.font = F.by
    const artist = fitText(m, r.artist || '', sw)
    m.font = F.meta
    const meta = fitText(m, [r.year, r.label].filter(Boolean).join(' · '), sw)
    return { title, artist, meta, h: title.length * 24 + 4 + 22 + (meta ? 4 + 18 : 0) }
  })
  const rowHs = Array.from({ length: Math.ceil(shown.length / COLS) }, (_, k) => 36 + sw + 12 + Math.max(...caps.slice(k * COLS, k * COLS + COLS).map((x) => x.h)) + 24)
  const H = pad + 100 + 76 + rowHs.reduce((a, b) => a + b, 0) + (list.length > SHARE_MAX ? 40 : 0) + pad
  const bg = site.background
  const ph = bg.kind === 'photo' ? bg : null
  // the photo's wash as the wall lays it in this theme (theme.css --wash-light)
  const light = getComputedStyle(document.documentElement).getPropertyValue('--wash-light').trim() === '1'
  const hang = site.hang
  const [photo, ...loaded] = withImages
    ? await Promise.all([ph && loadImg(ph.url), ...shown.filter(coverUrl).map(async (r) => [r.id, await loadImg(coverUrl(r))] as const)])
    : [null]
  const covers = new Map(loaded as [string, HTMLImageElement | null][])
  const missedCovers = shown.filter(coverUrl).length - [...covers.values()].filter(Boolean).length

  const cv = document.createElement('canvas')
  cv.width = W * SCALE
  cv.height = Math.ceil(H) * SCALE
  const ctx = cv.getContext('2d')!
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = 'top'
  if (bg.kind === 'pattern') drawPattern(ctx, c, bg.preset, W, H)
  else {
    ctx.fillStyle = css(c.wall)
    ctx.fillRect(0, 0, W, H)
  }
  if (photo && ph) {
    const k = Math.max(W / photo.width, H / photo.height)
    const w = photo.width * k
    const h = photo.height * k
    ctx.drawImage(photo, (W - w) / 2, (H - h) * photoY(ph.pos), w, h)
    ctx.fillStyle = css(c.wall, (light ? ph.light : ph.dim) / 100)
    ctx.fillRect(0, 0, W, H)
  }
  // over a photo, text gets the halo in the wall colour and the darker secondary ink it has on the page
  const ink2 = photo ? mix(c['ink-2'], c.ink, 0.45) : c['ink-2']
  const glow = (on: boolean) => {
    ctx.shadowColor = on && photo ? css(c.wall) : 'transparent'
    ctx.shadowBlur = on && photo ? 10 : 0
    ctx.shadowOffsetY = 0
  }
  let y = pad
  glow(true)
  ctx.fillStyle = css(c.ink)
  ctx.font = F.title
  ctx.fillText(fitText(ctx, site.title.toUpperCase(), W - 2 * pad), pad, y)
  y += 100
  ctx.fillStyle = css(ink2)
  ctx.font = F.mono
  ctx.fillText(countsLine(list), pad, y)
  y += 76
  glow(false)

  for (let i = 0; i < shown.length; i += COLS) {
    const row = shown.slice(i, i + COLS)
    // the row's rail in the wall's hanging style, a length per sleeve as on the wall (Floating has none)
    row.forEach((_, j) => {
      const sx = pad - gap / 2 + j * (sw + gap)
      if (hang === 'barn' || hang === 'peg') drawPlank(ctx, c, sx, y + (hang === 'barn' ? 9 : 8), sw + gap, i + j, hang === 'barn')
      else if (hang === 'cork') drawCork(ctx, c, sx, y + 23, sw + gap)
    })
    row.forEach((r, j) => {
      const x = pad + j * (sw + gap)
      const top = y + 36
      const im = covers.get(r.id)
      // each sleeve sways a little on what holds it, as on the wall (.hanger): left on odd places, right on even
      const P = hang === 'cork' ? pinFor(i + j, c) : null
      // 1-based places, as nth-child counts
      const oddPlace = (i + j) % 2 === 0
      const sway = P ? (oddPlace ? -1.6 : 1.3) : hang === 'float' ? 0 : oddPlace ? -1.1 : 0.9
      const [ox, oy] = P ? [x + sw / 2 + P.tx, top - 6] : [x + sw / 2, top - (hang === 'peg' ? 20 : 18)]
      ctx.save()
      ctx.translate(ox, oy)
      ctx.rotate((sway * Math.PI) / 180)
      ctx.translate(-ox, -oy)
      ctx.save()
      if (hang === 'float') {
        shadow(ctx, c, 0.6, 34, 22)
      } else {
        shadow(ctx, c, 0.28, 18, 8)
      }
      if (im) {
        const k = Math.min(im.width, im.height)
        ctx.drawImage(im, (im.width - k) / 2, (im.height - k) / 2, k, k, x, top, sw, sw)
      } else {
        const [from, to] = faceColors(hueOf(r))
        const gr = ctx.createLinearGradient(x, top, x + sw, top + sw)
        gr.addColorStop(0, from)
        gr.addColorStop(1, to)
        ctx.fillStyle = gr
        ctx.fillRect(x, top, sw, sw)
      }
      ctx.restore()
      if (!im) {
        ctx.fillStyle = css(c['cover-ink'])
        ctx.font = F.gen
        wrapText(ctx, (r.title || 'Untitled').toUpperCase(), sw - 24, 4).forEach((l, n) => ctx.fillText(l, x + 12, top + 12 + n * 22))
        ctx.globalAlpha = 0.85
        ctx.font = F.small
        ctx.fillText(fitText(ctx, r.artist || '', sw - 24), x + 12, top + sw - 26)
        ctx.globalAlpha = 1
      }
      // what holds the sleeve: an iron ring, a peg with a loop of yarn, or a push pin on the cork
      if (hang === 'barn') drawRing(ctx, c, x + sw / 2, top - 14)
      else if (hang === 'peg') drawPeg(ctx, c, x, sw, top)
      else if (P) drawPin(ctx, x + sw / 2 + P.tx, top - 6.5, P, c)
      const tag = hangTag(r)
      if (tag) drawTag(ctx, tag, x + sw + 4, top + sw * 0.82, sw + 4, c)
      const cap = caps[i + j]
      let cy = top + sw + 12
      glow(true)
      ctx.fillStyle = css(c.ink)
      ctx.font = F.cap
      for (const l of cap.title) {
        ctx.fillText(l, x, cy)
        cy += 24
      }
      ctx.fillStyle = css(ink2)
      ctx.font = F.by
      ctx.fillText(cap.artist, x, cy + 4)
      ctx.font = F.meta
      if (cap.meta) ctx.fillText(cap.meta, x, cy + 4 + 22 + 4)
      glow(false)
      ctx.restore()
    })
    y += rowHs[i / COLS]
  }
  if (list.length > SHARE_MAX) {
    glow(true)
    ctx.fillStyle = css(ink2)
    ctx.font = F.mono
    ctx.fillText(`+ ${list.length - SHARE_MAX} more`, pad, y)
    glow(false)
  }
  const blob = await new Promise<Blob>((res, rej) => {
    try {
      cv.toBlob((b) => (b ? res(b) : rej(new Error('empty'))), 'image/jpeg', 0.92)
    } catch (e) {
      rej(e)
    }
  })
  return { blob, missedCovers, missedPhoto: !!ph && !photo }
}
