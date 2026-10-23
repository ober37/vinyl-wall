import { useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@appica/ui-react/accordion'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@appica/ui-react/tabs'
import {
  fmtH,
  gradeText,
  keyInfo,
  kindOf,
  playDate,
  playMonths,
  pressingText,
  recordTracks,
  runParts,
  shopHref,
  today,
  type Rec,
} from '../model/record'

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

function Listening({ r }: { r: Rec }) {
  const months = playMonths(r)
  const cur = today().slice(0, 7)
  const firstOpen = months.some((m) => m.month === cur) ? cur : months[0]?.month
  if (!months.length) return <p className="text-foreground-muted text-sm">No plays logged yet.</p>
  return (
    <Accordion variant="flush" multiple defaultValue={firstOpen === undefined ? [] : [firstOpen]}>
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
                  <div className="text-foreground">{[p.date, p.what, p.setup].filter(Boolean).join(' · ')}</div>
                  {p.vibe && <div className="text-foreground-muted">{p.vibe}</div>}
                  {p.thoughts && <p className="text-foreground-muted mt-1 whitespace-pre-line">{p.thoughts}</p>}
                </li>
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
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

export function ViewBody({ r }: { r: Rec }) {
  const own = kindOf(r) === 'own'
  const info = keyInfo(r)
  const copy = copyFacts(r)
  const hasTracks = recordTracks(r).length > 0
  const about = info.length > 0 || copy.length > 0 || hasTracks
  const summary = !r.aboutBlocked && r.about?.summary ? String(r.about.summary) : ''
  const tabs = [...(own ? ['listening'] : []), ...(about ? ['about'] : [])]
  return (
    <div className="flex flex-col gap-5">
      {summary && <p className="text-foreground line-clamp-6 text-sm whitespace-pre-line">{summary}</p>}
      {r.why && (
        <blockquote className="border-primary text-foreground-intense border-s-2 ps-4 text-base italic">{r.why}</blockquote>
      )}
      {tabs.length > 0 && (
        <Tabs defaultValue={tabs[0]}>
          {tabs.length > 1 && (
            <TabsList variant="line" size="sm">
              {own && <TabsTrigger value="listening">Listening</TabsTrigger>}
              {about && <TabsTrigger value="about">About</TabsTrigger>}
            </TabsList>
          )}
          {own && (
            <TabsContent value="listening" className="pt-4">
              <Listening r={r} />
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
