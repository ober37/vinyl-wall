import { useState, type CSSProperties } from 'react'
import { faceColors } from '../model/record'

// A record's front: its cover, or (with none, or one that won't load) a generated one in the record's colours.
// The colours come from the title and artist like production's: per-record data, not design tokens.
export function Face({ title, artist, hue, cover, className = '', small }: {
  title: string
  artist: string
  hue: number
  cover: string
  className?: string
  small?: boolean
}) {
  const [failed, setFailed] = useState(false)
  if (cover && !failed)
    return <img src={cover} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className={`object-cover ${className}`} />
  return (
    <div
      className={`flex flex-col justify-between overflow-hidden text-(--cover-ink) ${small ? 'p-2' : 'p-3'} ${className}`}
      style={{ background: `linear-gradient(150deg, ${faceColors(hue).join(', ')})` } as CSSProperties}
    >
      <span className={`font-display leading-[0.95] font-extrabold break-words uppercase ${small ? 'text-base' : 'text-2xl'}`}>
        {title || 'Untitled'}
      </span>
      {!small && <span className="font-mono text-xs opacity-85">{artist}</span>}
    </div>
  )
}
