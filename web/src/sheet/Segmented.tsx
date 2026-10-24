import { buttonVariants } from '@appica/ui-react/button'
import { Toggle } from '@appica/ui-react/toggle'
import { ToggleGroup } from '@appica/ui-react/toggle-group'

// One choice from a few: appica has no segmented control, so a ToggleGroup of Toggles styled as primary-outline buttons
// (that variant already styles the pressed state). A press can't leave nothing chosen.
export function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string
  value: T
  options: [T, string][]
  onChange: (v: T) => void
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(v) => v.length && onChange(v[0] as T)}
      className="flex w-full flex-wrap sm:w-fit"
    >
      {options.map(([v, l]) => (
        <Toggle key={v} value={v} className={buttonVariants({ variant: 'primary-outline', size: 'sm', className: 'flex-1 sm:flex-none' })}>
          {l}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}
