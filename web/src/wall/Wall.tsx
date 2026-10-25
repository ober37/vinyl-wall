import { memo, useDeferredValue, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Badge } from '@appica/ui-react/badge'
import { Button, buttonVariants } from '@appica/ui-react/button'
import { Input } from '@appica/ui-react/input'
import { Toggle } from '@appica/ui-react/toggle'
import { ROUND, Tip, TipGroup } from './Tip'
import { ToggleGroup } from '@appica/ui-react/toggle-group'
import { FKEYS, FLABEL, shownList, type FKey } from '../model/filter'
import type { Shown } from '../model/share'
import { coverUrl, hueOf, tagOf, type Rec, type Tag } from '../model/record'
import { lookingUp } from '../model/task'
import type { Background } from '../model/site'
import { Face } from './Face'

const TAG_TONE: Record<Tag['tone'], string> = {
  ship: 'bg-ship text-ship-ink',
  want: 'bg-want text-want-ink',
  someday: 'bg-someday text-someday-ink',
  paper: 'bg-paper text-paper-ink',
}
const CHIP_TONE: Partial<Record<FKey, string>> = { ord: 'bg-ship', p1: 'bg-want', p2: 'bg-paper', p3: 'bg-someday' }

// the filter is per viewer, remembered in this browser like production's (same key and format)
const KEY = 'rw.filter'
function useWallFilter() {
  const [filter, setFilter] = useState<FKey[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '[]')
      return Array.isArray(v) ? FKEYS.filter((k) => v.includes(k)) : []
    } catch {
      return []
    }
  })
  const set = (v: FKey[]) => {
    setFilter(v)
    try {
      localStorage.setItem(KEY, JSON.stringify(v))
    } catch {
      // private window or blocked storage: the filter just isn't remembered
    }
  }
  return [filter, set] as const
}

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="size-5 sm:size-4">
    <path d="M12 5v14M5 12h14" />
  </svg>
)
const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </svg>
)
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12" />
    <path d="M7 8l5-5 5 5" />
    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </svg>
)

// The photo or pattern behind the page
export function WallBackground({ bg }: { bg: Background }) {
  return <div className={`wall-bg ${bgClass(bg)}`} data-testid="wall-bg" style={bgStyle(bg)} aria-hidden="true" />
}
// the classes and style that draw a background, on the page or on a tile in Settings
export const bgClass = (bg: Background) => (bg.kind === 'photo' ? 'bg-photo' : 'bg-' + bg.preset)
export const bgStyle = (bg: Background) =>
  bg.kind === 'photo' ? ({ '--photo': `url("${bg.url}")`, '--dim': bg.dim + '%', '--photo-pos': bg.pos } as CSSProperties) : undefined

// One sleeve. Takes only plain values, so a snapshot that didn't change this record leaves it (and its cover) alone.
const Sleeve = memo(function Sleeve({ id, title, artist, meta, cover, hue, tagText, tagTone, looking, onOpen }: {
  id: string
  title: string
  artist: string
  meta: string
  cover: string
  hue: number
  tagText: string
  tagTone: Tag['tone']
  // waiting on the background task for its cover, details or album info
  looking: boolean
  onOpen: (id: string) => void
}) {
  const tag = tagText ? { text: tagText, tone: tagTone } : null
  return (
    <li className="slot">
      <div className="hanger">
        <span className="hook" aria-hidden="true" />
        <button
          type="button"
          data-testid="sleeve"
          data-id={id}
          onClick={() => onOpen(id)}
          aria-label={`Open ${title} by ${artist}${tag ? ', ' + tag.text.replace(/ · /g, ', ') : ''}${looking ? ', looking up details' : ''}`}
          title={looking ? 'Looking up details' : undefined}
          className="group block w-full cursor-pointer text-start outline-offset-4 focus-visible:outline-2 focus-visible:outline-(--focus-ring)"
        >
          <div className="sleeve-box transition-transform group-active:scale-[0.975]">
            <div className="disc" style={{ '--disc-label': `hsl(${hue} 60% 45%)` } as CSSProperties} />
            <Face title={title} artist={artist} hue={hue} cover={cover} className="sleeve-face" />
            {looking && (
              // a brass dot in the corner nothing else uses, ringed so it shows on any cover
              <span
                aria-hidden="true"
                className="bg-brass motion-safe:animate-pulse-dot absolute end-2 top-2 z-4 size-2.5 rounded-full shadow-[0_0_0_2px_var(--shade),0_0_0_3px_var(--wall)]"
              />
            )}
            {tag && (
              <Badge
                className={`hang-tag absolute h-auto rounded-(--radius-4xs) py-1.5 ps-3.5 pe-2 font-mono text-[0.6875rem] leading-none tracking-wider uppercase ${TAG_TONE[tag.tone]}`}
              >
                <span aria-hidden="true" className="bg-wall absolute start-1.5 top-1/2 size-1 -translate-y-1/2 rounded-full" />
                <span className="truncate">{tag.text}</span>
              </Badge>
            )}
          </div>
          <div className="cap on-photo min-w-0 px-0.5 pt-2.5">
            <div className="text-ink text-sm leading-tight font-semibold break-words">{title}</div>
            <div className="text-ink-2 text-[0.8125rem] break-words">{artist}</div>
            {meta && <div className="text-ink-2 mt-0.5 font-mono text-[0.6875rem]">{meta}</div>}
          </div>
        </button>
      </div>
    </li>
  )
})

export function Wall({ records, title, hang, onOpen, onAdd, onShare, tools, gear, below, welcome }: {
  records: Rec[]
  title: string
  hang: string
  onOpen: (id: string) => void
  // editors only: opens the new-record sheet
  onAdd?: () => void
  // where the page can save files: a picture of what the wall shows (hidden while it shows nothing)
  onShare?: (s: Shown) => void
  tools?: React.ReactNode
  // the Equipment button, first of the round buttons beside the title
  gear?: React.ReactNode
  // at the end of the filter row: how many records are being looked up (owners only)
  below?: React.ReactNode
  // an owner's first visit: shown in place of the empty wall
  welcome?: React.ReactNode
}) {
  const [filter, setFilter] = useWallFilter()
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const q = useDeferredValue(query)
  const searchBtn = useRef<HTMLButtonElement>(null)
  const { n, on, list } = shownList(records, filter, searching ? q : '')
  // on phones the first row sits as far below the header as the title sits below the buttons; Cork's pins and Floating's
  // sleeves start lower in their slots than a rail does, so those two lose the header's margin and the rack's top padding
  const lowHang = hang === 'cork' || hang === 'float'

  useEffect(() => {
    document.title = title
  }, [title])
  const closeSearch = () => {
    setQuery('')
    setSearching(false)
    searchBtn.current?.focus()
  }

  return (
    <>
      <header className={`mb-8 flex flex-col gap-2 ${lowHang ? 'max-sm:mb-3' : 'max-sm:mb-4'}`}>
        {/* on phones the round buttons get their own row above the title, so the title has the full width */}
        <div className="flex items-start justify-between gap-5 max-sm:flex-col-reverse max-sm:items-stretch max-sm:gap-4">
          {/* the display face sets its first letter in a little; pulled back so the letters start on the chips' edge.
              A single word too long for the line breaks rather than running off the page */}
          <h1 className="font-display text-ink -ms-[0.045em] min-w-0 text-[clamp(2.25rem,7vw,4.25rem)] leading-none font-extrabold tracking-wide text-balance break-words uppercase">
            {title}
          </h1>
          <TipGroup>
            <div className="flex shrink-0 items-center gap-2 max-sm:self-end">
              {gear}
              <Tip label="Search the wall">
                <Button
                  ref={searchBtn}
                  size="icon-md"
                  variant="outline"
                  aria-label="Search the wall"
                  aria-expanded={searching}
                  aria-controls="wall-search"
                  className={ROUND}
                  onClick={() => (searching ? closeSearch() : setSearching(true))}
                >
                  <SearchIcon />
                </Button>
              </Tip>
              {onShare && list.length > 0 && (
                <Tip label="Share your wall">
                  <Button
                    size="icon-md"
                    variant="outline"
                    aria-label="Share your wall"
                    className={ROUND}
                    onClick={() => onShare({ list, total: records.length, filtered: on.length > 0, searched: searching && !!q.trim() })}
                  >
                    <ShareIcon />
                  </Button>
                </Tip>
              )}
              {tools}
            </div>
          </TipGroup>
        </div>
        {/* the filters, the lookup count after them and search under them, and Add a record held to the right edge under
            Settings (just "+" on phones) */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* centred on the round + beside it (44px on phones, 40 from sm up) */}
            <div className="on-photo flex flex-wrap items-center gap-1.5 py-1.5 sm:py-1">
              {records.length > 0 && (
                <ToggleGroup
                  multiple
                  aria-label="Show on the wall"
                  value={on}
                  onValueChange={(v) => setFilter(v as FKey[])}
                  className="flex-wrap gap-1.5"
                >
                  {FKEYS.filter((k) => n[k]).map((k) => (
                    <Toggle
                      key={k}
                      value={k}
                      className={buttonVariants({
                        variant: 'ghost',
                        size: 'sm',
                        // every chip has its outline, so the row has one left edge; a chip that's on gets a stronger one
                        className: 'bg-wall/70 text-ink-2 data-pressed:text-ink ring-border data-pressed:ring-border-emphasis gap-1.5 px-2.5! font-mono text-[0.8125rem] ring-1',
                      })}
                    >
                      {CHIP_TONE[k] && <i aria-hidden="true" className={`ring-border size-2.5 rounded-(--radius-4xs) ring-1 ${CHIP_TONE[k]}`} />}
                      <b className="text-ink font-medium">{n[k]}</b>
                      <span className={k === 'own' ? '' : 'max-sm:sr-only'}>{FLABEL[k]}</span>
                    </Toggle>
                  ))}
                </ToggleGroup>
              )}
              {below}
            </div>
            {searching && (
              <div role="search" id="wall-search" className="mt-3 flex max-w-md items-center gap-2">
                <Input
                  type="search"
                  aria-label="Search the wall"
                  placeholder="Title, artist, label or year"
                  autoFocus
                  autoComplete="off"
                  enterKeyHint="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && closeSearch()}
                  className="flex-1"
                />
                <Button size="sm" variant="outline" onClick={closeSearch}>
                  Clear
                </Button>
              </div>
            )}
          </div>
          {onAdd && (
            <Button onClick={onAdd} className="ms-auto size-11 shrink-0 rounded-full p-0 sm:h-10 sm:w-auto sm:px-4">
              <PlusIcon />
              <span className="max-sm:sr-only">Add a record</span>
            </Button>
          )}
        </div>
      </header>

      {!records.length ? (
        welcome || (
          <p className="on-photo text-ink-2 max-w-xl rounded-(--radius-xs) border-border border border-dashed px-5 py-7 text-sm">
            {onAdd ? "Nothing hanging yet. Add a record you own, or one you're hunting for." : 'Nothing hanging yet.'}
          </p>
        )
      ) : !list.length ? (
        <div className="on-photo text-ink-2 flex flex-wrap items-center gap-3 text-sm">
          <span>Nothing on the wall matches “{q}”.</span>
          <Button size="sm" variant="outline" onClick={closeSearch}>
            Clear the search
          </Button>
        </div>
      ) : (
        <ul className={`rack ${lowHang ? 'max-sm:pt-0' : ''}`} data-hang={hang} aria-label="Records">
          {list.map((r) => (
            <Sleeve
              key={r.id}
              id={r.id}
              title={r.title || 'Untitled'}
              artist={r.artist || ''}
              meta={[r.year, r.label].filter(Boolean).join(' · ')}
              cover={coverUrl(r)}
              hue={hueOf(r)}
              tagText={tagOf(r)?.text ?? ''}
              tagTone={tagOf(r)?.tone ?? 'paper'}
              looking={lookingUp(r)}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
    </>
  )
}
