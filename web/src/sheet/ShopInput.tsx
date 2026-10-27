import { useState } from 'react'
import { Autocomplete, AutocompleteContent, AutocompleteInput, AutocompleteItem, AutocompleteList } from '@appica/ui-react/autocomplete'
import { shopsOf, shopSuggest } from '../model/shops'
import { useRuntime } from '../runtime/runtime'

// Where a record came from (#99): free text that suggests your shops once you type part of one's name, so picking one
// links the record to it (#89). onPick: a suggestion was taken
export function ShopInput({ value, onChange, onPick, placeholder }: {
  value: string
  onChange: (v: string) => void
  onPick?: (name: string) => void
  placeholder?: string
}) {
  const { settings } = useRuntime()
  const [open, setOpen] = useState(false)
  const names = shopSuggest(shopsOf(settings), value)
  return (
    <Autocomplete
      items={names}
      filteredItems={names}
      value={value}
      onValueChange={(v) => {
        onChange(v)
        if (names.includes(v)) onPick?.(v)
      }}
      open={open && names.length > 0}
      onOpenChange={setOpen}
    >
      <AutocompleteInput placeholder={placeholder} />
      <AutocompleteContent>
        <AutocompleteList>
          {(n: string) => (
            <AutocompleteItem key={n} value={n}>
              {n}
            </AutocompleteItem>
          )}
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  )
}
