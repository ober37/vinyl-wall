import { useState } from 'react'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@appica/ui-react/accordion'
import { Button } from '@appica/ui-react/button'
import { Checkbox } from '@appica/ui-react/checkbox'
import { CheckboxGroup } from '@appica/ui-react/checkbox-group'
import { DateField } from '@appica/ui-react/date-field'
import { Field, FieldLabel } from '@appica/ui-react/field'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Slider } from '@appica/ui-react/slider'
import { Textarea } from '@appica/ui-react/textarea'
import { deleteNote, notesOf, type NoteRef } from '../model/notes'
import { collapsePick, playNote, recordSides, saveJournal, sideOf, VIBES, type PlayKind } from '../model/plays'
import { fmtH, playMonths, recordTracks, today, type Play, type Rec } from '../model/record'
import { useRuntime } from '../runtime/runtime'
import { Confirm } from './Confirm'
import { Linkify } from './Linkify'
import { Segmented } from './Segmented'

// the play whose journal is open; fresh = just logged (Skip and Undo instead of a date and Delete)
type Journal = { ref: NoteRef; fresh: boolean }
const toDate = (s: string) => (/^\d{4}-\d\d-\d\d$/.test(s) ? new Date(s + 'T12:00') : null)
const fromDate = (d: Date | null) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : ''

function LogCard({ r, onLogged }: { r: Rec; onLogged: (j: Journal) => void }) {
  const { mutate } = useRuntime()
  const T = recordTracks(r)
  const [kind, setKind] = useState<PlayKind>('full')
  const [side, setSide] = useState(recordSides(r)[0])
  const [picks, setPicks] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const sides = [...new Set(T.map((t) => sideOf(t.pos)))]
  const bySide = sides.length && sides.every(Boolean) ? sides : ['']

  const log = async () => {
    const c = collapsePick(r, kind, side, picks)
    const note = playNote(r, c.kind, c.side, c.tracks)
    let i = -1
    setBusy(true)
    const ok = await mutate(r.id, (latest) => {
      const notes = notesOf(latest)
      i = notes.length
      return { notes: [...notes, note] }
    })
    setBusy(false)
    if (ok) {
      setPicks([])
      onLogged({ ref: { i, d: note.d, t: note.t }, fresh: true })
    }
  }

  return (
    <Fieldset>
      <FieldsetLegend>Log a play</FieldsetLegend>
      <Segmented
        label="What you played"
        value={kind}
        onChange={setKind}
        options={[['full', 'Whole album'], ['side', 'Side'], ...(T.length ? [['tracks', 'Tracks'] as [PlayKind, string]] : [])]}
      />
      {kind === 'side' && (
        <Segmented label="Which side" value={side} onChange={setSide} options={recordSides(r).map((s) => [s, 'Side ' + s])} />
      )}
      {kind === 'tracks' && (
        <CheckboxGroup aria-label="Tracks" value={picks} onValueChange={(v) => setPicks(v as string[])} className="gap-3">
          {bySide.map((sd) => (
            <div key={sd} className="flex flex-col gap-2">
              {sd && <span className="text-foreground-muted text-xs font-medium">Side {sd}</span>}
              {T.filter((t) => !sd || sideOf(t.pos) === sd).map((t) => (
                <label key={t.pos} className="text-foreground flex items-start gap-2 text-sm">
                  <Checkbox value={t.pos} className="mt-0.5" />
                  <span>
                    {t.title} {t.dur && <span className="text-foreground-muted">{t.dur}</span>}
                  </span>
                </label>
              ))}
            </div>
          ))}
        </CheckboxGroup>
      )}
      <Button className="self-start" disabled={busy || (kind === 'tracks' && !picks.length)} onClick={log}>
        {kind !== 'tracks' ? 'Log play' : picks.length ? `Log ${picks.length} track${picks.length > 1 ? 's' : ''}` : 'Pick tracks'}
      </Button>
    </Fieldset>
  )
}

function JournalEditor({ r, p, j, onDone }: { r: Rec; p: Play; j: Journal; onDone: () => void }) {
  const { mutate } = useRuntime()
  const [vibe, setVibe] = useState(p.vibe)
  const [text, setText] = useState(p.thoughts)
  const [date, setDate] = useState(p.day)
  const [confirm, setConfirm] = useState(false)
  const gone = () => {
    throw new Error('This play changed elsewhere. Try again.')
  }
  const save = () =>
    mutate(r.id, (latest) => ({ notes: saveJournal(latest, j.ref, { text, vibe, date: j.fresh ? undefined : date }) ?? gone() })).then(
      (ok) => ok && onDone(),
    )
  const drop = () => mutate(r.id, (latest) => ({ notes: deleteNote(latest, j.ref) ?? gone() })).then((ok) => ok && onDone())

  return (
    <div className="bg-background-muted flex flex-col gap-3 rounded-md p-3">
      <div className="text-foreground text-sm">{[p.date, p.what, p.setup].filter(Boolean).join(' · ')}</div>
      {vibe ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-foreground-intense text-sm font-medium">{VIBES[vibe - 1]}</span>
            <Button size="sm" variant="ghost" onClick={() => setVibe(0)}>
              Clear
            </Button>
          </div>
          <Slider
            min={1}
            max={5}
            step={1}
            value={vibe}
            onValueChange={(v) => setVibe(Array.isArray(v) ? v[0] : v)}
            thumbAriaLabel={`Vibe: ${VIBES[vibe - 1]}`}
            tooltipVisibility="never"
          />
        </div>
      ) : (
        <Button size="sm" variant="outline" className="self-start" onClick={() => setVibe(3)}>
          Set the vibe
        </Button>
      )}
      <Textarea aria-label="Your thoughts" placeholder="What stood out tonight?" value={text} onChange={(e) => setText(e.target.value)} rows={3} />
      {!j.fresh && (
        <Field>
          <FieldLabel>Played on</FieldLabel>
          <DateField value={toDate(date)} onValueChange={(d) => setDate(fromDate(d) || date)} />
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={save}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          {j.fresh ? 'Skip' : 'Cancel'}
        </Button>
        {j.fresh ? (
          <Button size="sm" variant="ghost" onClick={drop}>
            Undo
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
            Delete this play
          </Button>
        )}
      </div>
      <Confirm open={confirm} title="Delete this play?" yes="Delete" onYes={drop} onClose={() => setConfirm(false)} />
    </div>
  )
}

export function Listening({ r }: { r: Rec }) {
  const { canEdit } = useRuntime()
  const [journal, setJournal] = useState<Journal | null>(null)
  const months = playMonths(r)
  const cur = today().slice(0, 7)
  const [open, setOpen] = useState<string[]>(() => [months.some((m) => m.month === cur) ? cur : months[0]?.month].filter(Boolean))
  // by position too: two whole-album plays on one day have the same date and text
  const isOpen = (p: Play) => !!journal && journal.ref.i === p.ref.i && journal.ref.d === p.ref.d && journal.ref.t === p.ref.t
  const openJournal = (j: Journal) => {
    setJournal(j)
    const m = j.ref.d?.slice(0, 7) ?? ''
    setOpen((o) => (o.includes(m) ? o : [...o, m]))
  }

  return (
    <div className="flex flex-col gap-6">
      {canEdit && <LogCard r={r} onLogged={openJournal} />}
      {!months.length ? (
        <p className="text-foreground-muted text-sm">No plays logged yet.</p>
      ) : (
        <Accordion variant="flush" multiple value={open} onValueChange={(v) => setOpen(v as string[])}>
          {months.map((m) => (
            <AccordionItem key={m.month} value={m.month}>
              <AccordionTrigger>
                <span className="flex w-full items-center justify-between gap-2">
                  <span>{m.name}</span>
                  <span className="text-foreground-muted text-sm font-normal whitespace-nowrap">
                    {m.plays.length} play{m.plays.length > 1 ? 's' : ''} · {fmtH(m.min / 60)} h
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="divide-border flex flex-col divide-y">
                  {m.plays.map((p) => (
                    <li key={p.key} className="py-2 text-sm">
                      {isOpen(p) ? (
                        <JournalEditor key={p.key} r={r} p={p} j={journal!} onDone={() => setJournal(null)} />
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-foreground">{[p.date, p.what, p.setup].filter(Boolean).join(' · ')}</div>
                            {p.vibe > 0 && <div className="text-foreground-muted">{VIBES[p.vibe - 1]}</div>}
                            {p.thoughts && (
                              <p className="text-foreground-muted mt-1 break-words whitespace-pre-line">
                                <Linkify text={p.thoughts} />
                              </p>
                            )}
                          </div>
                          {canEdit && (
                            <Button size="sm" variant="outline" onClick={() => openJournal({ ref: p.ref, fresh: false })}>
                              {p.thoughts || p.vibe ? 'Edit' : '+ Thoughts'}
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  )
}
