import { Badge } from '@appica/ui-react/badge'
import { Card, CardMedia, CardHeader, CardTitle, CardDescription } from '@appica/ui-react/card'
import { useState } from 'react'
import { coverUrl, kindOf, KIND_LABEL, wallOrder, type Rec } from '../model/record'

// a cover fills the card's media slot square; with none (or one that won't load) a muted tile shows the title
function Cover({ r }: { r: Rec }) {
  const [failed, setFailed] = useState(false)
  const src = coverUrl(r)
  if (src && !failed) return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="aspect-square w-full object-cover" />
  return (
    <div className="bg-background-muted text-foreground-muted flex aspect-square w-full items-center justify-center p-4 text-center text-sm">
      {r.title || 'Untitled'}
    </div>
  )
}

// The slice's wall: a grid of cards. The rack (rail, clips, backgrounds) gets its own design pass later.
export function Wall({ records, onOpen }: { records: Rec[]; onOpen: (id: string) => void }) {
  if (!records.length) return <p className="text-foreground-muted text-sm">Nothing on the wall yet.</p>
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {wallOrder(records).map((r) => {
        const k = kindOf(r)
        const meta = [r.year, r.label].filter(Boolean).join(' · ')
        return (
          <li key={r.id}>
            <Card
              frame
              render={<button type="button" data-testid="sleeve" data-id={r.id} onClick={() => onOpen(r.id)} />}
              className="hover:bg-background-muted w-full cursor-pointer text-start"
              aria-label={`Open ${r.title} by ${r.artist}`}
            >
              <CardMedia className="relative">
                <Cover r={r} />
                {k !== 'own' && (
                  <Badge size="sm" variant={k === 'ordered' ? 'info' : 'secondary'} className="absolute start-2 top-2">
                    {KIND_LABEL[k]}
                  </Badge>
                )}
              </CardMedia>
              <CardHeader>
                <CardTitle className="line-clamp-2">{r.title || 'Untitled'}</CardTitle>
                <CardDescription>{r.artist}</CardDescription>
                {meta && <CardDescription>{meta}</CardDescription>}
              </CardHeader>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
