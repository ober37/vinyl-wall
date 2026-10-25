import { Button } from '@appica/ui-react/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogClose,
} from '@appica/ui-react/alert-dialog'

// The one confirm used for every delete in the sheet: a record, a play, a note. A step that isn't a delete (retiring a
// piece of gear) passes calm, so its button isn't red, and its own answer for no.
export function Confirm({ open, title, yes, no = 'Keep it', calm, onYes, onClose }: {
  open: boolean
  title: string
  yes: string
  no?: string
  calm?: boolean
  onYes: () => void
  onClose: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline">{no}</Button>} />
          <Button
            variant={calm ? 'primary' : 'destructive'}
            onClick={() => {
              onYes()
              onClose()
            }}
          >
            {yes}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
