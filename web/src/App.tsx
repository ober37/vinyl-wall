import { useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { useTheme } from '@appica/ui-react/hooks/use-theme'
import { Boundary } from './Boundary'
import { useRuntime } from './runtime/runtime'
import { RecordSheet } from './sheet/RecordSheet'
import { Wall, WallBackground } from './wall/Wall'

const MESSAGE = {
  loading: 'Loading the wall…',
  'no-runtime': 'This page runs inside claude.ai.',
  'no-db': 'Open this page signed in to claude.ai to see the wall.',
  revoked: 'This page lost access to its data. Reload to try again.',
  ready: '',
}

export function App() {
  const { resolvedTheme, setTheme } = useTheme()
  const { status, records, site, error } = useRuntime()
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <main className={`mx-auto max-w-6xl px-4 pt-7 pb-16 sm:px-6 ${site.background.kind === 'photo' ? 'photo-bg' : ''}`}>
      <WallBackground bg={site.background} />
      {(MESSAGE[status] || error) && (
        <p role="status" className="on-photo text-ink-2 mb-4 text-sm">
          {MESSAGE[status] || error}
        </p>
      )}
      {status === 'ready' && (
        <Boundary title="Couldn't show the wall">
          <Wall
            records={records}
            title={site.title}
            hang={site.hang}
            onOpen={setOpenId}
            tools={
              <Button variant="outline" size="sm" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
                {resolvedTheme === 'dark' ? 'Light' : 'Dark'}
              </Button>
            }
          />
        </Boundary>
      )}
      <RecordSheet id={openId} onClose={() => setOpenId(null)} />
    </main>
  )
}
