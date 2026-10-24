import { useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@appica/ui-react/tabs'
import { gradeText, keyInfo, kindOf, okUrl, playDate, pressingText, recordTracks, runParts, shopHref, type Rec } from '../model/record'
import { aboutPending } from '../model/task'
import { useRuntime } from '../runtime/runtime'
import { Listening } from './Listening'
import { NotesTab, noteCount } from './NotesTab'
import { CopiesView } from './Copies'
import { Facts } from './Facts'
import { hasResearch, ResearchTab } from './ResearchTab'
import { StatusActions } from './StatusActions'

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

// The album summary at the top of the sheet, as production shows it: a short lede with More for the rest (after the first
// blank line), or one older block clamped to 3 lines; its source beside More. While it's being looked up, or when
// Wikipedia had nothing, a line says so in its place.
function Summary({ r }: { r: Rec }) {
  const [open, setOpen] = useState(false)
  if (r.aboutBlocked) return null
  const ab = r.about || {}
  if (!ab.summary)
    return aboutPending(r) ? (
      <p role="status" className="text-foreground-muted flex items-center gap-2 text-xs">
        <span aria-hidden="true" className="bg-brass motion-safe:animate-pulse-dot size-1.75 shrink-0 rounded-full" />
        Looking up the album. This can take a minute or two.
      </p>
    ) : r.aboutAt ? (
      <p className="text-foreground-muted text-xs">Wikipedia has nothing on this album.</p>
    ) : null
  const txt = String(ab.summary).trim()
  const k = txt.search(/\n\s*\n/)
  const lede = k < 0 ? txt : txt.slice(0, k).trim()
  const rest = k < 0 ? '' : txt.slice(k).trim()
  const long = rest ? true : txt.length > 220
  const wiki = okUrl(ab.wiki)
  const via = typeof ab.via === 'string' ? ab.via : ''
  return (
    <div className="flex flex-col gap-1">
      {rest ? (
        <>
          <p className="text-foreground text-sm text-pretty">{lede}</p>
          {open && <p className="text-foreground mt-2 text-sm whitespace-pre-line text-pretty">{rest}</p>}
        </>
      ) : (
        <p className={`text-foreground text-sm text-pretty ${long && !open ? 'line-clamp-3' : ''}`}>{txt}</p>
      )}
      <div className="flex flex-wrap items-baseline gap-3">
        {long && (
          <Button size="sm" variant="ghost" className="-ms-3" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? 'Less' : 'More'}
          </Button>
        )}
        <span className="text-foreground-muted text-xs">
          Summary by Claude
          {wiki && (
            <>
              {' · '}
              {via ? 'from ' : ''}
              <a href={wiki} target="_blank" rel="noopener" className="text-primary whitespace-nowrap hover:underline">
                {via ? via + ' on ' : ''}Wikipedia ↗
              </a>
            </>
          )}
        </span>
      </div>
    </div>
  )
}

export function ViewBody({ r, msg, onMoved, onAddWhy, onEditCopy }: {
  r: Rec
  msg: string
  onMoved: (msg: string) => void
  onAddWhy: () => void
  // + Want's Edit: edit mode, in that copy
  onEditCopy: (ci: number) => void
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
  const research = hasResearch(r, canEdit)
  const tabs = [...(own ? ['listening'] : []), ...(research ? ['research'] : []), ...(notes ? ['notes'] : []), ...(about ? ['about'] : [])]
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
      <Summary key={r.id} r={r} />
      {r.why ? (
        <blockquote className="border-primary text-foreground-intense border-s-2 ps-4 text-base italic">{r.why}</blockquote>
      ) : (
        canEdit && (
          <Button variant="soft" className="h-auto justify-start py-3 text-start whitespace-normal" onClick={onAddWhy}>
            {own ? 'Why is this one on the wall? Add a few words…' : 'Why do you want this one? Add a few words…'}
          </Button>
        )
      )}
      {k === 'wish' && <CopiesView r={r} />}
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
              {research && <TabsTrigger value="research">Research</TabsTrigger>}
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
          {research && (
            <TabsContent value="research" className="pt-4">
              <ResearchTab r={r} onEditCopy={onEditCopy} />
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
