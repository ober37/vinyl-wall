import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Badge } from '@appica/ui-react/badge'
import { Button } from '@appica/ui-react/button'
import {
  Drawer,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
} from '@appica/ui-react/drawer'
import { SheetContent } from '../wall/Tip'
import { wallFocus } from '../wall/Wall'
import { Alert, AlertTitle } from '@appica/ui-react/alert'
import { Boundary } from '../Boundary'
import { patchFor, stored, toForm, type Form, type TextKey } from '../model/edit'
import { coverPatch, enrichPatch, removeCoverPatch } from '../model/create'
import { coverUrl, hueOf, kindOf, KIND_LABEL, type Kind, type Rec } from '../model/record'
import { pickable } from '../model/copies'
import { movePatch } from '../model/status'
import { lookupStatus, syncing } from '../model/task'
import { useRuntime } from '../runtime/runtime'
import { Face } from '../wall/Face'
import { Confirm } from './Confirm'
import { CoverMenu } from './CoverMenu'
import { CopyPicker } from './Copies'
import { EditForm } from './EditForm'
import type { WantMsg } from './ResearchTab'
import { Badges } from './Badges'
import { ViewBody } from './ViewBody'

const SAVE_DELAY = 700
// a hunt's badge says how much it's wanted
const PRIORITY = ['Top want', 'Want', 'Someday']

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
    } else setForm(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, r?.id, kind])
  // the status line belongs to this record in this mode; a status move (which changes kind) keeps its own line
  useEffect(() => setSaved(''), [editing, r?.id])

  // a change made elsewhere (a copy added from Research or in chat) shows in the form when nothing typed is waiting
  useEffect(() => {
    if (!editing || !r || !baseline.current || latest.current.form !== baseline.current) return
    const f = toForm(r)
    // compared as stored, so a pause after a trailing space doesn't trim what's being typed
    if (JSON.stringify(stored(f)) === JSON.stringify(stored(baseline.current))) return
    baseline.current = f
    setForm(f)
  }, [editing, r])

  const flush = () => {
    clearTimeout(timer.current)
    const { r, form } = latest.current
    if (!r || !form || !baseline.current) return
    const patch = patchFor(r, baseline.current, form)
    if (!Object.keys(patch).length) return
    baseline.current = form
    update(r.id, patch).then((ok) => setSaved(ok ? 'Saved' : "Couldn't save"))
  }

  // typing saves after a pause; adding or removing a copy saves at once
  const change = (p: Partial<Form>, now = false) => {
    const f = latest.current.form
    if (!f) return
    const next = { ...f, ...p }
    latest.current.form = next
    setForm(next)
    clearTimeout(timer.current)
    if (now) return flush()
    setSaved('Editing…')
    timer.current = setTimeout(flush, SAVE_DELAY)
  }
  const set = (k: TextKey, v: string) => change({ [k]: v })

  // drop what hasn't been written yet (the record is about to go)
  const cancel = () => {
    clearTimeout(timer.current)
    baseline.current = latest.current.form
  }

  useEffect(() => () => clearTimeout(timer.current), [])
  return { form, set, change, saved, setSaved, flush, cancel }
}

// onBack: the record was opened from Equipment, so its header offers the way back there
// onDiscogs: open Settings on its Discogs section (the release line's way to connect)
export function RecordSheet({ id, onClose, onBack, onDiscogs }: { id: string | null; onClose: () => void; onBack?: () => void; onDiscogs?: () => void }) {
  const { records, canEdit, error, notice, clearError, mutate, remove, update, fireTask, flushSync, settings, deleteAsset } = useRuntime()
  const r = records.find((x) => x.id === id)
  const [editing, setEditing] = useState(false)
  const [focusWhy, setFocusWhy] = useState(false)
  const [focusCopy, setFocusCopy] = useState<number | null>(null)
  const [want, setWant] = useState<WantMsg | null>(null)
  const [msg, setMsg] = useState('')
  // the tab in view, with the record and status it was chosen on: kept through Edit and Done; a status move (It arrived
  // lands on Listening) or another record opens on the task tab, and so does reopening the sheet
  const [tabAt, setTabAt] = useState({ at: '', tab: '' })
  const at = r ? r.id + ':' + kindOf(r) : ''
  const tab = tabAt.at === at ? tabAt.tab : ''
  const setTab = (t: string) => setTabAt({ at, tab: t })
  // a hunt with several copies asks which one first; the status stays as it is until one is picked
  const [pick, setPick] = useState<'own' | 'ordered' | null>(null)
  const [uncover, setUncover] = useState(false)
  const { form, set, change, saved, setSaved, flush, cancel } = useAutosave(r, editing && canEdit)
  // what opened the sheet: when the syncing filter has taken its sleeve off the wall, closing puts focus on a chip
  const opener = useRef<Element | null>(null)
  useLayoutEffect(() => {
    if (id) opener.current = document.activeElement
  }, [id])

  useEffect(() => {
    setEditing(false)
    setPick(null)
    setWant(null)
    setMsg('')
    setTabAt({ at: '', tab: '' })
    clearError(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // edit mode's status control moves without asking what was paid, as production's does
  const moveTo = (to: Kind, ci?: number) => {
    if (!r) return
    flush()
    if (to !== 'wish' && ci === undefined && kindOf(r) === 'wish' && pickable(r).length > 1) return setPick(to)
    setPick(null)
    let m = ''
    mutate(r.id, (latest) => {
      const x = movePatch(latest, to, undefined, ci)
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
    update(r.id, enrichPatch(r)).then((ok) => ok && fireTask({ asked: true }))
  }
  // Remove cover: the image goes too when no other record shows it; an upload of their own is gone for good (#62)
  const shared = !!r?.coverAsset && records.some((x) => x.id !== r.id && x.coverAsset === r.coverAsset)
  const ownUpload = !!r?.coverAsset && !r.autoFilled?.includes('coverAsset') && !shared
  const uncoverIt = async () => {
    if (!r) return
    const { coverAsset, coverOriginal } = r
    if (!(await update(r.id, removeCoverPatch(r)))) return
    setSaved('Saved')
    // and its full-size original, when it has one
    for (const id of [coverAsset, coverOriginal])
      if (typeof id === 'string' && id && !records.some((x) => x.id !== r.id && (x.coverAsset === id || x.coverOriginal === id))) deleteAsset(id)
  }
  const k = r ? kindOf(r) : 'own'
  const by = r ? [r.artist, r.year, r.runtime ? r.runtime + ' min' : ''].filter(Boolean).join(' · ') : ''
  const face = r && (
    <Face
      key={r.id}
      title={r.title || ''}
      artist={r.artist || ''}
      hue={hueOf(r)}
      cover={coverUrl(r)}
      small
      className="size-24 shrink-0 rounded-(--radius-2xs) sm:size-38"
    />
  )
  // a lookup says what it's doing; an edit waiting for Discogs says so too, except in edit, where the Discogs section does
  // for editors only, like the wall's busy dots: a viewer can't act on it
  const status = r && canEdit ? lookupStatus(r) || (!editing && syncing(r, settings.discogs?.status === 'ok') ? 'Waiting to sync…' : '') : ''

  return (
    <Drawer side="right" open={!!r} onOpenChange={(o) => !o && close()}>
      <SheetContent className="w-full sm:max-w-xl" finalFocus={() => opener.current?.isConnected !== false || wallFocus() || true}>
        {r && (
          <>
            {onBack && (
              <Button
                size="sm"
                variant="ghost"
                className="ms-3 mt-3 -mb-3 self-start"
                onClick={() => {
                  flush()
                  flushSync()
                  onBack()
                }}
              >
                ‹ Equipment
              </Button>
            )}
            {/* one cover size for every record: as tall as a full set of lines beside it (badges and a lookup line) from sm
                up, 96px on phones, where a bigger one would squeeze the title */}
            <DrawerHeader className="flex-row items-start gap-4">
              {editing ? (
                <CoverMenu
                  face={face}
                  hasCover={!!r.coverAsset}
                  onStatus={setSaved}
                  onUploaded={async (a) => {
                    if (await update(r.id, coverPatch(r, a))) setSaved('Saved')
                  }}
                  onRemove={() => setUncover(true)}
                />
              ) : (
                face
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {/* a drag here selects the text to copy, not swipes the sheet shut (#110) */}
                <DrawerTitle className="break-words" data-base-ui-swipe-ignore="">
                  {r.title || 'Untitled'}
                </DrawerTitle>
                <DrawerDescription data-base-ui-swipe-ignore="">{by}</DrawerDescription>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge size="sm" variant={k === 'own' ? 'success' : k === 'ordered' ? 'info' : 'secondary'}>
                    {k === 'wish' ? PRIORITY[r.priority == 1 ? 0 : r.priority == 3 ? 2 : 1] : KIND_LABEL[k]}
                  </Badge>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant={editing ? 'primary' : 'outline'}
                      onClick={() => {
                        if (editing) flush()
                        setFocusCopy(null)
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
                {/* what it's earned, owned records in view only, on a row of its own so phones don't crowd the one above */}
                {k === 'own' && !editing && <Badges r={r} records={records} />}
                {/* waiting on the background task: the record's one lookup line, gone when the task fills it in */}
                {status && (
                  <p role="status" className="text-foreground-muted mt-1 flex items-center gap-2 text-xs">
                    <span aria-hidden="true" className="bg-brass motion-safe:animate-pulse-dot size-1.75 shrink-0 rounded-full" />
                    {status}
                  </p>
                )}
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
                  // the lookup, on a quiet line: the cover's own actions are on the cover (#129)
                  <div className="-ms-3 mb-6 flex flex-wrap items-center gap-1">
                    <Button size="sm" variant="ghost" disabled={!!r.needsEnrich} onClick={enrich}>
                      Find cover & details
                    </Button>
                    <Confirm
                      open={uncover}
                      title={`Remove this cover${ownUpload ? ' for good' : ''}? The record goes back to its plain sleeve.`}
                      yes="Remove"
                      onYes={uncoverIt}
                      onClose={() => setUncover(false)}
                    />
                  </div>
                )}
                {editing && pick && (
                  <div className="mb-6">
                    <CopyPicker r={r} to={pick} onPick={(ci) => moveTo(pick, ci)} onCancel={() => setPick(null)} />
                  </div>
                )}
                {editing && form ? (
                  <EditForm
                    form={form}
                    kind={k}
                    set={set}
                    change={change}
                    title={r.title || 'this record'}
                    focusWhy={focusWhy}
                    onStatus={(to) => moveTo(to)}
                    onRemove={removeIt}
                    autoFilled={Array.isArray(r.autoFilled) ? r.autoFilled : []}
                    focusCopy={focusCopy}
                    r={r}
                    connected={!!settings.discogs?.hasToken}
                    onConnect={
                      onDiscogs &&
                      (() => {
                        close()
                        onDiscogs()
                      })
                    }
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
                    want={want}
                    setWant={setWant}
                    tab={tab}
                    setTab={setTab}
                    onEditCopy={(ci) => {
                      setFocusCopy(ci)
                      setEditing(true)
                    }}
                  />
                )}
              </Boundary>
            </DrawerBody>
          </>
        )}
      </SheetContent>
    </Drawer>
  )
}
