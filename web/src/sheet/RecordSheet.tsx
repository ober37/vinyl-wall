import { useEffect, useRef, useState } from 'react'
import { Badge } from '@appica/ui-react/badge'
import { Button } from '@appica/ui-react/button'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
} from '@appica/ui-react/drawer'
import { Thumbnail } from '@appica/ui-react/thumbnail'
import { patchFor, toForm, type Form } from '../model/edit'
import { coverUrl, kindOf, KIND_LABEL, type Rec } from '../model/record'
import { useRuntime } from '../runtime/runtime'
import { EditForm } from './EditForm'
import { ViewBody } from './ViewBody'

const SAVE_DELAY = 700

// Edit mode autosaves like production: a short pause after typing writes what changed; Done or closing writes at once.
function useAutosave(r: Rec | undefined, editing: boolean) {
  const { update } = useRuntime()
  const [form, setForm] = useState<Form | null>(null)
  const [saved, setSaved] = useState('')
  const baseline = useRef<Form | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const latest = useRef({ r, form })
  latest.current = { r, form }

  // the form starts from the record when editing starts; later snapshots don't overwrite what's being typed
  useEffect(() => {
    if (editing && r) {
      const f = toForm(r)
      baseline.current = f
      setForm(f)
      setSaved('')
    } else setForm(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, r?.id])

  const flush = () => {
    clearTimeout(timer.current)
    const { r, form } = latest.current
    if (!r || !form || !baseline.current) return
    const patch = patchFor(r, baseline.current, form)
    if (!Object.keys(patch).length) return
    baseline.current = form
    update(r.id, patch).then((ok) => setSaved(ok ? 'Saved' : "Couldn't save"))
  }

  const set = (k: keyof Form, v: string) => {
    setForm((f) => (f ? { ...f, [k]: v } : f))
    setSaved('Editing…')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DELAY)
  }

  useEffect(() => () => clearTimeout(timer.current), [])
  return { form, set, saved, flush }
}

export function RecordSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { records, canEdit } = useRuntime()
  const r = records.find((x) => x.id === id)
  const [editing, setEditing] = useState(false)
  const { form, set, saved, flush } = useAutosave(r, editing && canEdit)

  useEffect(() => setEditing(false), [id])

  const close = () => {
    flush()
    onClose()
  }
  const k = r ? kindOf(r) : 'own'
  const by = r ? [r.artist, r.year, r.runtime ? r.runtime + ' min' : ''].filter(Boolean).join(' · ') : ''

  return (
    <Drawer side="right" open={!!r} onOpenChange={(o) => !o && close()}>
      <DrawerContent className="w-full sm:max-w-xl">
        {r && (
          <>
            <DrawerHeader className="flex-row items-start gap-4">
              <Thumbnail src={coverUrl(r) || undefined} alt={`${r.title} cover`} size={96} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <DrawerTitle className="break-words">{r.title || 'Untitled'}</DrawerTitle>
                <DrawerDescription>{by}</DrawerDescription>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge size="sm" variant={k === 'own' ? 'success' : k === 'ordered' ? 'info' : 'secondary'}>
                    {KIND_LABEL[k]}
                  </Badge>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant={editing ? 'primary' : 'outline'}
                      onClick={() => {
                        if (editing) flush()
                        setEditing(!editing)
                      }}
                    >
                      {editing ? 'Done' : 'Edit'}
                    </Button>
                  )}
                  {editing && (
                    <span role="status" className="text-foreground-muted text-xs">
                      {saved}
                    </span>
                  )}
                </div>
              </div>
            </DrawerHeader>
            <DrawerBody>
              {editing && form ? (
                <EditForm form={form} own={k === 'own'} wish={k !== 'own'} set={set} />
              ) : (
                <ViewBody r={r} />
              )}
            </DrawerBody>
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}
