import { buttonVariants } from '@appica/ui-react/button'
import { DrawerClose, DrawerContent } from '@appica/ui-react/drawer'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@appica/ui-react/tooltip'

// the round header buttons: a light wash of the wall colour behind each, so the outline reads over any background
export const ROUND = 'bg-wall/70 rounded-full before:rounded-full before:bg-transparent'

// Tooltips (#70): appica's, never the browser's title, after the same 150 ms everywhere. Buttons side by side share a
// TipGroup, so moving from one to the next shows the next at once. narrow: only where the control's text label is hidden
// (below sm), as on + Add a record and the filter chips. No label, no tooltip
const DELAY = 150
export const TipGroup = ({ children }: { children: React.ReactNode }) => <TooltipProvider delay={DELAY}>{children}</TooltipProvider>
export function Tip({ label, narrow, children }: { label: string; narrow?: boolean; children: React.ReactElement }) {
  if (!label) return children
  return (
    <Tooltip>
      <TooltipTrigger delay={DELAY} render={children} />
      <TooltipContent className={narrow ? 'sm:hidden' : undefined}>{label}</TooltipContent>
    </Tooltip>
  )
}

// a sheet, with appica's close button given a tooltip: the same button, in the same place
export function SheetContent({ children, ...props }: React.ComponentProps<typeof DrawerContent>) {
  return (
    <DrawerContent closeButton={false} {...props}>
      {children}
      <Tip label="Close">
        <DrawerClose
          aria-label="Close"
          data-slot="drawer-close-button"
          className={buttonVariants({ variant: 'outline', size: 'icon-sm', className: 'absolute inset-e-3 top-3 z-10' })}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M11.594 3.594c.225-.225.588-.225.813 0s.225.588 0 .812L8.813 8l3.594 3.594c.225.225.225.588 0 .813s-.588.225-.812 0L8 8.812l-3.594 3.594c-.225.225-.588.225-.812 0s-.225-.588 0-.812L7.188 8 3.594 4.406c-.225-.225-.225-.588 0-.812s.588-.225.813 0L8 7.187l3.594-3.594z" />
          </svg>
        </DrawerClose>
      </Tip>
    </DrawerContent>
  )
}
