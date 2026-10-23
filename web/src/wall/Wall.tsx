import { memo, useDeferredValue, useEffect, useRef, useState, type CSSProperties } from 'react'
import { BackgroundPattern } from '@appica/ui-react/background-pattern'
import { Badge } from '@appica/ui-react/badge'
import { Button, buttonVariants } from '@appica/ui-react/button'
import { Input } from '@appica/ui-react/input'
import { Toggle } from '@appica/ui-react/toggle'
import { ToggleGroup } from '@appica/ui-react/toggle-group'
import { FKEYS, FLABEL, shownList, type FKey } from '../model/filter'
import { coverUrl, hueOf, tagOf, type Rec, type Tag } from '../model/record'
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

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </svg>
)

// The photo or pattern behind the page
export function WallBackground({ bg }: { bg: Background }) {
  if (bg.kind === 'photo')
    return (
      <div
        className="wall-photo"
        data-testid="wall-photo"
        style={{ '--photo': `url("${bg.url}")`, '--dim': bg.dim + '%', '--photo-pos': bg.pos } as CSSProperties}
      />
    )
  if (bg.preset === 'grille')
    return (
      <div className="fixed inset-0 -z-10" aria-hidden="true">
        <BackgroundPattern variant="dots" className="size-full" />
      </div>
    )
  return null
}

// One sleeve. Takes only plain values, so a snapshot that didn't change this record leaves it (and its cover) alone.
const Sleeve = memo(function Sleeve({ id, title, artist, meta, cover, hue, tagText, tagTone, onOpen }: {
  id: string
  title: string
  artist: string
  meta: string
  cover: string
  hue: number
  tagText: string
  tagTone: Tag['tone']
  onOpen: (id: string) => void
}) {
  const tag = tagText ? { text: tagText, tone: tagTone } : null
  return (
    <li className="slot">
      <div className="hanger">
        <span className="ring" aria-hidden="true" />
        <button
          type="button"
          data-testid="sleeve"
          data-id={id}
          onClick={() => onOpen(id)}
          aria-label={`Open ${title} by ${artist}${tag ? ', ' + tag.text.replace(/ · /g, ', ') : ''}`}
          className="group block w-full cursor-pointer text-start outline-offset-4 focus-visible:outline-2 focus-visible:outline-(--focus-ring)"
        >
          <div className="sleeve-box transition-transform group-active:scale-[0.975]">
            <div className="disc" style={{ '--disc-label': `hsl(${hue} 60% 45%)` } as CSSProperties} />
            <Face title={title} artist={artist} hue={hue} cover={cover} className="sleeve-face" />
            {tag && (
              <Badge
                className={`hang-tag absolute h-auto rounded-(--radius-4xs) py-1.5 ps-3.5 pe-2 font-mono text-[0.6875rem] leading-none tracking-wider uppercase ${TAG_TONE[tag.tone]}`}
              >
                <span aria-hidden="true" className="bg-wall absolute start-1.5 top-1/2 size-1 -translate-y-1/2 rounded-full" />
                <span className="truncate">{tag.text}</span>
              </Badge>
            )}
          </div>
          <div className="on-photo min-w-0 px-0.5 pt-2.5">
            <div className="text-ink text-sm leading-tight font-semibold break-words">{title}</div>
            <div className="text-ink-2 text-[0.8125rem] break-words">{artist}</div>
            {meta && <div className="text-ink-2 mt-0.5 font-mono text-[0.6875rem]">{meta}</div>}
          </div>
        </button>
      </div>
    </li>
  )
})

export function Wall({ records, title, hang, onOpen, tools, below }: {
  records: Rec[]
  title: string
  hang: string
  onOpen: (id: string) => void
  tools?: React.ReactNode
  // a line under the counts (records being looked up)
  below?: React.ReactNode
}) {
  const [filter, setFilter] = useWallFilter()
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const q = useDeferredValue(query)
  const searchBtn = useRef<HTMLButtonElement>(null)
  const { n, on, list } = shownList(records, filter, searching ? q : '')

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
      <header className="mb-8 flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-ink text-[clamp(2.25rem,7vw,4.25rem)] leading-none font-extrabold tracking-wide text-balance uppercase">
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            ref={searchBtn}
            size="icon-md"
            variant="outline"
            aria-label="Search the wall"
            aria-expanded={searching}
            aria-controls="wall-search"
            className="rounded-full bg-transparent before:rounded-full before:bg-transparent"
            onClick={() => (searching ? closeSearch() : setSearching(true))}
          >
            <SearchIcon />
          </Button>
          {tools}
        </div>
        <div className="basis-full">
          {records.length > 0 && (
            <ToggleGroup
              multiple
              aria-label="Show on the wall"
              value={on}
              onValueChange={(v) => setFilter(v as FKey[])}
              className="on-photo -ms-1.5 flex-wrap gap-1"
            >
              {FKEYS.filter((k) => n[k]).map((k) => (
                <Toggle
                  key={k}
                  value={k}
                  className={buttonVariants({
                    variant: 'ghost',
                    size: 'sm',
                    className: 'text-ink-2 data-pressed:text-ink data-pressed:ring-border-emphasis gap-1.5 px-1.5 font-mono text-[0.8125rem] data-pressed:ring-1',
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
      </header>

      {!records.length ? (
        <p className="on-photo text-ink-2 text-sm">Nothing on the wall yet.</p>
      ) : !list.length ? (
        <div className="on-photo text-ink-2 flex flex-wrap items-center gap-3 text-sm">
          <span>Nothing on the wall matches “{q}”.</span>
          <Button size="sm" variant="outline" onClick={closeSearch}>
            Clear the search
          </Button>
        </div>
      ) : (
        <ul className="rack" data-hang={hang} aria-label="Records">
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
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
    </>
  )
}
