import { useEffect, useRef, useState } from 'react'
import { Alert, AlertTitle } from '@appica/ui-react/alert'
import { Button } from '@appica/ui-react/button'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@appica/ui-react/collapsible'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerBody } from '@appica/ui-react/drawer'
import { Field, FieldLabel } from '@appica/ui-react/field'
import { Form as FormRoot } from '@appica/ui-react/form'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Input } from '@appica/ui-react/input'
import { dupeOf, newDoc } from '../model/create'
import { lookingUpNotice } from '../model/task'
import { toForm, type Form } from '../model/edit'
import type { Kind } from '../model/record'
import { useRuntime } from '../runtime/runtime'
import { CoverButton } from './CoverButton'
import { EditForm } from './EditForm'
import { Segmented } from './Segmented'

const blank = (kind: Kind | ''): Form => toForm({ id: '', status: kind || 'own' })

// Add a record, as production's new-record sheet: album, artist, what it is, then Hang it. "Add details now" holds the
// fields for that kind and a cover upload. Nothing is written until Hang it; closing the sheet drops the draft.
export function NewRecordSheet({ open, onClose, onCreated }: {
  open: boolean
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { records, newId, create, fireTask, flash, error, clearError } = useRuntime()
  const [kind, setKind] = useState<Kind | ''>('')
  const [form, setForm] = useState<Form>(() => blank(''))
  const [cover, setCover] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  // the cover's own status, beside its button (a form away from Hang it)
  const [coverStatus, setCoverStatus] = useState('')
  const [uploading, setUploading] = useState(false)
  const [hanging, setHanging] = useState(false)
  // set at once on the first click, so a quick second click can't hang it twice; the id is minted once per draft, so a
  // retry after a failed write reuses it
  const busy = useRef(false)
  const album = useRef<HTMLInputElement>(null)
  const id = useRef<string | null>(null)

  // a fresh draft each time the sheet opens (production drops it on close, cover included)
  useEffect(() => {
    if (!open) return
    setKind('')
    setForm(blank(''))
    setCover(null)
    setStatus('')
    setCoverStatus('')
    setHanging(false)
    busy.current = false
    id.current = null
    clearError()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  // a kind has its own fields; what's typed in the shared ones stays
  const choose = (k: Kind) => {
    setKind(k)
    setForm((f) => ({ ...blank(k), ...Object.fromEntries(Object.entries(f).filter(([key]) => key in blank(k))) }))
  }

  const hang = async () => {
    if (busy.current || !kind) return
    if (!form.title.trim() || !form.artist.trim()) return setStatus('Album and artist are needed.')
    const doc = newDoc(form, kind, cover)
    const dupe = dupeOf(records, doc)
    if (dupe) return onCreated(dupe.id)
    busy.current = true
    setHanging(true)
    setStatus('')
    id.current ??= newId()
    const ok = await create(id.current, doc)
    busy.current = false
    setHanging(false)
    if (!ok) return
    if (doc.needsEnrich) {
      flash(lookingUpNotice(doc.title), id.current)
      fireTask()
    }
    onCreated(id.current)
  }

  return (
    <Drawer
      side="right"
      open={open}
      onOpenChange={(o) => !o && onClose()}
      // focus Album once the sheet has finished sliding in: iOS scrolls a field focused mid-slide "into view" and leaves
      // the still-moving sheet off the left edge (#60)
      onOpenChangeComplete={(o) => o && album.current?.focus()}
    >
      <DrawerContent className="w-full sm:max-w-xl">
        <DrawerHeader>
          <DrawerTitle>Add a record</DrawerTitle>
        </DrawerHeader>
        <DrawerBody className="flex flex-col gap-6 *:shrink-0">
          {error && (
            <Alert variant="error" dismissible onOpenChange={(o) => !o && clearError()}>
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          )}
          <FormRoot
            className="grid gap-4 sm:grid-cols-2"
            // Enter in Album or Artist hangs it, once a kind is chosen
            onSubmit={(e) => {
              e.preventDefault()
              hang()
            }}
          >
            <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
            <Field>
              <FieldLabel>Album</FieldLabel>
              <Input ref={album} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Kind of Blue" />
            </Field>
            <Field>
              <FieldLabel>Artist</FieldLabel>
              <Input value={form.artist} onChange={(e) => set('artist', e.target.value)} placeholder="e.g. Miles Davis" />
            </Field>
          </FormRoot>
          <Fieldset>
            <FieldsetLegend>It's…</FieldsetLegend>
            <Segmented
              label="It's"
              // nothing chosen yet shows no choice pressed
              value={kind as Kind}
              onChange={choose}
              options={[
                ['own', 'I own it'],
                ['ordered', 'On order'],
                ['wish', 'I want it'],
              ]}
            />
          </Fieldset>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={!kind || hanging || uploading} onClick={hang}>
                {hanging ? 'Hanging…' : 'Hang it'}
              </Button>
              <span role="status" className="text-foreground-muted text-sm">
                {status}
              </span>
            </div>
            <p className="text-foreground-muted text-xs">The cover, year, label and tracklist are looked up for you.</p>
          </div>
          <Collapsible>
            <CollapsibleTrigger className="group text-foreground-intense flex items-center gap-1.5 py-2 text-sm font-medium underline-offset-2 hover:underline">
              Add details now
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
                className="size-4 transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-6 pt-4">
              {kind ? (
                <>
                  <EditForm form={form} kind={kind} set={set} title={form.title} focusWhy={false} onStatus={null} onRemove={() => {}} isNew />
                  <div className="flex flex-wrap items-center gap-3">
                    <CoverButton
                      hasCover={!!cover}
                      onStatus={(m) => {
                        setCoverStatus(m)
                        setUploading(m === 'Uploading cover…')
                      }}
                      onUploaded={(a) => {
                        setCover(a)
                        setUploading(false)
                        setCoverStatus("Cover ready. It'll hang with the record.")
                      }}
                    />
                    <span role="status" className="text-foreground-muted text-sm">
                      {coverStatus}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-foreground-muted text-sm">Choose what it is first.</p>
              )}
            </CollapsibleContent>
          </Collapsible>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}
