import { useState } from 'react'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@appica/ui-react/accordion'
import { Button } from '@appica/ui-react/button'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@appica/ui-react/collapsible'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@appica/ui-react/tabs'
import { albumFacts, gradeText, kindOf, okUrl, playDate, pressingText, recordTracks, runParts, type Rec } from '../model/record'
import { artistOf, LINKS_SHOWN, type Artist } from '../model/artist'
import { discogsLinks } from '../model/orders'
import { shopShown, shopsOf, type Shop } from '../model/shops'
import { aboutPending } from '../model/task'
import { stillCopies } from '../model/copies'
import { gradeShort, ownedRecs, ownedTitle } from '../model/owned'
import { useRuntime } from '../runtime/runtime'
import { Listening } from './Listening'
import { NotesTab, noteCount } from './NotesTab'
import { OrdersView, shopFrom } from './OrderCard'
import { CopiesView } from './Copies'
import { Facts } from './Facts'
import { runtimeRow, Tracks, tracksRow } from './Tracks'
import { Chevron, LinkList, Source } from './Links'
import { hasResearch, ResearchTab, SearchElsewhere, type WantMsg } from './ResearchTab'
import { CopyActions, StatusActions } from './StatusActions'
import { ordersOf } from '../model/copyOrders'

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
  // with a runout, the catalog number sits beside it
  if (r.catalog && !r.matrix) f.push(['Catalog', r.catalog])
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

// Your copy, or Your copies when there are several (#121): each a folded row under its title with its grades beside it,
// one too, all folded to start, each with its own facts and Discogs links
function YourCopies({ r, shops }: { r: Rec; shops: Shop[] }) {
  const C = ownedRecs(r).map((c, i) => ({ c, i, rows: [...copyFacts(c, shops), ...tracksRow(r, c), ...runtimeRow(r, c)] }))
  return (
    <Fieldset>
      <FieldsetLegend>{C.length > 1 ? 'Your copies' : 'Your copy'}</FieldsetLegend>
      <Accordion variant="flush" multiple>
        {C.map(({ c, i, rows }) => (
          <AccordionItem key={i} value={String(i)}>
            <AccordionTrigger className="text-foreground text-sm font-medium">
              <span className="flex w-full flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                <span className="min-w-0">{ownedTitle(c, i)}</span>
                {gradeShort(c) && <span className="text-foreground-muted shrink-0 font-normal">{gradeShort(c)}</span>}
              </span>
            </AccordionTrigger>
            {/* room for a focus ring (its Discogs links), which the fold's clipping would cut */}
            <AccordionContent className="-mx-1 px-1">
              <div className="flex flex-col gap-3 pt-1">
                {rows.length > 0 && <Facts labelCol rows={rows} />}
                <LinkList links={discogsLinks(c)} />
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Fieldset>
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

// the album summary at the top of every sheet, the album's facts under it (#120); with no summary, the facts alone
function Summary({ r }: { r: Rec }) {
  const facts = albumFacts(r).map((l) => (
    <p key={l} className="text-foreground-muted text-sm text-pretty">
      {l}
    </p>
  ))
  const ab = (!r.aboutBlocked && r.about) || {}
  const none = !ab.summary && !r.aboutBlocked && !aboutPending(r) && !!r.aboutAt
  if (!ab.summary && !facts.length && !none) return null
  return (
    <div className="flex flex-col gap-2">
      {ab.summary && <SummaryText ab={ab} />}
      {facts}
      {none && <p className="text-foreground-muted text-xs">Wikipedia has nothing on this album.</p>}
    </div>
  )
}

function SummaryText({ ab }: { ab: NonNullable<Rec['about']> }) {
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
  const copies = ownedRecs(r)
  const copy = copies.length > 1 ? copies : copyFacts(r, shops)
  const hasTracks = recordTracks(r).length > 0
  const artist = artistOf(r, artists)
  const about = copy.length > 0 || hasTracks || !!artist
  const notesN = noteCount(r)
  const notes = canEdit || notesN > 0
  const research = hasResearch(r, canEdit)
  // the copies wanted, and where to look for them: on a hunt, and on other records while copies are still wanted; a
  // viewer sees Pressings only when there are copies
  const still = stillCopies(r).length > 0
  const hunting = k === 'wish' || still
  const pressings = still || (k === 'wish' && canEdit)
  // the Order tab: an ordered record's order and any copy's on order (#139), named Orders when there are several
  const orderN = ordersOf(r).length
  const orders = orderN > 0
  const orderTab = orderN > 1 ? 'Orders' : 'Order'
  // one order for every kind (#115): About, the record's task tab (Listening, Order), Pressings, Notes, Search, Research
  const tabs = [
    ...(about ? ['about'] : []),
    ...(own ? ['listening'] : []),
    ...(orders ? ['order'] : []),
    ...(pressings ? ['pressings'] : []),
    ...(notes ? ['notes'] : []),
    ...(hunting ? ['search'] : []),
    ...(research ? ['research'] : []),
  ]
  // the sheet opens on the record's task tab: Listening, Order, or Pressings on a hunt
  const task = own ? 'listening' : k === 'ordered' ? 'order' : pressings ? 'pressings' : 'search'
  const first = tabs.includes(task) ? task : tabs[0]
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
      {msg && (
        <p role="status" className="text-foreground-muted text-sm">
          {msg}
        </p>
      )}
      {/* the tab bar sits 20px above its panel, closer than appica's default (the owner's call) */}
      {tabs.length > 0 && (
        <Tabs className="gap-5" value={tabs.includes(tab) ? tab : first} onValueChange={(v) => setTab(String(v))}>
          {tabs.length > 1 && (
            <TabsList variant="line" size="sm" activateOnFocus>
              {about && <TabsTrigger value="about">About</TabsTrigger>}
              {own && <TabsTrigger value="listening">Listening</TabsTrigger>}
              {orders && <TabsTrigger value="order">{orderTab}</TabsTrigger>}
              {pressings && <TabsTrigger value="pressings">Pressings</TabsTrigger>}
              {notes && <TabsTrigger value="notes">Notes</TabsTrigger>}
              {hunting && <TabsTrigger value="search">Search</TabsTrigger>}
              {research && <TabsTrigger value="research">Research</TabsTrigger>}
            </TabsList>
          )}
          {about && (
            <TabsContent value="about" className="flex flex-col gap-8">
              {hasTracks && (
                <Fieldset>
                  <FieldsetLegend>Tracklist</FieldsetLegend>
                  <Tracks r={r} />
                </Fieldset>
              )}
              {copy.length > 0 && <YourCopies r={r} shops={shops} />}
              {artist && (
                <Fieldset>
                  <FieldsetLegend>About the artist</FieldsetLegend>
                  <ArtistAbout key={r.id} A={artist} />
                </Fieldset>
              )}
            </TabsContent>
          )}
          {own && (
            <TabsContent value="listening">
              {titled('Listening', <Listening r={r} />)}
            </TabsContent>
          )}
          {orders && (
            <TabsContent value="order">
              {titled(orderTab, <OrdersView r={r} shops={shops} onMoved={canEdit ? onMoved : undefined} />)}
            </TabsContent>
          )}
          {pressings && (
            <TabsContent value="pressings" className="flex flex-col gap-6">
              {canEdit && k === 'wish' && <StatusActions key={"status" + r.id + k} r={r} onMoved={onMoved} />}
              <CopiesView
                r={r}
                onEditCopy={canEdit ? onEditCopy : undefined}
                shops={shops}
                got={canEdit && k !== 'wish' ? (ci) => <CopyActions key={r.id + ci} r={r} ci={ci} onMoved={onMoved} onOrdered={() => setTab('order')} /> : undefined}
              />
            </TabsContent>
          )}
          {notes && (
            <TabsContent value="notes">
              {titled('Notes', <NotesTab r={r} />)}
            </TabsContent>
          )}
          {hunting && (
            <TabsContent value="search">
              {titled('Search elsewhere', <SearchElsewhere r={r} shops={shops} />)}
            </TabsContent>
          )}
          {research && (
            <TabsContent value="research">
              <ResearchTab r={r} onEditCopy={onEditCopy} want={want} setWant={setWant} lone={lone} />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  )
}
