import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@appica/ui-react/providers/theme-provider'
import { App } from './App'
import { RuntimeProvider } from './runtime/runtime'
import './index.css'

// outside claude.ai, `npm run dev` runs on the fake runtime with sample records
async function runtime(): Promise<Window['claude'] | undefined> {
  const real = (window as Partial<Window>).claude
  if (real || !import.meta.env.DEV) return real
  const [{ fakeClaude }, { sample }] = await Promise.all([import('./runtime/fake'), import('./runtime/sample')])
  const q = new URLSearchParams(location.search)
  const seed = sample()
  // ?bg=cafe&dim=30&hang=barn tries a look on the sample wall
  if (q.has('bg')) seed.docs['settings/site'].bg = { kind: 'preset', preset: q.get('bg') }
  if (q.has('dim')) seed.docs['settings/site'].dim = +q.get('dim')!
  if (q.has('hang')) seed.docs['settings/site'].hang = q.get('hang')
  return fakeClaude(seed, { canWrite: !q.has('ro') }).claude
}

runtime().then((claude) =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeProvider>
        <RuntimeProvider claude={claude}>
          <App />
        </RuntimeProvider>
      </ThemeProvider>
    </StrictMode>,
  ),
)
