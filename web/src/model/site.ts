// The wall's settings doc (settings/site) as what the wall draws, with production's defaults and checks
// (applySettings in app/vinyl-wall.html). Read-only in the prototype until there's a Settings sheet.

export const DEFAULT_TITLE = 'My Vinyl Wall'
const PHOTOS: Record<string, { file: string; pos?: string }> = {
  listening: { file: 'listening-room.jpg' },
  crates: { file: 'crate-digging.jpg', pos: 'center 60%' },
  shop: { file: 'record-shop.jpg' },
  cafe: { file: 'coffee-shop.jpg' },
  tavern: { file: 'coffee-shop-2.jpg' },
}
// production's pattern presets; in this prototype "grille" is appica's dots pattern and the others are a plain wall
const PATTERNS = ['grille', 'grooves', 'walnut', 'foam', 'sunburst', 'spines', 'felt', 'plain']
const HANGS = ['barn', 'peg', 'cork', 'float']

export type Background = { kind: 'photo'; url: string; pos?: string; dim: number } | { kind: 'pattern'; preset: string }
export type Site = { title: string; background: Background; hang: string }

const okAsset = (id: unknown) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id)
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
  if (bg.kind === 'photo' && okAsset(bg.assetId)) background = { kind: 'photo', url: '/_blob/' + bg.assetId, dim: dim ?? 70 }
  else {
    const preset = String(bg.preset)
    const photo = PHOTOS[preset] ?? (PATTERNS.includes(preset) ? null : PHOTOS.listening)
    background = photo
      ? { kind: 'photo', url: 'backgrounds/' + photo.file, pos: photo.pos, dim: stockDim(dim ?? 50) }
      : { kind: 'pattern', preset }
  }
  return { title, background, hang: HANGS.includes(String(s.hang)) ? String(s.hang) : 'barn' }
}
