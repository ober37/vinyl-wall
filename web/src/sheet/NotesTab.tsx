import { useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { Textarea } from '@appica/ui-react/textarea'
import { addNote, deleteNote, editNote, writtenNotes, type NoteRef } from '../model/notes'
import { isPlay, kindOf, playDate, type Rec } from '../model/record'
import { useRuntime } from '../runtime/runtime'
import { Confirm } from './Confirm'
import { Linkify } from './Linkify'

const PLACEHOLDER = {
  own: 'Add a note about this record…',
  ordered: 'Shipping update, a note from the seller…',
  wish: 'A store you checked, a price you saw…',
}
const gone = (): never => {
  throw new Error('This note changed elsewhere. Try again.')
}

export const noteCount = (r: Rec) => writtenNotes(r, isPlay).length

export function NotesTab({ r }: { r: Rec }) {
  const { canEdit, mutate } = useRuntime()
  const [draft, setDraft] = useState('')
  const [edit, setEdit] = useState<{ ref: NoteRef; text: string } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const notes = writtenNotes(r, isPlay)
  const same = (a: NoteRef, b: NoteRef) => a.i === b.i && a.d === b.d && a.t === b.t

  const add = () => {
    const t = draft.trim()
    if (t) mutate(r.id, (latest) => ({ notes: addNote(latest, t) })).then((ok) => ok && setDraft(''))
  }
  const save = () => {
    const t = edit?.text.trim()
    if (edit && t) mutate(r.id, (latest) => ({ notes: editNote(latest, edit.ref, t) ?? gone() })).then((ok) => ok && setEdit(null))
  }
  const drop = () => edit && mutate(r.id, (latest) => ({ notes: deleteNote(latest, edit.ref) ?? gone() })).then((ok) => ok && setEdit(null))

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <Textarea
            aria-label="Note"
            rows={2}
            value={draft}
            placeholder={PLACEHOLDER[kindOf(r)]}
            onChange={(e) => setDraft(e.target.value)}
            // Enter is a new line; Cmd/Ctrl+Enter adds the note
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                add()
              }
            }}
          />
          <Button type="submit" size="sm" variant="outline" className="self-start" disabled={!draft.trim()}>
            Add note
          </Button>
        </form>
      )}
      {notes.length === 0 ? (
        !canEdit && <p className="text-foreground-muted text-sm">No notes yet.</p>
      ) : (
        <ul className="divide-border flex flex-col divide-y">
          {notes.map(({ n, ref }) => (
            <li key={ref.i} className="flex flex-col gap-1 py-3 text-sm">
              <time className="text-foreground-muted text-xs">{n.d ? playDate(String(n.d)) : ''}</time>
              {edit && same(edit.ref, ref) ? (
                <div className="flex flex-col gap-2">
                  <Textarea aria-label="Edit note" rows={3} value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} autoFocus />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={save}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>
                      Cancel
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <p className="text-foreground min-w-0 break-words whitespace-pre-line">
                    <Linkify text={String(n.t ?? '')} />
                  </p>
                  {canEdit && (
                    <Button size="sm" variant="outline" onClick={() => setEdit({ ref, text: String(n.t ?? '') })}>
                      Edit
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Confirm open={confirm} title="Delete this note?" yes="Delete" onYes={drop} onClose={() => setConfirm(false)} />
    </div>
  )
}
