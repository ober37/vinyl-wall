// A tracklist, by side when its positions have them, and the Tracklist row a copy's fold shows when its own release's
// tracks aren't the album's (#138)
import { Fragment, useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@appica/ui-react/collapsible'
import { ownTracks } from '../model/copies'
import { sideOf, trackSecs } from '../model/plays'
import { okUrl, recordTracks, type Rec } from '../model/record'
import { Chevron, Source } from './Links'

type Row = [string, React.ReactNode]

export function Tracks({ r }: { r: Rec }) {
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
  const srcName = ab.tracksSource === 'copy' ? "this copy's Discogs release" : ab.tracksSource === 'discogs' ? 'your Discogs pressing' : 'MusicBrainz'
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

// a copy's own tracklist, folded as a runout is: "14 tracks · 52 min", opening to the list; nothing when its tracks are the
// album's. album: the record, copy: the copy as a record (ownedRecs, ordersOf, or the album with copyAlbum's over it)
export function tracksRow(album: Rec, copy: Rec): Row[] {
  if (!ownTracks(album, copy)) return []
  const n = recordTracks(copy).length
  return [
    [
      'Tracklist',
      <Collapsible>
        <CollapsibleTrigger className="group text-foreground inline-flex items-center gap-1 text-start underline decoration-dotted underline-offset-2">
          <span>
            {n} track{n > 1 ? 's' : ''}
            {copy.runtime ? ' · ' + copy.runtime + ' min' : ''}
          </span>
          <Chevron className="size-3.5 shrink-0" />
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-2 pt-2">
          <Tracks r={copy} />
        </CollapsibleContent>
      </Collapsible>,
    ],
  ]
}

// a copy's runtime when it isn't the album's, and its Tracklist row doesn't already say it
export const runtimeRow = (album: Rec, copy: Rec): Row[] =>
  copy.runtime && String(copy.runtime) !== String(album.runtime || '') && !ownTracks(album, copy) ? [['Runtime', copy.runtime + ' min']] : []
