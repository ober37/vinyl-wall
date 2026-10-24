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
import { Alert, AlertTitle } from '@appica/ui-react/alert'
import { Boundary } from '../Boundary'
import { patchFor, toForm, type Form } from '../model/edit'
import { coverPatch, hasArtistInfo, NOT_ARTIST } from '../model/create'
import { coverUrl, hueOf, kindOf, KIND_LABEL, type Kind, type Rec } from '../model/record'
import { movePatch, wantedCopies } from '../model/status'
import { useRuntime } from '../runtime/runtime'
import { Face } from '../wall/Face'
import { CoverButton } from './CoverButton'
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

  // the form starts from the record when editing starts, and again when its status changes (the fields differ);
  // later snapshots don't overwrite what's being typed
  const kind = r ? kindOf(r) : undefined
  useEffect(() => {
    if (editing && r) {
      const f = toForm(r)
      baseline.current = f
      setForm(f)
      setSaved('')
    } else setForm(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, r?.id, kind])

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

  // drop what hasn't been written yet (the record is about to go)
  const cancel = () => {
    clearTimeout(timer.current)
    baseline.current = latest.current.form
  }

  useEffect(() => () => clearTimeout(timer.current), [])
  return { form, set, saved, setSaved, flush, cancel }
}

export function RecordSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { records, artists, canEdit, error, notice, flash, clearError, mutate, remove, update, fireTask, flushSync } = useRuntime()
  const r = records.find((x) => x.id === id)
  const [editing, setEditing] = useState(false)
  const [focusWhy, setFocusWhy] = useState(false)
  const [msg, setMsg] = useState('')
  const { form, set, saved, setSaved, flush, cancel } = useAutosave(r, editing && canEdit)

  useEffect(() => {
    setEditing(false)
    setMsg('')
    clearError(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // edit mode's status control moves without asking what was paid, as production's does
  const moveTo = (to: Kind) => {
    if (!r) return
    flush()
    let m = ''
    mutate(r.id, (latest) => {
      const x = movePatch(latest, to)
      m = x?.msg || ''
      return x?.patch ?? null
    }).then((ok) => ok && setSaved(m))
  }
  const removeIt = () => {
    if (!r) return
    cancel()
    remove(r.id).then((ok) => ok && onClose())
  }

  const close = () => {
    flush()
    flushSync()
    onClose()
  }
  // edit mode's manual lookup: mark the record and start the task
  const enrich = () => {
    if (!r) return
    update(r.id, { needsEnrich: true }).then((ok) => {
      if (!ok) return
      flash('Looking up ' + r.title + '… the cover usually appears within a few minutes.')
      fireTask()
    })
  }
  const k = r ? kindOf(r) : 'own'
  const by = r ? [r.artist, r.year, r.runtime ? r.runtime + ' min' : ''].filter(Boolean).join(' · ') : ''

  return (
    <Drawer side="right" open={!!r} onOpenChange={(o) => !o && close()}>
      <DrawerContent className="w-full sm:max-w-xl">
        {r && (
          <>
            <DrawerHeader className="flex-row items-start gap-4">
              <Face
                key={r.id}
                title={r.title || ''}
                artist={r.artist || ''}
                hue={hueOf(r)}
                cover={coverUrl(r)}
                small
                className="size-24 shrink-0 rounded-(--radius-2xs)"
              />
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
              <Boundary key={r.id} title="Couldn't show this record" onClose={close}>
                {(error || notice) && (
                  <Alert variant={error ? 'error' : 'info'} className="mb-4" dismissible onOpenChange={(o) => !o && clearError()}>
                    <AlertTitle>{error || notice}</AlertTitle>
                  </Alert>
                )}
                {editing && (
                  <div className="mb-6 flex flex-wrap items-center gap-2">
                    <CoverButton
                      hasCover={!!r.coverAsset}
                      onStatus={setSaved}
                      onUploaded={async (a) => {
                        if (await update(r.id, coverPatch(r, a))) setSaved('Saved')
                      }}
                    />
                    <Button size="sm" variant="outline" disabled={!!r.needsEnrich} onClick={enrich}>
                      {r.needsEnrich ? 'Looking it up…' : 'Find cover & details'}
                    </Button>
                    {hasArtistInfo(r, new Set(artists.map((a) => a.id))) && (
                      <Button size="sm" variant="outline" onClick={async () => (await update(r.id, NOT_ARTIST)) && setSaved('Saved')}>
                        Not this artist
                      </Button>
                    )}
                  </div>
                )}
                {editing && form ? (
                  <EditForm
                    form={form}
                    kind={k}
                    set={set}
                    title={r.title || 'this record'}
                    focusWhy={focusWhy}
                    onStatus={k === 'wish' && wantedCopies(r) > 1 ? null : moveTo}
                    onRemove={removeIt}
                    autoFilled={Array.isArray(r.autoFilled) ? r.autoFilled : []}
                    looking={!!r.needsEnrich}
                  />
                ) : (
                  <ViewBody
                    r={r}
                    msg={msg}
                    onMoved={setMsg}
                    onAddWhy={() => {
                      setFocusWhy(true)
                      setEditing(true)
                    }}
                  />
                )}
              </Boundary>
            </DrawerBody>
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}
