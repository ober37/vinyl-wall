import { Fragment, useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@appica/ui-react/collapsible'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@appica/ui-react/tabs'
import { gradeText, keyInfo, kindOf, okUrl, playDate, pressingText, recordTracks, runParts, type Rec } from '../model/record'
import { artistOf, LINKS_SHOWN, type Artist } from '../model/artist'
import { discogsLinks } from '../model/orders'
import { shopShown, shopsOf, type Shop } from '../model/shops'
import { sideOf, trackSecs } from '../model/plays'
import { aboutPending } from '../model/task'
import { useRuntime } from '../runtime/runtime'
import { Listening } from './Listening'
import { NotesTab, noteCount } from './NotesTab'
import { OrderCard, shopFrom } from './OrderCard'
import { CopiesView } from './Copies'
import { Facts } from './Facts'
import { Chevron, LinkList, Source } from './Links'
import { hasResearch, ResearchTab, type WantMsg } from './ResearchTab'
import { StatusActions } from './StatusActions'

// Your copy (owned records): pressing, where and when it was bought, grade, runout
function copyFacts(r: Rec, shops: Shop[]): [string, React.ReactNode][] {
  if (kindOf(r) !== 'own') return []
  const f: [string, React.ReactNode][] = []
  const p = pressingText(r)
  if (p) f.push(['Pressing', <span className="whitespace-pre-line">{p}</span>])
  const from = shopFrom(r, shopShown(r, shops))
  const bought = [r.acquired ? playDate(r.acquired) : '', from.name, r.paid ? '$' + r.paid : ''].filter(Boolean)
  if (bought.length)
    f.push([
      'Bought',
      <>
        {bought.map((b, i) => (
          <span key={i}>
            {i ? ' · ' : ''}
            {b}
          </span>
        ))}
        {from.reach}
      </>,
    ])
  const g = gradeText(r)
  if (g) f.push(['Grade', g])
  const runs = runParts(r.matrix)
  if (runs.length)
    f.push([
      'Runout',
      <Collapsible>
        <CollapsibleTrigger className="group text-foreground inline-flex items-center gap-1 text-start underline decoration-dotted underline-offset-2">
          <span>
            {runs.length > 1 ? runs.length + ' sides' : 'Show'}
            {r.catalog && <span className="text-foreground-muted"> · Cat. {r.catalog}</span>}
          </span>
          <Chevron className="size-3.5 shrink-0" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-1">
          {runs.map((x) => (
            <div key={x} className="font-mono text-xs">
              {x}
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>,
    ])
  return f
}

function Tracks({ r }: { r: Rec }) {
  const T = recordTracks(r)
  const [all, setAll] = useState(false)
  if (!T.length) return null
  const shown = all || T.length <= 12 ? T : T.slice(0, 8)
  // by side when every position reads A1, B2…, each side with its running time
  const sided = T.every((t) => sideOf(t.pos))
  const sideTime = (s: string) => {
    const n = T.filter((t) => sideOf(t.pos) === s).reduce((n, t) => n + trackSecs(t.dur), 0)
    return n ? ` · ${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}` : ''
  }
  const ab = r.about || {}
  const src = okUrl(ab.tracksUrl)
  const srcName = ab.tracksSource === 'discogs' ? 'your Discogs pressing' : 'MusicBrainz'
  return (
    <>
      <ol className="flex flex-col gap-1 text-sm">
        {shown.map((t, i) => (
          <Fragment key={i}>
            {sided && sideOf(t.pos) !== sideOf(shown[i - 1]?.pos) && (
              // a side's heading, not a track: screen readers count only the tracks
              <li role="presentation" className={`text-foreground-muted font-mono text-xs tracking-wider uppercase ${i ? 'pt-3' : ''}`}>
                Side {sideOf(t.pos)}
                {sideTime(sideOf(t.pos))}
              </li>
            )}
            <li className="grid grid-cols-[2.5rem_1fr_auto] gap-2">
              <span className="text-foreground-muted font-mono text-xs leading-5">{t.pos}</span>
              <span className="text-foreground">{t.title}</span>
              <span className="text-foreground-muted font-mono text-xs leading-5">{t.dur}</span>
            </li>
          </Fragment>
        ))}
      </ol>
      {shown.length < T.length && (
        <Button variant="ghost" size="sm" className="-ms-4 self-start" onClick={() => setAll(true)}>
          Show all {T.length} tracks
        </Button>
      )}
      <p className="text-foreground-muted text-xs">
        From <Source name={srcName} href={src} />
      </p>
    </>
  )
}

// The album summary at the top of the sheet, as production shows it: a short lede with More for the rest (after the first
// blank line), or one older block clamped to 3 lines; its source beside More. When Wikipedia had nothing, a line says so
// in its place (while it's being looked up, the header's lookup line says so).
// a summary: its short lede, and More for the detail after the first blank line; a summary in one block (older lookups)
// over clampAt characters clamps to 3 lines instead
function Blurb({ text, clampAt, credit }: { text: string; clampAt: number; credit: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const txt = text.trim()
  const k = txt.search(/\n\s*\n/)
  const lede = k < 0 ? txt : txt.slice(0, k).trim()
  const rest = k < 0 ? '' : txt.slice(k).trim()
  const long = !!rest || txt.length > clampAt
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
          <Button size="sm" variant="ghost" className="-ms-4 -me-4" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? 'Less' : 'More'}
          </Button>
        )}
        <span className="text-foreground-muted text-xs">{credit}</span>
      </div>
    </div>
  )
}

// the album summary at the top of every sheet
function Summary({ r }: { r: Rec }) {
  if (r.aboutBlocked) return null
  const ab = r.about || {}
  if (!ab.summary)
    return aboutPending(r) ? null : r.aboutAt ? (
      <p className="text-foreground-muted text-xs">Wikipedia has nothing on this album.</p>
    ) : null
  const wiki = okUrl(ab.wiki)
  const via = typeof ab.via === 'string' ? ab.via : ''
  return (
    <Blurb
      text={String(ab.summary)}
      clampAt={220}
      credit={
        <>
          Summary by Claude
          {wiki && (
            <>
              {' · '}
              {via ? 'from ' : ''}
              <Source name={(via ? via + ' on ' : '') + 'Wikipedia'} href={wiki} />
            </>
          )}
        </>
      }
    />
  )
}

// About the artist: the name, its summary with the credit, and the artist's own links (the first few, then Show all)
function ArtistAbout({ A }: { A: Artist }) {
  const [all, setAll] = useState(false)
  const src = A.credit === 'discogs' ? 'Discogs' : 'Wikipedia'
  const credit =
    A.credit === 'claude' ? (
      <>
        Summary by Claude
        {A.wiki && (
          <>
            {' · '}
            <Source name="Wikipedia" href={A.wiki} />
          </>
        )}
      </>
    ) : (
      <>
        From <Source name={src} href={A.wiki} />
      </>
    )
  const shown = all ? A.links : A.links.slice(0, LINKS_SHOWN)
  return (
    <>
      <div className="flex flex-col gap-2">
        <h4 className="text-foreground-intense text-sm font-medium">{A.name}</h4>
        {A.summary && <Blurb text={A.summary} clampAt={180} credit={credit} />}
      </div>
      {A.links.length > 0 && (
        <div className="flex flex-col gap-1">
          <LinkList links={shown} />
          {shown.length < A.links.length && (
            <Button variant="ghost" size="sm" className="-ms-4 self-start" onClick={() => setAll(true)}>
              Show all {A.links.length} links
            </Button>
          )}
        </div>
      )}
    </>
  )
}

export function ViewBody({ r, msg, onMoved, onAddWhy, onEditCopy, want, setWant, tab, setTab }: {
  r: Rec
  msg: string
  onMoved: (msg: string) => void
  onAddWhy: () => void
  // + Want's Edit: edit mode, in that copy
  onEditCopy: (ci: number) => void
  want: WantMsg | null
  setWant: (w: WantMsg | null) => void
  // the tab chosen, '' for the record's first (its task tab)
  tab: string
  setTab: (t: string) => void
}) {
  const { canEdit, artists, settings } = useRuntime()
  const shops = shopsOf(settings)
  const k = kindOf(r)
  const own = k === 'own'
  const info = keyInfo(r)
  const copy = copyFacts(r, shops)
  const hasTracks = recordTracks(r).length > 0
  const artist = artistOf(r, artists)
  const about = info.length > 0 || copy.length > 0 || hasTracks || !!artist
  const notesN = noteCount(r)
  const notes = canEdit || notesN > 0
  const research = hasResearch(r, canEdit)
  const tabs = [...(own ? ['listening'] : []), ...(k === 'ordered' ? ['order'] : []), ...(research ? ['research'] : []), ...(notes ? ['notes'] : []), ...(about ? ['about'] : [])]
  // with no tab bar, a lone tab's content gets its own heading (About's sections already have theirs)
  const lone = tabs.length === 1
  const titled = (name: string, node: React.ReactNode) =>
    lone ? (
      <Fieldset>
        <FieldsetLegend>{name}</FieldsetLegend>
        {node}
      </Fieldset>
    ) : (
      node
    )
  return (
    <div className="flex flex-col gap-6">
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
      {k === 'wish' && <CopiesView r={r} onEditCopy={canEdit ? onEditCopy : undefined} />}
      {canEdit && <StatusActions key={"status" + r.id + k} r={r} onMoved={onMoved} />}
      {msg && (
        <p role="status" className="text-foreground-muted text-sm">
          {msg}
        </p>
      )}
      {/* the tab bar sits 20px above its panel, closer than appica's default (the owner's call) */}
      {tabs.length > 0 && (
        <Tabs className="gap-5" value={tabs.includes(tab) ? tab : tabs[0]} onValueChange={(v) => setTab(String(v))}>
          {tabs.length > 1 && (
            <TabsList variant="line" size="sm" activateOnFocus>
              {own && <TabsTrigger value="listening">Listening</TabsTrigger>}
              {k === 'ordered' && <TabsTrigger value="order">Order</TabsTrigger>}
              {research && <TabsTrigger value="research">Research</TabsTrigger>}
              {notes && (
                <TabsTrigger value="notes">
                  Notes
                  {notesN > 0 && (
                    <>
                      {' '}
                      <span className="text-foreground-muted">{notesN}</span>
                    </>
                  )}
                </TabsTrigger>
              )}
              {about && <TabsTrigger value="about">About</TabsTrigger>}
            </TabsList>
          )}
          {own && (
            <TabsContent value="listening">
              {titled('Listening', <Listening r={r} />)}
            </TabsContent>
          )}
          {k === 'ordered' && (
            <TabsContent value="order">
              {titled('Order', <OrderCard r={r} shop={shopShown(r, shops)} />)}
            </TabsContent>
          )}
          {research && (
            <TabsContent value="research">
              <ResearchTab r={r} onEditCopy={onEditCopy} want={want} setWant={setWant} lone={lone} />
            </TabsContent>
          )}
          {notes && (
            <TabsContent value="notes">
              {titled('Notes', <NotesTab r={r} />)}
            </TabsContent>
          )}
          {about && (
            <TabsContent value="about" className="flex flex-col gap-8">
              {info.length > 0 && (
                <Fieldset>
                  <FieldsetLegend>About the album</FieldsetLegend>
                  <Facts labelCol rows={info.map(([k, v]) => [k, <span className="whitespace-pre-line">{v}</span>])} />
                </Fieldset>
              )}
              {copy.length > 0 && (
                <Fieldset>
                  <FieldsetLegend>Your copy</FieldsetLegend>
                  <Facts labelCol rows={copy} />
                  <LinkList links={discogsLinks(r)} />
                </Fieldset>
              )}
              {hasTracks && (
                <Fieldset>
                  <FieldsetLegend>Tracklist</FieldsetLegend>
                  <Tracks r={r} />
                </Fieldset>
              )}
              {artist && (
                <Fieldset>
                  <FieldsetLegend>About the artist</FieldsetLegend>
                  <ArtistAbout key={r.id} A={artist} />
                </Fieldset>
              )}
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  )
}
