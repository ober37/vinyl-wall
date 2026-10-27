import { useEffect } from 'react'
import { Toaster, ToastProvider, useToastManager } from '@appica/ui-react/toast'
import { useRuntime } from '../runtime/runtime'

const WarnIcon = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="text-error-emphasis size-4">
    <path d="M8 1.5a1 1 0 0 1 .87.5l6.5 11.25A1 1 0 0 1 14.5 14.75h-13a1 1 0 0 1-.87-1.5L7.13 2a1 1 0 0 1 .87-.5zm0 4a.75.75 0 0 0-.75.75v3.5a.75.75 0 0 0 1.5 0v-3.5A.75.75 0 0 0 8 5.5zm0 6.25a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8z" />
  </svg>
)

// Wall messages (#68): what goes wrong, or a notice, while no sheet is open shows as a toast at the bottom, not above the
// title. A sheet shows its own inline, and what's still showing when it closes comes here. Errors stay until closed;
// notices go after 8 seconds. A failed load isn't one: the status line says it, where the wall would be
export function WallMessages({ sheetOpen }: { sheetOpen: boolean }) {
  return (
    <ToastProvider limit={2}>
      <Toasts sheetOpen={sheetOpen} />
    </ToastProvider>
  )
}

function Toasts({ sheetOpen }: { sheetOpen: boolean }) {
  const { status, error, notice, clearError } = useRuntime()
  const { add } = useToastManager<{ icon?: React.ReactNode }>()
  const msg = error || notice
  useEffect(() => {
    if (!msg || sheetOpen || status !== 'ready') return
    add(
      error
        ? { title: error, type: 'error', timeout: 0, priority: 'high', data: { icon: <WarnIcon /> } }
        : { title: notice, type: 'info', timeout: 8000 },
    )
    clearError()
  }, [msg, sheetOpen, status])
  return <Toaster position="bottom-center" className="max-sm:w-[calc(100vw-2rem)]" />
}
