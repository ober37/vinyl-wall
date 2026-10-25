import { useEffect, useRef, useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerBody } from '@appica/ui-react/drawer'
import { Alert, AlertTitle } from '@appica/ui-react/alert'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Boundary } from '../Boundary'
import { activeGear, ALL_SETUPS, gName, setupName, sortSetups, typeOf, type Gear } from '../model/gear'
import { playDate } from '../model/record'
import { useRuntime } from '../runtime/runtime'
import { AddGear } from './AddGear'
import { GearEdit, GearItem } from './GearItem'
import { ListeningSummary } from './ListeningSummary'
import { SetupView } from './SetupView'
import { WearLine } from './Wear'

// The Equipment sheet's views: the root, and a piece of gear, a setup or Add equipment inside it (back is "All gear")
type View = { k: 'root' } | { k: 'item'; id: string } | { k: 'setup'; id: string } | { k: 'add'; setup: string; type?: string }

function GearCard({ g, onOpen }: { g: Gear; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(g.id)}
      className="border-border hover:border-border-strong focus-visible:outline-brass flex min-w-0 flex-col gap-1.5 rounded-md border p-3 text-start focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <span className="text-foreground-muted font-mono text-[0.6875rem] tracking-wider uppercase">{typeOf(g).label}</span>
      <span className="text-foreground-intense font-semibold break-words">{gName(g)}</span>
      <WearLine g={g} />
    </button>
  )
}
const Cards = ({ items, onOpen }: { items: Gear[]; onOpen: (id: string) => void }) => (
  <div className="grid gap-2 sm:grid-cols-2">
    {items.map((g) => (
      <GearCard key={g.id} g={g} onOpen={onOpen} />
    ))}
  </div>
)

function Root({ go, onRecord }: { go: (v: View) => void; onRecord: (id: string) => void }) {
  const { records, gear, setups, canEdit, saveSetup, newDocId } = useRuntime()
  const S = sortSetups(setups)
  const act = activeGear(gear)
  const shared = act.filter((g) => g.setup === ALL_SETUPS)
  const loose = act.filter((g) => g.setup !== ALL_SETUPS && !S.some((x) => x.id === g.setup))
  const retired = gear.filter((g) => g.status === 'retired')
  const open = (id: string) => go({ k: 'item', id })
  // the first setup is made quietly, named "My setup", and goes straight to adding its turntable; later ones open to be named
  const newSetup = async (first: boolean) => {
    const id = newDocId('setups')
    if (!(await saveSetup(id, { name: first ? 'My setup' : 'Setup ' + (S.length + 1), note: '', added: Date.now() }))) return
    go(first ? { k: 'add', setup: id, type: 'turntable' } : { k: 'setup', id })
  }

  return (
    <div className="flex flex-col gap-8">
      <Fieldset>
        <FieldsetLegend>Listening</FieldsetLegend>
        <ListeningSummary records={records} canEdit={canEdit} onOpen={onRecord} />
      </Fieldset>
      {S.length === 0 && canEdit && (
        <Fieldset>
          <FieldsetLegend>Your setup</FieldsetLegend>
          <p className="text-foreground-muted text-sm">Start with your turntable. Plays you log add hours to it, so you know when a stylus is wearing out.</p>
          <Button className="self-start" onClick={() => newSetup(true)}>
            Add your turntable
          </Button>
        </Fieldset>
      )}
      {S.map((x) => {
        const items = act.filter((g) => g.setup === x.id)
        return (
          <Fieldset key={x.id}>
            <FieldsetLegend>{x.name || 'Untitled setup'}</FieldsetLegend>
            {x.note && <p className="text-foreground-muted text-sm whitespace-pre-line">{x.note}</p>}
            {items.length ? <Cards items={items} onOpen={open} /> : <p className="text-foreground-muted text-sm">No equipment in this setup yet.</p>}
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => go({ k: 'add', setup: x.id })}>
                  Add equipment
                </Button>
                <Button size="sm" variant="outline" onClick={() => go({ k: 'setup', id: x.id })}>
                  Rename or edit setup
                </Button>
              </div>
            )}
          </Fieldset>
        )
      })}
      {S.length > 0 && canEdit && (
        <Button size="sm" variant="outline" className="-mt-4 self-start" onClick={() => newSetup(false)}>
          Add another setup
        </Button>
      )}
      {loose.length > 0 && (
        <Fieldset>
          <FieldsetLegend>Not in a setup</FieldsetLegend>
          {canEdit && <p className="text-foreground-muted text-sm">Open each piece and choose its setup.</p>}
          <Cards items={loose} onOpen={open} />
        </Fieldset>
      )}
      {(canEdit || shared.length > 0) && (
        <Fieldset>
          <FieldsetLegend>Shared equipment</FieldsetLegend>
          <p className="text-foreground-muted text-sm">Gear used with every setup, like speakers, headphones or a cleaning kit. Plays on any setup count toward it.</p>
          {shared.length > 0 && <Cards items={shared} onOpen={open} />}
          {canEdit && (
            <Button size="sm" variant="outline" className="self-start" onClick={() => go({ k: 'add', setup: ALL_SETUPS })}>
              Add shared equipment
            </Button>
          )}
        </Fieldset>
      )}
      {retired.length > 0 && (
        <Fieldset>
          <FieldsetLegend>Retired</FieldsetLegend>
          <Cards items={retired} onOpen={open} />
        </Fieldset>
      )}
    </div>
  )
}

// Equipment: setups, the gear in them and the wall's listening, in one sheet from the right like a record's
export function EquipmentSheet({ open, onClose, onRecord }: { open: boolean; onClose: () => void; onRecord: (id: string) => void }) {
  const { gear, setups, canEdit, error, clearError } = useRuntime()
  const [view, setView] = useState<View>({ k: 'root' })
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState('')
  const title = useRef<HTMLHeadingElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const rootScroll = useRef(0)

  // every opening starts at the root
  useEffect(() => {
    if (open) setView({ k: 'root' })
  }, [open])
  // a new view starts in view mode with its title focused; back at the root, the list is where it was
  const go = (v: View) => {
    if (view.k === 'root') rootScroll.current = body.current?.scrollTop || 0
    setEditing(false)
    setSaved('')
    clearError(true)
    setView(v)
  }
  useEffect(() => {
    if (!open) return
    const el = body.current
    requestAnimationFrame(() => {
      if (el) el.scrollTop = view.k === 'root' ? rootScroll.current : 0
      if (view.k !== 'root') title.current?.focus()
    })
  }, [view, open])

  const g = view.k === 'item' ? gear.find((x) => x.id === view.id) : undefined
  const su = view.k === 'setup' ? setups.find((x) => x.id === view.id) : undefined
  // a piece or setup deleted elsewhere goes back to the root
  const gone = (view.k === 'item' && !g) || (view.k === 'setup' && !su)
  useEffect(() => {
    if (open && gone) setView({ k: 'root' })
  }, [open, gone])
  const back = () => go({ k: 'root' })
  const pieces = su ? activeGear(gear).filter((x) => x.setup === su.id).length : 0

  const head =
    view.k === 'item' && g
      ? { t: gName(g), d: typeOf(g).label + (g.status === 'retired' ? ' · retired' + (g.retired ? ' ' + playDate(g.retired) : '') : '') }
      : view.k === 'setup' && su
        ? { t: su.name || 'Untitled setup', d: `Setup · ${pieces} piece${pieces === 1 ? '' : 's'} of equipment` }
        : view.k === 'add'
          ? { t: 'Add equipment', d: view.setup === ALL_SETUPS ? 'Shared by all setups' : 'To ' + setupName(setups, view.setup) }
          : { t: 'Equipment', d: 'Your setups, and how much play each piece has seen' }

  return (
    <Drawer side="right" open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="w-full sm:max-w-xl">
        <DrawerHeader className="gap-1">
          {view.k !== 'root' && (
            <Button size="sm" variant="ghost" className="-ms-3 self-start" onClick={back}>
              ‹ All gear
            </Button>
          )}
          <DrawerTitle ref={title} tabIndex={-1} className="break-words outline-none">
            {head.t}
          </DrawerTitle>
          <DrawerDescription>{head.d}</DrawerDescription>
          {view.k === 'item' && g && canEdit && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Button size="sm" variant={editing ? 'primary' : 'outline'} onClick={() => setEditing(!editing)}>
                {editing ? 'Done' : 'Edit'}
              </Button>
              {editing && (
                <span role="status" className="text-foreground-muted text-xs">
                  {saved}
                </span>
              )}
            </div>
          )}
          {view.k === 'setup' && (
            <span role="status" className="text-foreground-muted text-xs">
              {saved}
            </span>
          )}
        </DrawerHeader>
        <DrawerBody ref={body}>
          <Boundary key={view.k + ('id' in view ? view.id : '')} title="Couldn't show this" onClose={onClose}>
            {error && (
              <Alert variant="error" className="mb-4" dismissible onOpenChange={(o) => !o && clearError()}>
                <AlertTitle>{error}</AlertTitle>
              </Alert>
            )}
            <div className="pb-8">
              {view.k === 'root' && <Root go={go} onRecord={onRecord} />}
              {view.k === 'item' && g && (editing && canEdit ? <GearEdit key={g.id} g={g} onStatus={setSaved} onGone={back} /> : <GearItem key={g.id} g={g} onOpen={(id) => go({ k: 'item', id })} />)}
              {view.k === 'setup' && su && canEdit && <SetupView key={su.id} x={su} onStatus={setSaved} onGone={back} />}
              {view.k === 'add' && canEdit && <AddGear setup={view.setup} type={view.type} onAdded={(id) => go({ k: 'item', id })} onCancel={back} />}
            </div>
          </Boundary>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}
