import { useState } from 'react'
import { Alert, AlertTitle } from '@appica/ui-react/alert'
import { Button } from '@appica/ui-react/button'
import { Boundary } from './Boundary'
import { useRuntime } from './runtime/runtime'
import { lookingUp } from './model/task'
import { SettingsSheet, useUpdateAvailable } from './settings/SettingsSheet'
import { NewRecordSheet } from './sheet/NewRecordSheet'
import { RecordSheet } from './sheet/RecordSheet'
import { Wall, WallBackground } from './wall/Wall'

const GearIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
)

const MESSAGE = {
  loading: 'Loading the wall…',
  'no-runtime': 'This page runs inside claude.ai.',
  'no-db': 'Open this page signed in to claude.ai to see the wall.',
  revoked: 'This page lost access to its data. Reload to try again.',
  ready: '',
}

export function App() {
  const { status, records, site, error, notice, clearError, canEdit } = useRuntime()
  const [openId, setOpenId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const update = useUpdateAvailable()
  const looking = records.filter(lookingUp).length

  return (
    <main className={`mx-auto max-w-6xl px-4 pt-7 pb-16 sm:px-6 ${site.background.kind === 'photo' ? 'photo-bg' : ''}`}>
      <WallBackground bg={site.background} />
      {MESSAGE[status] && (
        <p role="status" className="on-photo text-ink-2 mb-4 text-sm">
          {MESSAGE[status]}
        </p>
      )}
      {(error || notice) && !openId && !settingsOpen && !adding && (
        <Alert variant={error ? 'error' : 'info'} className="mb-4" dismissible onOpenChange={(o) => !o && clearError()}>
          <AlertTitle>{error || notice}</AlertTitle>
        </Alert>
      )}
      {status === 'ready' && (
        <Boundary title="Couldn't show the wall">
          <Wall
            records={records}
            title={site.title}
            hang={site.hang}
            onOpen={setOpenId}
            onAdd={canEdit ? () => setAdding(true) : undefined}
            below={
              looking > 0 && (
                <p role="status" className="on-photo text-ink-2 mt-1.5 flex items-center gap-1.5 font-mono text-xs">
                  <span aria-hidden="true" className="bg-brass motion-safe:animate-pulse-dot size-1.75 shrink-0 rounded-full" />
                  Looking up {looking} record{looking === 1 ? '' : 's'}…
                </p>
              )
            }
            tools={
              <>
                {canEdit && (
                  <span className="relative">
                    <Button
                      size="icon-md"
                      variant="outline"
                      aria-label={update ? 'Settings (update available)' : 'Settings'}
                      className="rounded-full bg-transparent before:rounded-full before:bg-transparent"
                      onClick={() => setSettingsOpen(true)}
                    >
                      <GearIcon />
                    </Button>
                    {update && (
                      <span aria-hidden="true" className="bg-brass absolute end-0.5 top-0.5 size-2 rounded-full ring-2 ring-(--shade)" />
                    )}
                  </span>
                )}
              </>
            }
          />
        </Boundary>
      )}
      <RecordSheet id={openId} onClose={() => setOpenId(null)} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <NewRecordSheet
        open={adding}
        onClose={() => setAdding(false)}
        // the new record opens in view, in place of the new-record sheet
        onCreated={(id) => {
          setAdding(false)
          setOpenId(id)
        }}
      />
    </main>
  )
}
