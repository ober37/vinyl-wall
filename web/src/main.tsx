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
  const ro = new URLSearchParams(location.search).has('ro')
  return fakeClaude(sample(), { canWrite: !ro }).claude
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
