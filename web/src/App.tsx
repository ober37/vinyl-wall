import { useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { useTheme } from '@appica/ui-react/hooks/use-theme'
import { Boundary } from './Boundary'
import { useRuntime } from './runtime/runtime'
import { RecordSheet } from './sheet/RecordSheet'
import { Wall } from './wall/Wall'

const MESSAGE = {
  loading: 'Loading the wall…',
  'no-runtime': 'This page runs inside claude.ai.',
  'no-db': 'Open this page signed in to claude.ai to see the wall.',
  revoked: 'This page lost access to its data. Reload to try again.',
  ready: '',
}

export function App() {
  const { resolvedTheme, setTheme } = useTheme()
  const { status, records, error } = useRuntime()
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-6 flex items-center justify-between gap-2">
        <h1 className="text-foreground-intense text-2xl font-semibold">Vinyl Wall</h1>
        <Button variant="outline" size="sm" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
          {resolvedTheme === 'dark' ? 'Light' : 'Dark'}
        </Button>
      </header>
      {(MESSAGE[status] || error) && (
        <p role="status" className="text-foreground-muted mb-4 text-sm">
          {MESSAGE[status] || error}
        </p>
      )}
      {status === 'ready' && (
        <Boundary title="Couldn't show the wall">
          <Wall records={records} onOpen={setOpenId} />
        </Boundary>
      )}
      <RecordSheet id={openId} onClose={() => setOpenId(null)} />
    </main>
  )
}
