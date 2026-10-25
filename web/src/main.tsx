import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@appica/ui-react/providers/theme-provider'
import { App } from './App'
import { RuntimeProvider } from './runtime/runtime'
import { THEME_KEY } from './theme-key'
import { setGrain } from './wall/grain'
import './index.css'

// outside claude.ai, `npm run dev` runs on the fake runtime with sample records
async function runtime(): Promise<Window['claude'] | undefined> {
  const real = (window as Partial<Window>).claude
  if (real || !import.meta.env.DEV) return real
  const [{ fakeClaude }, { sample, sampleGear }] = await Promise.all([import('./runtime/fake'), import('./runtime/sample')])
  const q = new URLSearchParams(location.search)
  // ?gear adds sample equipment
  const seed: ReturnType<typeof sample> & { collections?: Record<string, Record<string, Record<string, unknown>>> } = {
    ...sample(),
    ...(q.has('gear') ? { collections: sampleGear() } : {}),
  }
  // ?empty starts with no records (the welcome card)
  if (q.has('empty')) seed.records = {}
  // ?about gives Kind of Blue its artist, recording dates and Discogs tracklist, and hangs Blue Train as an example
  if (q.has('about')) {
    Object.assign(seed.records.r1, { artistRef: 'mb-miles' })
    Object.assign(seed.records.r1.about as object, {
      recorded: 'Columbia 30th Street Studio, New York · March 2 and April 22, 1959',
      tracksSource: 'discogs',
      tracksUrl: 'https://www.discogs.com/release/7140383',
    })
    Object.assign(seed.records.r3, { example: true })
    seed.collections = {
      ...seed.collections,
      artists: {
        'mb-miles': {
          name: 'Miles Davis',
          summary: 'Miles Davis was an American jazz trumpeter, bandleader and composer, among the most influential figures in the music.\n\nHe led bands from bebop through cool jazz, modal jazz and fusion over five decades.',
          source: 'claude',
          wiki: 'https://en.wikipedia.org/wiki/Miles_Davis',
          links: ['website', 'instagram', 'youtube', 'spotify', 'applemusic', 'x', 'facebook'].map((kind) => ({ kind, url: `https://${kind}.example/milesdavis` })),
        },
      },
    }
  }
  // ?bg=cafe&dim=30&hang=barn tries a look on the sample wall
  if (q.has('bg')) seed.docs['settings/site'].bg = { kind: 'preset', preset: q.get('bg') }
  if (q.has('dim')) seed.docs['settings/site'].dim = +q.get('dim')!
  if (q.has('hang')) seed.docs['settings/site'].hang = q.get('hang')
  // ?update=1.0.1 offers an update; ?dz=ok|error|pending shows a saved Discogs token in that state
  if (q.has('update')) Object.assign(seed.docs['settings/site'], { taskId: 'dev', update: { latest: q.get('update'), checkedMs: Date.now() } })
  // (with a task set up, so a verified token offers the Discogs import)
  if (q.has('dz')) {
    seed.docs['settings/site'].taskId ??= 'dev'
    seed.docs['settings/site'].discogs = { username: 'ober37', hasToken: true, last4: 'wxyz', savedAt: '2026-10-23', checkedAt: '2026-10-23', status: q.get('dz'), verifiedUser: 'ober37', msg: q.get('dz') === 'error' ? 'Discogs says this token is invalid.' : '' }
  }
  return fakeClaude(seed, { canWrite: !q.has('ro') }).claude
}

setGrain()
runtime().then((claude) =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeProvider storageKey={THEME_KEY}>
        <RuntimeProvider claude={claude}>
          <App />
        </RuntimeProvider>
      </ThemeProvider>
    </StrictMode>,
  ),
)
