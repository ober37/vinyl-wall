// The grain on the cork board and the felt background, made once from seeded noise. The wall lays it on through CSS
// (--cork-grain and --felt-grain in wall.css) and the share picture draws the same tiles, so the two match. Made here
// rather than as SVG noise: Safari won't let a canvas be saved once an SVG has been drawn on it.

// Three octaves (1, 2 and 4px clumps), the same speckle every time; each pixel is the colour at an opacity worked out
// from the noise. Made at a scale (the screen's pixel ratio, or the picture's) so it stays crisp when shown at w x h
function noiseTile(w: number, h: number, rgb: [number, number, number], alpha: (n: number) => number, scale: number) {
  const cv = document.createElement('canvas')
  ;[w, h] = [w * scale, h * scale]
  cv.width = w
  cv.height = h
  const x = cv.getContext('2d')!
  const img = x.createImageData(w, h)
  const d = img.data
  let q = 7
  const rnd = () => (q = (q * 16807) % 2147483647) / 2147483647
  const octave = (cell: number) => {
    const cols = Math.ceil(w / cell)
    const v = Array.from({ length: cols * Math.ceil(h / cell) }, rnd)
    return (px: number, py: number) => v[Math.floor(py / cell) * cols + Math.floor(px / cell)]
  }
  const [o1, o2, o4] = [octave(scale), octave(2 * scale), octave(4 * scale)]
  for (let py = 0, k = 0; py < h; py++)
    for (let px = 0; px < w; px++, k += 4) {
      const n = 0.5 + 0.7 * (0.5 * o1(px, py) + 0.3 * o2(px, py) + 0.2 * o4(px, py) - 0.5)
      d[k] = rgb[0]
      d[k + 1] = rgb[1]
      d[k + 2] = rgb[2]
      d[k + 3] = Math.round(255 * Math.min(1, Math.max(0, alpha(n))))
    }
  x.putImageData(img, 0, 0)
  return cv
}
// each tile is made once per scale
const once = (make: (scale: number) => HTMLCanvasElement) => {
  const made = new Map<number, HTMLCanvasElement>()
  return (scale: number) => made.get(scale) ?? made.set(scale, make(scale)).get(scale)!
}
// cork: dark flecks on a 160 x 60 tile; felt: a faint grey speckle on 180 x 180
export const corkNoise = once((s) => noiseTile(160, 60, [0, 0, 0], (n) => 2.2 * n - 0.75, s))
export const feltNoise = once((s) => noiseTile(180, 180, [115, 115, 115], (n) => 0.38 * n, s))

// hands the tiles to wall.css; where a canvas can't be made, the cork and felt show their plain colour
export function setGrain() {
  try {
    const root = document.documentElement.style
    const s = Math.min(3, Math.max(1, Math.round(devicePixelRatio || 1)))
    root.setProperty('--cork-grain', `url(${corkNoise(s).toDataURL()})`)
    root.setProperty('--felt-grain', `url(${feltNoise(s).toDataURL()})`)
  } catch {
    // no canvas here (tests)
  }
}
