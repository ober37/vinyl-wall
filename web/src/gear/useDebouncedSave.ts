import { useEffect, useRef } from 'react'

// Equipment's autosave: schedule() saves after a pause, flush() saves what's waiting now, cancel() drops it; leaving
// the view saves what's waiting. save reads the latest values itself (from a ref), so it runs fine from a timer.
export function useDebouncedSave(save: () => void, onStatus: (s: string) => void, delay = 600) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const run = useRef(save)
  run.current = save
  const cancel = () => {
    const waiting = !!timer.current
    clearTimeout(timer.current)
    timer.current = undefined
    return waiting
  }
  const flush = () => {
    if (cancel()) run.current()
  }
  const schedule = () => {
    clearTimeout(timer.current)
    onStatus('Editing…')
    timer.current = setTimeout(flush, delay)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => flush, [])
  return { schedule, flush, cancel }
}
