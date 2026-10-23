import { useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@appica/ui-react/tabs'
import { gradeText, keyInfo, kindOf, playDate, pressingText, recordTracks, runParts, shopHref, type Rec } from '../model/record'
import { useRuntime } from '../runtime/runtime'
import { Listening } from './Listening'
import { NotesTab, noteCount } from './NotesTab'
import { StatusActions } from './StatusActions'

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-foreground-muted">{k}</dt>
          <dd className="text-foreground min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

// Your copy (owned records): pressing, where and when it was bought, grade, runout
function copyFacts(r: Rec): [string, React.ReactNode][] {
  if (kindOf(r) !== 'own') return []
  const f: [string, React.ReactNode][] = []
  const p = pressingText(r)
  if (p) f.push(['Pressing', <span className="whitespace-pre-line">{p}</span>])
  const href = shopHref(r.shopUrl)
  const shop = href ? (
    <a href={href} target="_blank" rel="noopener" className="text-primary underline-offset-2 hover:underline">
      {r.shop || new URL(href).hostname.replace(/^www\./, '')} ↗
    </a>
  ) : (
    r.shop
  )
  const bought = [r.acquired ? playDate(r.acquired) : '', shop, r.paid ? '$' + r.paid : ''].filter(Boolean)
  if (bought.length)
    f.push([
      'Bought',
      bought.map((b, i) => (
        <span key={i}>
          {i ? ' · ' : ''}
          {b}
        </span>
      )),
    ])
  const g = gradeText(r)
  if (g) f.push(['Grade', g])
  const runs = runParts(r.matrix)
  if (runs.length)
    f.push([
      'Runout',
      runs.map((x) => (
        <div key={x} className="font-mono text-xs">
          {x}
        </div>
      )),
    ])
  return f
}

function Tracks({ r }: { r: Rec }) {
  const T = recordTracks(r)
  const [all, setAll] = useState(false)
  if (!T.length) return null
  const shown = all || T.length <= 12 ? T : T.slice(0, 8)
  return (
    <>
      <ol className="flex flex-col gap-1 text-sm">
        {shown.map((t, i) => (
          <li key={i} className="grid grid-cols-[2.5rem_1fr_auto] gap-2">
            <span className="text-foreground-muted font-mono text-xs leading-5">{t.pos}</span>
            <span className="text-foreground">{t.title}</span>
            <span className="text-foreground-muted font-mono text-xs leading-5">{t.dur}</span>
          </li>
        ))}
      </ol>
      {shown.length < T.length && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setAll(true)}>
          Show all {T.length} tracks
        </Button>
      )}
    </>
  )
}

export function ViewBody({ r, msg, onMoved, onAddWhy }: {
  r: Rec
  msg: string
  onMoved: (msg: string) => void
  onAddWhy: () => void
}) {
  const { canEdit } = useRuntime()
  const k = kindOf(r)
  const own = k === 'own'
  const info = keyInfo(r)
  const copy = copyFacts(r)
  const hasTracks = recordTracks(r).length > 0
  const about = info.length > 0 || copy.length > 0 || hasTracks
  const notesN = noteCount(r)
  const notes = canEdit || notesN > 0
  const summary = !r.aboutBlocked && r.about?.summary ? String(r.about.summary) : ''
  const tabs = [...(own ? ['listening'] : []), ...(notes ? ['notes'] : []), ...(about ? ['about'] : [])]
  // with no tab bar, a lone tab's content gets its own heading (About's sections already have theirs)
  const titled = (name: string, node: React.ReactNode) =>
    tabs.length === 1 ? (
      <Fieldset>
        <FieldsetLegend>{name}</FieldsetLegend>
        {node}
      </Fieldset>
    ) : (
      node
    )
  return (
    <div className="flex flex-col gap-5">
      {summary && <p className="text-foreground line-clamp-6 text-sm whitespace-pre-line">{summary}</p>}
      {r.why ? (
        <blockquote className="border-primary text-foreground-intense border-s-2 ps-4 text-base italic">{r.why}</blockquote>
      ) : (
        canEdit && (
          <Button variant="soft" className="h-auto justify-start py-3 text-start whitespace-normal" onClick={onAddWhy}>
            {own ? 'Why is this one on the wall? Add a few words…' : 'Why do you want this one? Add a few words…'}
          </Button>
        )
      )}
      {canEdit && <StatusActions key={"status" + r.id + k} r={r} onMoved={onMoved} />}
      {msg && (
        <p role="status" className="text-foreground-muted text-sm">
          {msg}
        </p>
      )}
      {tabs.length > 0 && (
        <Tabs key={"tabs" + r.id + k} defaultValue={tabs[0]}>
          {tabs.length > 1 && (
            <TabsList variant="line" size="sm">
              {own && <TabsTrigger value="listening">Listening</TabsTrigger>}
              {notes && (
                <TabsTrigger value="notes">
                  Notes{notesN > 0 && <span className="text-foreground-muted ms-1">{notesN}</span>}
                </TabsTrigger>
              )}
              {about && <TabsTrigger value="about">About</TabsTrigger>}
            </TabsList>
          )}
          {own && (
            <TabsContent value="listening" className="pt-4">
              {titled('Listening', <Listening r={r} />)}
            </TabsContent>
          )}
          {notes && (
            <TabsContent value="notes" className="pt-4">
              {titled('Notes', <NotesTab r={r} />)}
            </TabsContent>
          )}
          {about && (
            <TabsContent value="about" className="flex flex-col gap-6 pt-4">
              {info.length > 0 && (
                <Fieldset>
                  <FieldsetLegend>About the album</FieldsetLegend>
                  <Facts rows={info} />
                </Fieldset>
              )}
              {copy.length > 0 && (
                <Fieldset>
                  <FieldsetLegend>Your copy</FieldsetLegend>
                  <Facts rows={copy} />
                </Fieldset>
              )}
              {hasTracks && (
                <Fieldset>
                  <FieldsetLegend>Tracklist</FieldsetLegend>
                  <Tracks r={r} />
                </Fieldset>
              )}
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  )
}
