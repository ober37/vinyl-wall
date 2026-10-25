import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@appica/ui-react/tooltip'

// the round header buttons: a light wash of the wall colour behind each, so the outline reads over any background
export const ROUND = 'bg-wall/70 rounded-full before:rounded-full before:bg-transparent'

// the round header buttons' names on hover and keyboard focus, quicker than the browser's own title tooltip
export const TipGroup = ({ children }: { children: React.ReactNode }) => <TooltipProvider delay={150}>{children}</TooltipProvider>
export function Tip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
