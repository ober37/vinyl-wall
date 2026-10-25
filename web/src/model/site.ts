// The wall's settings doc (settings/site) as what the wall draws, with production's defaults and checks
// (applySettings in app/vinyl-wall.html), and the choices Settings offers.

export const DEFAULT_TITLE = 'My Vinyl Wall'
const PHOTOS: Record<string, { file: string; pos?: string }> = {
  listening: { file: 'listening-room.jpg' },
  crates: { file: 'crate-digging.jpg', pos: 'center 60%' },
  shop: { file: 'record-shop.jpg' },
  cafe: { file: 'coffee-shop.jpg' },
  tavern: { file: 'coffee-shop-2.jpg' },
}
// Settings' background choices in production's order: the photos, then the patterns (drawn by .bg-<key> in wall.css)
export const BACKGROUNDS: [string, string][] = [
  ['listening', 'Listening room'],
  ['crates', 'Crate digging'],
  ['shop', 'Record shop'],
  ['cafe', 'Coffee shop'],
  ['tavern', 'Cozy tavern'],
  ['grille', 'Speaker grille'],
  ['grooves', 'Grooves'],
  ['walnut', 'Walnut paneling'],
  ['foam', 'Studio foam'],
  ['sunburst', 'Sunburst'],
  ['spines', 'Crate dig'],
  ['felt', 'Felt slipmat'],
  ['plain', 'Plain wall'],
]
export const HANGS: [string, string][] = [
  ['barn', 'Barnwood'],
  ['peg', 'Pegs'],
  ['cork', 'Cork'],
  ['float', 'Floating'],
]

export type Background = { kind: 'photo'; url: string; pos?: string; dim: number } | { kind: 'pattern'; preset: string }
export const isStockPhoto = (key: string) => !!PHOTOS[key]
export type Site = { title: string; background: Background; hang: string }

// the wash a photo starts at: an uploaded photo's slider is the wash itself, a stock photo's runs 0-100 (stockDim)
export const DEFAULT_DIM = { upload: 70, stock: 50 }
// a known preset, or the default
export const presetOf = (bg: Record<string, unknown>) => (BACKGROUNDS.some(([k]) => k === bg.preset) ? String(bg.preset) : 'listening')
export const okAsset = (id: unknown) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id)
// a stock photo's slider (0-100) lays the wall-coloured wash at 70-95%: 0, 50 and 100 give 70, 83 and 95
export const stockDim = (v: number) => {
  const t = 40 + v * 0.6
  return Math.round((t <= 50 ? 50 + t / 2 : 75 + (t - 50) * 0.4) * 10) / 10
}

export function siteOf(doc: Record<string, unknown> | null | undefined): Site {
  const s = doc || {}
  const title = String(s.title || '').trim() || DEFAULT_TITLE
  const bg = (s.bg && typeof s.bg === 'object' ? s.bg : { kind: 'preset', preset: 'listening' }) as Record<string, unknown>
  const dim = typeof s.dim === 'number' ? s.dim : undefined
  let background: Background
  if (bg.kind === 'photo' && okAsset(bg.assetId)) background = { kind: 'photo', url: '/_blob/' + bg.assetId, dim: dim ?? DEFAULT_DIM.upload }
  else {
    const preset = presetOf(bg)
    const photo = PHOTOS[preset]
    background = photo
      ? { kind: 'photo', url: 'backgrounds/' + photo.file, pos: photo.pos, dim: stockDim(dim ?? DEFAULT_DIM.stock) }
      : { kind: 'pattern', preset }
  }
  return { title, background, hang: HANGS.some(([k]) => k === s.hang) ? String(s.hang) : 'barn' }
}
