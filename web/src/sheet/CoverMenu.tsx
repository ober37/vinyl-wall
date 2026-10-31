import { Badge } from '@appica/ui-react/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@appica/ui-react/dropdown-menu'
import { useCoverPick } from './CoverButton'

// Edit mode's cover is the menu for the cover (#129): Upload or Replace cover…, and Remove cover… (which asks first). The
// file input stays outside the menu, whose content goes when it closes. With nothing to offer, the cover is just the cover.
export function CoverMenu({ face, hasCover, onUploaded, onStatus, onRemove }: {
  face: React.ReactNode
  hasCover: boolean
  onUploaded: (id: string) => void | Promise<void>
  onStatus: (msg: string) => void
  onRemove: () => void
}) {
  const c = useCoverPick(hasCover, onUploaded, onStatus)
  if (!c.can && !hasCover) return face
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Cover options"
          className="relative shrink-0 cursor-pointer rounded-(--radius-2xs) outline-offset-2 focus-visible:outline-2 focus-visible:outline-(--focus-ring)"
        >
          {face}
          <Badge size="sm" variant="secondary" className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2">
            Edit
          </Badge>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {c.can && (
            <DropdownMenuItem disabled={c.busy} onClick={c.open}>
              {hasCover ? 'Replace cover…' : 'Upload cover…'}
            </DropdownMenuItem>
          )}
          {c.can && hasCover && <DropdownMenuSeparator />}
          {hasCover && (
            <DropdownMenuItem className="text-error-emphasis" onClick={onRemove}>
              Remove cover…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {c.input}
    </>
  )
}
