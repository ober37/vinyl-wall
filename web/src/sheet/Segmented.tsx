import { buttonVariants } from '@appica/ui-react/button'
import { Toggle } from '@appica/ui-react/toggle'
import { ToggleGroup } from '@appica/ui-react/toggle-group'

// One choice from a few: appica has no segmented control, so a ToggleGroup of Toggles styled as outline buttons, the
// chosen one in a mint border and mint text but no fill, so it never looks like the form's primary button (#116). A press
// can't leave nothing chosen.
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
        <Toggle key={v} value={v} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'data-pressed:before:border-primary data-pressed:text-primary flex-1 sm:flex-none' })}>
          {l}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}
