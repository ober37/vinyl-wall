import { Button } from '@appica/ui-react/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogClose,
} from '@appica/ui-react/alert-dialog'

// The one confirm used for every delete in the sheet: a record, a play, a note
export function Confirm({ open, title, yes, onYes, onClose }: {
  open: boolean
  title: string
  yes: string
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
          <AlertDialogClose render={<Button variant="outline">Keep it</Button>} />
          <Button
            variant="destructive"
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
