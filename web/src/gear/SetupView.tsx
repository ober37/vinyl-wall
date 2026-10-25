import { useRef, useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { Field, FieldLabel } from '@appica/ui-react/field'
import { Input } from '@appica/ui-react/input'
import { Textarea } from '@appica/ui-react/textarea'
import { activeGear, type Setup } from '../model/gear'
import { useRuntime } from '../runtime/runtime'
import { Confirm } from '../sheet/Confirm'
import { useDebouncedSave } from './useDebouncedSave'

// A setup's name and notes, saved as they're typed; deleting it moves its gear out of any setup
export function SetupView({ x, onStatus, onGone }: { x: Setup; onStatus: (s: string) => void; onGone: () => void }) {
  const { gear, saveGear, saveSetup, deleteSetup } = useRuntime()
  const [name, setName] = useState(x.name || '')
  const [note, setNote] = useState(x.note || '')
  const [confirm, setConfirm] = useState(false)
  const latest = useRef({ name, note })
  latest.current = { name, note }
  const items = activeGear(gear).filter((g) => g.setup === x.id)

  const { schedule: typed, cancel } = useDebouncedSave(() => {
    const { name, note } = latest.current
    saveSetup(x.id, { name: name.trim() || 'Untitled setup', note, added: x.added || Date.now() }).then((ok) => onStatus(ok ? 'Saved' : "Couldn't save"))
  }, onStatus)

  const del = async () => {
    cancel()
    // retired pieces too, so one put back in use doesn't point at a setup that's gone
    gear.filter((g) => g.setup === x.id).forEach((g) => saveGear(g.id, { setup: '' }))
    if (await deleteSetup(x.id)) onGone()
  }
  const n = items.length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input
            value={name}
            placeholder="e.g. Office, Living room"
            autoFocus={!matchMedia('(hover: none)').matches}
            onChange={(e) => {
              setName(e.target.value)
              typed()
            }}
          />
        </Field>
        <Field>
          <FieldLabel>Notes</FieldLabel>
          <Textarea
            rows={3}
            value={note}
            placeholder="Where it lives, what's connected to what…"
            onChange={(e) => {
              setNote(e.target.value)
              typed()
            }}
          />
        </Field>
      </div>
      <Button variant="outline" size="sm" className="self-start" onClick={() => setConfirm(true)}>
        Delete setup…
      </Button>
      <Confirm
        open={confirm}
        title={n ? `Move its ${n} piece${n === 1 ? '' : 's'} of equipment out of any setup and delete ${x.name || 'this setup'}?` : `Delete ${x.name || 'this setup'}?`}
        yes="Delete"
        onYes={del}
        onClose={() => setConfirm(false)}
      />
    </div>
  )
}
