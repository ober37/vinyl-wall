import { useMemo, useState } from 'react'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@appica/ui-react/accordion'
import { Button } from '@appica/ui-react/button'
import { Checkbox } from '@appica/ui-react/checkbox'
import { CheckboxGroup } from '@appica/ui-react/checkbox-group'
import { DateField } from '@appica/ui-react/date-field'
import { Field, FieldLabel } from '@appica/ui-react/field'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@appica/ui-react/select'
import { Slider } from '@appica/ui-react/slider'
import { Textarea } from '@appica/ui-react/textarea'
import { fromDate, toDate } from '../model/dates'
import { deleteNote, notesOf, type NoteRef } from '../model/notes'
import { gearForPlay, gearOfPlay, lastSetup, loggedText, offText, playMoved, playOff, rememberSetup, setupName, sortSetups } from '../model/gear'
import { collapsePick, lastCopy, playMin, playNote, recordSides, saveJournal, sideOf, VIBES, type PlayKind } from '../model/plays'
import { ownedRecs, ownedTitle } from '../model/owned'
import { fmtH, playDate, playMonths, recordTracks, today, type Play, type Rec } from '../model/record'
import { playStats } from '../model/stats'
import { useRuntime } from '../runtime/runtime'
import { Confirm } from './Confirm'
import { Linkify } from './Linkify'
import { Segmented } from './Segmented'

// the play whose journal is open; fresh = just logged (Skip and Undo instead of a date and Delete), with what it put on the gear
type Journal = { ref: NoteRef; fresh: boolean; msg?: string }
// the open journal of each record, kept when its sheet closes (production's journalOpen), so a play just logged still
// offers Undo when the record is opened again
const journals = new Map<string, Journal>()

// a choice from a list, as Played on and Which copy are
function Pick({ label, value, set, items }: { label: string; value: string; set: (v: string) => void; items: { value: string; label: string }[] }) {
  return (
    <Field className="max-w-xs">
      <FieldLabel>{label}</FieldLabel>
      <Select value={value} onValueChange={(v) => set(String(v))} items={items}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((x) => (
            <SelectItem key={x.value} value={x.value}>
              {x.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

function LogCard({ r, onLogged }: { r: Rec; onLogged: (j: Journal) => void }) {
  const { mutate, gear, setups, saveGear } = useRuntime()
  // with several copies you own, which one was played (the last one logged to start): its tracks, sides and runtime (#138)
  const copies = ownedRecs(r)
  const names = copies.map((c, i) => ownedTitle(c, i))
  const several = copies.length > 1
  const [chosen, setCi] = useState(() => lastCopy(r, names))
  // (a copy removed since goes back to the first)
  const ci = chosen < copies.length ? chosen : 0
  const rc = several ? copies[ci] : r
  const T = recordTracks(rc)
  const S = sortSetups(setups)
  // with two setups or more, which one it was played on (the last one used, remembered on this device)
  const [on, setOn] = useState(() => lastSetup(setups))
  const [kind, setKind] = useState<PlayKind>('full')
  const [side, setSide] = useState(recordSides(rc)[0])
  const [picks, setPicks] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const sides = [...new Set(T.map((t) => sideOf(t.pos)))]
  const bySide = sides.length && sides.every(Boolean) ? sides : ['']

  const log = async () => {
    const c = collapsePick(rc, kind, side, picks)
    // a wall with setups names the one it was played on, even when there's only one
    const setup = S.length > 1 && S.some((x) => x.id === on) ? on : S[0]?.id || ''
    if (S.length > 1) rememberSetup(setup)
    const note = playNote(rc, c.kind, c.side, c.tracks, setup ? setupName(S, setup) : '', several ? names[ci] : '')
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
      // back to Whole album, so the tracklist folds and the play just logged is in reach
      setKind('full')
      const min = playMin(rc, c.kind, c.tracks)
      const hits = gearForPlay(gear, S, setup, r, min)
      // each piece's minutes and plays are added to it as it is when its write is made
      hits.forEach((x) => saveGear(x.g.id, (g) => g && gearForPlay([g], S, setup, r, min)[0]?.data))
      onLogged({ ref: { i, d: note.d, t: note.t }, fresh: true, msg: loggedText(min, hits.map((x) => ({ ...x.g, ...x.data }))) })
    }
  }

  // another copy's positions aren't this one's: its ticks go, and its first side is chosen
  const pickCopy = (v: string) => {
    const i = +v
    setCi(i)
    setPicks([])
    setSide(recordSides(copies[i])[0])
    if (!recordTracks(copies[i]).length && kind === 'tracks') setKind('full')
  }
  const played = S.length > 1 && (
    <Pick label="Played on" value={S.some((x) => x.id === on) ? on : S[0].id} set={setOn} items={S.map((x) => ({ value: x.id, label: x.name || 'Untitled setup' }))} />
  )
  return (
    <Fieldset>
      <FieldsetLegend>Log a play</FieldsetLegend>
      {/* which copy decides everything under it, so it comes first, with Played on beside it from sm */}
      {several && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Pick label="Which copy" value={String(ci)} set={pickCopy} items={names.map((n, i) => ({ value: String(i), label: n }))} />
          {played}
        </div>
      )}
      {/* the choice and its action on one row, kept at the top of the sheet while the card is on screen, so the button
          stays in reach down a long tracklist; with Tracks chosen it shows once a track is ticked, with the count. On a
          phone the choices take the width and the button its own row under them */}
      <div className="bg-background sticky top-0 z-10 -mx-6 flex flex-col gap-2 px-6 py-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="sm:min-w-0 sm:flex-1">
          <Segmented
            label="What you played"
            value={kind}
            onChange={setKind}
            options={[['full', 'Whole album'], ['side', 'Side'], ...(T.length ? [['tracks', 'Tracks'] as [PlayKind, string]] : [])]}
          />
        </div>
        {(kind !== 'tracks' || picks.length > 0) && (
          <Button className="sm:shrink-0" disabled={busy} onClick={log}>
            {kind !== 'tracks' ? 'Log play' : `Log ${picks.length} track${picks.length > 1 ? 's' : ''}`}
          </Button>
        )}
      </div>
      {kind === 'side' && (
        <Segmented label="Which side" value={side} onChange={setSide} options={recordSides(rc).map((s) => [s, 'Side ' + s])} />
      )}
      {/* a copy after the first without a tracklist of its own ticks the album's, and says so */}
      {kind === 'tracks' && !picks.length && (
        <p className="text-foreground-muted text-sm">
          {ci > 0 && several && rc.about?.tracksSource !== 'copy' ? "Tick the tracks you played, from the album's tracklist." : 'Tick the tracks you played.'}
        </p>
      )}
      {kind === 'tracks' && (
        <CheckboxGroup aria-label="Tracks" value={picks} onValueChange={(v) => setPicks(v as string[])} className="gap-3">
          {bySide.map((sd) => (
            <div key={sd} className="flex flex-col gap-2">
              {sd && <span className="text-foreground-muted text-xs font-medium">Side {sd}</span>}
              {T.filter((t) => !sd || sideOf(t.pos) === sd).map((t) => (
                // clear of the sticky row when a checkbox takes focus
                <label key={t.pos} className="text-foreground flex scroll-mt-16 items-start gap-2 text-sm">
                  <Checkbox value={t.pos} className="mt-0.5" />
                  <span>
                    {/* its number on the side ("1 - So What"), or its position when the tracks have no sides */}
                    {trackNum(t.pos, sd)}
                    {t.title} {t.dur && <span className="text-foreground-muted">{t.dur}</span>}
                  </span>
                </label>
              ))}
            </div>
          ))}
        </CheckboxGroup>
      )}
      {!several && played}
    </Fieldset>
  )
}

function JournalEditor({ r, p, j, onDone }: { r: Rec; p: Play; j: Journal; onDone: () => void }) {
  const { mutate, gear, saveGear } = useRuntime()
  const [vibe, setVibe] = useState(p.vibe)
  const [text, setText] = useState(p.thoughts)
  const [date, setDate] = useState(p.day)
  const [confirm, setConfirm] = useState(false)
  const gone = () => {
    throw new Error('This play changed elsewhere. Try again.')
  }
  // the gear entries holding this play's minutes: a new date moves them, deleting the play takes them off
  const hits = useMemo(() => gearOfPlay(gear, r.id, j.ref), [gear, r.id, j.ref])
  const save = () =>
    mutate(r.id, (latest) => ({ notes: saveJournal(latest, j.ref, { text, vibe, date: j.fresh ? undefined : date }) ?? gone() })).then((ok) => {
      if (!ok) return
      if (!j.fresh && date !== p.day && /^\d{4}-\d\d-\d\d$/.test(date)) hits.forEach((x) => saveGear(x.g.id, (g) => g && playMoved(g, x.k, date)))
      onDone()
    })
  const drop = () =>
    mutate(r.id, (latest) => ({ notes: deleteNote(latest, j.ref) ?? gone() })).then((ok) => {
      if (!ok) return
      hits.forEach((x) => saveGear(x.g.id, (g) => g && playOff(g, x.k, x.m)))
      onDone()
    })

  return (
    <div className="bg-background-muted flex flex-col gap-3 rounded-md p-3">
      <div className="flex flex-col gap-2">
        <div className="text-foreground text-sm">{[p.date, p.what, p.setup].filter(Boolean).join(' · ')}</div>
        {j.fresh && j.msg && (
          <p role="status" className="text-foreground-muted text-xs">
            {j.msg}
          </p>
        )}
      </div>
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
      <Textarea className="field-sizing-content max-h-80" aria-label="Your thoughts" placeholder="What stood out tonight?" value={text} onChange={(e) => setText(e.target.value)} rows={3} />
      {!j.fresh && (
        <Field>
          <FieldLabel>Played on</FieldLabel>
          <DateField value={toDate(date)} onValueChange={(d) => setDate(fromDate(d) || date)} />
        </Field>
      )}
      <div className="flex flex-wrap gap-3">
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
      <Confirm open={confirm} title={'Delete this play?' + offText(hits)} yes="Delete" onYes={drop} onClose={() => setConfirm(false)} />
    </div>
  )
}

// the record's plays at a glance, once it has any: two by two on phones, one row of four from sm up
function StatsRow({ r }: { r: Rec }) {
  const S = playStats(r)
  if (!S.count) return null
  const cells: [string, string | number][] = [
    ['Plays', S.count],
    ['Hours', fmtH(S.min / 60)],
    ['This month', S.month],
    ['Last', S.last ? playDate(S.last) : ''],
  ]
  return (
    <dl className="grid grid-cols-2 gap-x-2 gap-y-4 sm:grid-cols-4">
      {cells.map(([k, v]) => (
        <div key={k} className="flex min-w-0 flex-col gap-1">
          <dt className="text-foreground-muted font-mono text-[0.6875rem] tracking-wider uppercase">{k}</dt>
          <dd className="text-foreground-intense text-lg leading-tight font-semibold break-words tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

const trackNum = (pos: unknown, side: string) => {
  const n = side ? String(pos || '').replace(/^[A-Z]+/, '') : String(pos || '')
  return n ? n + ' - ' : ''
}

export function Listening({ r }: { r: Rec }) {
  const { canEdit } = useRuntime()
  const [journal, keepJournal] = useState<Journal | null>(() => journals.get(r.id) ?? null)
  const setJournal = (j: Journal | null) => {
    if (j) journals.set(r.id, j)
    else journals.delete(r.id)
    keepJournal(j)
  }
  const copies = ownedRecs(r)
  const months = playMonths(
    r,
    copies.map((c, i): [string, Rec] => [ownedTitle(c, i), c]),
  )
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
      <StatsRow r={r} />
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
              {/* room for a focused Edit's ring, which the panel would otherwise clip */}
              <AccordionContent className="-mx-1 px-1">
                <ul className="divide-(--line) flex flex-col divide-y">
                  {m.plays.map((p) => (
                    <li key={p.key} className="py-2 text-sm">
                      {isOpen(p) ? (
                        <JournalEditor key={p.key} r={r} p={p} j={journal!} onDone={() => setJournal(null)} />
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-foreground">
                              <span aria-hidden="true" className="text-foreground-muted me-1.5 text-xs">
                                {p.icon}
                              </span>
                              {[p.date, p.what, p.setup].filter(Boolean).join(' · ')}
                            </div>
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
