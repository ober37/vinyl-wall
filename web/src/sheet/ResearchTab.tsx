import { useState } from 'react'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@appica/ui-react/accordion'
import { Badge } from '@appica/ui-react/badge'
import { Button } from '@appica/ui-react/button'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { stillCopies } from '../model/copies'
import { kindOf, shortDate, type Rec } from '../model/record'
import {
  alreadyWanted, entryKey, firstSentence, pinPatch, pressOf, removeResearchPatch, researchEntries, resPrompt, searchLinks, sourceList,
  strList, undoWantPatch, wantPatch, type Research, type Wanted,
} from '../model/research'
import { useRuntime } from '../runtime/runtime'
import { Confirm } from './Confirm'
import { CopiesView } from './Copies'
import { link, LinkList } from './Links'

// The prompt for Claude, copied; when the clipboard is blocked it shows selected, to copy by hand
type Copied = { key: string; msg: string; text?: string }
function useCopy() {
  const [copied, setCopied] = useState<Copied | null>(null)
  const copy = async (key: string, text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied({ key, msg: done })
    } catch {
      setCopied({ key, msg: "Selected: copy it with your device's copy command", text })
    }
  }
  return { copied, copy }
}
function CopyStatus({ c }: { c: Copied | null }) {
  return (
    <>
      <span role="status" className="text-foreground-muted text-xs">
        {c?.msg}
      </span>
      {c?.text && (
        <p
          ref={(el) => {
            if (!el) return
            const rg = document.createRange()
            rg.selectNodeContents(el)
            getSelection()?.removeAllRanges()
            getSelection()?.addRange(rg)
          }}
          className="bg-background-muted basis-full rounded-(--radius-2xs) p-3 font-mono text-xs whitespace-pre-wrap"
        >
          {c.text}
        </p>
      )}
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-foreground-intense text-xs font-medium tracking-wider uppercase">{title}</h4>
      {children}
    </div>
  )
}
const Bullets = ({ items }: { items: React.ReactNode[] }) => (
  <ul className="text-foreground flex list-disc flex-col gap-1 ps-5 text-sm">
    {items.map((x, i) => (
      <li key={i}>{x}</li>
    ))}
  </ul>
)

// What a hunt's + Want added, with Edit and Undo, until the sheet closes or the next one is added: held by the sheet, so
// Edit, another tab or a remote change doesn't lose the Undo
export type WantMsg = { key: string; undo: Wanted }

// The Research tab, as production's: on owned and ordered records the copies still wanted first; then the research log
// from Claude chats (pinned first and open) with Copy for Claude to start one; then Search elsewhere, on a hunt or while
// copies are still wanted. A reader sees what's there without the buttons.
export function ResearchTab({ r, onEditCopy, want, setWant, lone = false }: {
  r: Rec
  onEditCopy: (ci: number) => void
  want: WantMsg | null
  setWant: (w: WantMsg | null) => void
  // the only tab, so there's no tab bar to name it
  lone?: boolean
}) {
  const { canEdit, settings, mutate } = useRuntime()
  const k = kindOf(r)
  const wish = k === 'wish'
  const items = researchEntries(r)
    .map((e, i) => ({ e, key: entryKey(e, i) }))
    .sort((a, b) => +!!b.e.pinned - +!!a.e.pinned)
  // pinned entries open, and the one just added from, so its Undo shows on coming back from edit mode
  const [open, setOpen] = useState<string[]>(() => [...items.filter((x) => x.e.pinned).map((x) => x.key), ...(want ? [want.key] : [])])
  const [del, setDel] = useState<string | null>(null)
  const { copied, copy } = useCopy()
  const still = stillCopies(r).length > 0

  const pin = (key: string, pinned: boolean) => {
    if (!pinned) setOpen((o) => (o.includes(key) ? o : [...o, key]))
    mutate(r.id, (latest) => pinPatch(latest, key))
  }
  const addWant = (key: string, p: string) => {
    let undo: Wanted | null = null
    mutate(r.id, (latest) => {
      const w = wantPatch(latest, p)
      undo = w.undo
      return w.patch
    }).then((ok) => ok && undo && setWant({ key, undo }))
  }
  const undoWant = () => {
    if (!want) return
    setWant(null)
    mutate(r.id, (latest) => undoWantPatch(latest, want.undo))
  }

  const pressings = (e: Research, key: string) => {
    const L = strList(e.pressings)
    if (!wish || !canEdit) return <Bullets items={L} />
    return (
      <>
        <Bullets
          items={L.map((x) => {
            const p = pressOf(x)
            return (
              <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span>{x}</span>
                {p &&
                  (alreadyWanted(r, x) ? (
                    <span className="text-foreground-muted text-xs whitespace-nowrap">✓ Added</span>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => addWant(key, p)}>
                      + Want
                    </Button>
                  ))}
              </span>
            )
          })}
        />
        {want?.key === key && (
          <p role="status" className="text-foreground-muted flex flex-wrap items-center gap-x-1 text-xs">
            Added “{want.undo.p}” ·
            <Button size="sm" variant="ghost" className="px-1.5" onClick={() => onEditCopy(want.undo.ci)}>
              Edit
            </Button>
            ·
            <Button size="sm" variant="ghost" className="px-1.5" onClick={undoWant}>
              Undo
            </Button>
          </p>
        )}
      </>
    )
  }

  const entry = ({ e, key }: { e: Research; key: string }) => {
    const sm = String(e.summary || '').trim()
    const body = e.headline ? sm : sm.slice(firstSentence(sm).length).trim()
    const src = sourceList(e.sources)
    return (
      <AccordionItem key={key} value={key}>
        <AccordionTrigger className="text-foreground text-sm font-medium">
          <span className="flex min-w-0 items-baseline gap-3">
            <time className="text-foreground-muted shrink-0 font-mono text-xs font-normal">{(e.at && shortDate(e.at)) || e.at || ''}</time>
            <span className="min-w-0">
              {e.pinned && (
                <Badge size="sm" variant="secondary" className="me-2 align-middle">
                  Pinned
                </Badge>
              )}
              {e.headline || firstSentence(e.summary) || 'Research notes'}
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col gap-4 text-sm">
            {e.question && (
              <Section title="You asked">
                <p className="text-foreground">{e.question}</p>
              </Section>
            )}
            {body && <p className="text-foreground text-pretty">{body}</p>}
            {strList(e.pressings).length > 0 && <Section title="Pressings">{pressings(e, key)}</Section>}
            {strList(e.check).length > 0 && (
              <Section title="Check in a listing">
                <Bullets items={strList(e.check)} />
              </Section>
            )}
            {strList(e.where).length > 0 && (
              <Section title="Where to look">
                <Bullets items={strList(e.where)} />
              </Section>
            )}
            {e.price && (
              <Section title="Price">
                <p className="text-foreground">{e.price}</p>
              </Section>
            )}
            {src.length > 0 && (
              <Section title="Sources">
                <Bullets
                  items={src.map((s) => (
                    <a href={s.url} target="_blank" rel="noopener" className={link}>
                      {s.title} ↗
                    </a>
                  ))}
                />
              </Section>
            )}
            {canEdit && (
              <div className="-ms-4 flex flex-wrap items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => pin(key, !!e.pinned)}>
                  {e.pinned ? 'Unpin' : 'Pin'}
                </Button>
                {k !== 'ordered' && (
                  <Button size="sm" variant="ghost" onClick={() => copy(key, resPrompt(r, settings.url, e), 'Copied. Paste it into Claude to pick up from here.')}>
                    Follow up in chat
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="text-error-emphasis -me-4 ms-auto" onClick={() => setDel(key)}>
                  Remove this research
                </Button>
                {copied?.key === key && <CopyStatus c={copied} />}
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {!wish && <CopiesView r={r} onEditCopy={canEdit ? onEditCopy : undefined} />}
      {(canEdit || items.length > 0) && (
        <Fieldset>
          {/* the tab says Research; a heading when the copies still wanted sit above it, or when there's no tab bar */}
          {(lone || (!wish && still)) && <FieldsetLegend>Research</FieldsetLegend>}
          {canEdit && (
            <div className="flex flex-col gap-3">
              <p className="text-foreground-muted text-sm">
                Research this record in your Claude chat. It can search the web, and with the Vinyl Wall skill it saves what it finds here.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  variant={items.length || wish ? 'outline' : 'primary'}
                  onClick={() => copy('new', resPrompt(r, settings.url), 'Copied. Paste it into Claude and add your question.')}
                >
                  Copy for Claude
                </Button>
                {copied?.key === 'new' && <CopyStatus c={copied} />}
              </div>
            </div>
          )}
          {items.length > 0 && (
            <Accordion variant="flush" multiple value={open} onValueChange={(v) => setOpen(v as string[])}>
              {items.map(entry)}
            </Accordion>
          )}
        </Fieldset>
      )}
      {(wish || still) && (
        <Fieldset>
          <FieldsetLegend>Search elsewhere</FieldsetLegend>
          <LinkList links={searchLinks(r)} />
        </Fieldset>
      )}
      <Confirm
        open={del !== null}
        title="Remove this research for good?"
        yes="Remove"
        onYes={() => {
          const key = del!
          mutate(r.id, (latest) => removeResearchPatch(latest, key))
        }}
        onClose={() => setDel(null)}
      />
    </div>
  )
}

// whether a record has a Research tab: a hunt always; an owned record for an editor or once it has research; an ordered
// record while it still wants other copies
export function hasResearch(r: Rec, canEdit: boolean) {
  const k = kindOf(r)
  return k === 'wish' || (k === 'own' && (canEdit || researchEntries(r).length > 0)) || (k === 'ordered' && stillCopies(r).length > 0)
}
