import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Field, FieldLabel, FieldDescription } from '@appica/ui-react/field'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Input } from '@appica/ui-react/input'
import { Slider } from '@appica/ui-react/slider'
import { Toggle } from '@appica/ui-react/toggle'
import { ToggleGroup } from '@appica/ui-react/toggle-group'
import { useDebouncedSave } from '../gear/useDebouncedSave'
import { shrinkImage } from '../model/image'
import { BACKGROUNDS, DEFAULT_DIM, DEFAULT_TITLE, HANGS, isStockPhoto, okAsset, presetOf, siteOf, type Background } from '../model/site'
import { useRuntime } from '../runtime/runtime'
import { Confirm } from '../sheet/Confirm'
import { Tip, TipGroup } from '../wall/Tip'
import { WallBackground, bgClass, bgStyle } from '../wall/Wall'

type Upload = { id: string; name?: string }
// a tile's key: "preset:<key>" or "photo:<asset id>"
const bgOf = (key: string) => (key.startsWith('photo:') ? { kind: 'photo', assetId: key.slice(6) } : { kind: 'preset', preset: key.slice(7) })
const kindOf = (key: string) => (key.startsWith('photo:') ? 'upload' : isStockPhoto(key.slice(7)) ? 'stock' : 'pattern')

export function PageSection() {
  const { settings, saveSettings } = useRuntime()
  const [title, setTitle] = useState(String(settings.title || ''))
  const [saved, setSaved] = useState('')
  const live = useRef(title)
  live.current = title
  // takes the stored title when it arrives or changes elsewhere, unless an edit here is waiting to save
  const editing = useRef(false)
  useEffect(() => {
    if (!editing.current) setTitle(String(settings.title || ''))
  }, [settings.title])
  const { schedule } = useDebouncedSave(
    () =>
      saveSettings({ title: live.current.trim() }).then((ok) => {
        editing.current = false
        setSaved(ok ? 'Saved' : '')
      }),
    setSaved,
    500,
  )
  return (
    <Fieldset>
      <FieldsetLegend>Page</FieldsetLegend>
      <Field>
        <div className="flex items-baseline gap-2">
          <FieldLabel>Title</FieldLabel>
          <span role="status" className="text-foreground-muted text-xs">
            {saved}
          </span>
        </div>
        <Input
          value={title}
          placeholder={DEFAULT_TITLE}
          maxLength={60}
          onChange={(e) => {
            editing.current = true
            setTitle(e.target.value)
            schedule()
          }}
        />
      </Field>
    </Fieldset>
  )
}

// a tile: its picture on top, its name under it starting on the picture's edge; the chosen one is ringed outside its edge
const TILE = 'group flex min-w-0 cursor-pointer flex-col gap-2 text-start outline-none'
const SWATCH =
  'bg-wall border-border block w-full overflow-hidden rounded-md border group-data-pressed:outline-2 group-data-pressed:outline-offset-2 group-data-pressed:outline-primary group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-(--focus-ring)'
const NAME = 'text-foreground-muted group-data-pressed:text-foreground-intense text-sm break-words'

const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" className="size-3.5">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

export function BackgroundSection() {
  const { settings, saveSettings, hasAssets, upload, deleteAsset } = useRuntime()
  const bg = (settings.bg || { kind: 'preset', preset: 'listening' }) as {
    kind?: string
    preset?: string
    assetId?: string
  }
  const uploads = ((settings.uploads || []) as Upload[]).filter((u) => okAsset(u?.id))
  // a photo is the owner's even when it's missing from uploads (production adds it there later), as the wall draws it
  const isUpload = bg.kind === 'photo' && okAsset(bg.assetId)
  const current = isUpload ? 'photo:' + bg.assetId : 'preset:' + presetOf(bg)
  const stock = kindOf(current) === 'stock'
  const savedDim = typeof settings.dim === 'number' ? settings.dim : DEFAULT_DIM[isUpload ? 'upload' : 'stock']
  // while the slider moves: the wash it would give, on the chosen tile and the wall, with the sheet stepped aside (wall.css)
  const [dragging, setDragging] = useState<number | null>(null)
  const dim = dragging ?? savedDim
  // the slider's min + max, to turn a stored wash into a strength and back
  const top = isUpload ? 110 : 100
  const previewing = dragging !== null
  useEffect(() => {
    if (!previewing) return
    const root = document.documentElement
    root.dataset.previewing = ''
    return () => void delete root.dataset.previewing
  }, [previewing])
  const [status, setStatus] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)

  // what a tile or the slider draws: the wall's own reading of that setting
  const look = (key: string, v?: number): Background => siteOf({ bg: bgOf(key), dim: v }).background
  // uploaded and stock photos use different slider scales: moving to a photo of the other kind starts at its default
  const dimFor = (key: string) => {
    const k = kindOf(key)
    return k !== 'pattern' && k !== kindOf(current) ? { dim: DEFAULT_DIM[k] } : {}
  }

  // moving onto an uploaded photo remembers the background it replaced, so removing the photo goes back to it
  const before = (key: string) =>
    key.startsWith('photo:') && !isUpload
      ? { bgBefore: { preset: current.slice(7), ...(typeof settings.dim === 'number' ? { dim: settings.dim } : {}) } }
      : {}
  const prev = (settings.bgBefore || {}) as { preset?: string; dim?: number }
  const back = 'preset:' + presetOf(prev)
  const backName = BACKGROUNDS.find(([k]) => 'preset:' + k === back)![1]
  const pick = (key: string) => {
    if (!key || key === current) return
    saveSettings({ bg: bgOf(key), ...dimFor(key), ...before(key) })
  }
  const [busy, setBusy] = useState(false)
  const add = async (f: File | undefined) => {
    if (!f || busy) return
    if (f.size > 15 * 1024 * 1024) return setStatus('That image is over 15 MB. Try a smaller one.')
    setStatus('Uploading…')
    setBusy(true)
    try {
      const id = await upload(await shrinkImage(f, 2000, 0.82))
      const name = (f.name || 'Your photo').replace(/\.[^.]+$/, '').slice(0, 40)
      await saveSettings({
        uploads: [...uploads, { id, name }],
        bg: { kind: 'photo', assetId: id },
        ...dimFor('photo:' + id),
        ...before('photo:' + id),
      })
      setStatus('')
    } catch (e) {
      setStatus('Upload failed: ' + ((e as Error).message || String(e)))
    }
    setBusy(false)
  }
  const remove = async (id: string) => {
    const patch: Record<string, unknown> = {
      uploads: uploads.filter((u) => u.id !== id),
    }
    if (current === 'photo:' + id)
      Object.assign(patch, { bg: bgOf(back) }, typeof prev.dim === 'number' && kindOf(back) === 'stock' ? { dim: prev.dim } : dimFor(back))
    if (await saveSettings(patch)) deleteAsset(id)
  }
  const removingCurrent = removing !== null && current === 'photo:' + removing

  // a tile shows its own photo at its kind's default wash, and the chosen one at the wash set
  const tile = (key: string, name: string) => {
    const l = look(key, key === current ? dim : undefined)
    return (
      <Toggle key={key} value={key} className={TILE}>
        <span className={`${SWATCH} aspect-4/3 ${bgClass(l)}`} style={bgStyle(l)} />
        <span className={NAME}>{name}</span>
      </Toggle>
    )
  }

  return (
    <Fieldset>
      <FieldsetLegend>Background</FieldsetLegend>
      <div className="flex flex-col gap-2">
        <TipGroup>
          <ToggleGroup
            value={[current]}
            onValueChange={(v) => pick(String(v[0] || ''))}
            className="grid w-full grid-cols-2 items-start gap-3 sm:grid-cols-3"
          >
            {BACKGROUNDS.map(([k, name]) => tile('preset:' + k, name))}
            {uploads.map((u) => (
              <div key={u.id} className="relative min-w-0">
                {tile('photo:' + u.id, u.name || 'Your photo')}
                {/* beside the tile, not in it (a button can't sit inside another); 24px to see, 44px to tap. Only where the
                    stored image can go too, so nothing is left behind with no tile pointing at it */}
                {hasAssets && (
                  <Tip label="Remove this background">
                    <button
                      type="button"
                      aria-label={`Remove ${u.name || 'this photo'}`}
                      onClick={() => setRemoving(u.id)}
                      className="bg-ink/70 text-wall absolute end-1.5 top-1.5 grid size-6 cursor-pointer place-items-center rounded-full after:absolute after:-inset-2.5 focus-visible:outline-2 focus-visible:outline-(--focus-ring)"
                    >
                      <XIcon />
                    </button>
                  </Tip>
                )}
              </div>
            ))}
            {hasAssets && (
              // the list's last slot: a dashed tile the size of the others
              <button type="button" className={TILE} disabled={busy} onClick={() => file.current?.click()}>
                <span className="border-border-strong text-foreground-muted grid aspect-4/3 w-full place-items-center rounded-md border border-dashed text-2xl leading-none group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-(--focus-ring)">
                  +
                </span>
                <span className={NAME}>Upload your own</span>
              </button>
            )}
          </ToggleGroup>
        </TipGroup>
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          aria-label="Upload your own background"
          onChange={(e) => add(e.target.files?.[0]).then(() => (e.target.value = ''))}
        />
        {status && (
          <p role="status" className="text-foreground-muted text-sm">
            {status}
          </p>
        )}
        {!hasAssets && <p className="text-foreground-muted text-sm">Uploading your own background isn't available in this view.</p>}
      </div>
      {(isUpload || stock) && (
        <Field className="soften">
          <FieldLabel>Photo strength</FieldLabel>
          {/* the slider runs the other way to the stored wash: right is more photo, in either theme */}
          <Slider
            value={top - dim}
            min={isUpload ? 20 : 0}
            max={isUpload ? 90 : 100}
            step={5}
            thumbAriaLabel="Photo strength"
            tooltipVisibility="never"
            onValueChange={(v) => setDragging(top - (v as number))}
            onValueCommitted={(v) => saveSettings({ dim: top - (v as number) }).then(() => setDragging(null))}
          />
          <div aria-hidden="true" className="text-foreground-muted flex justify-between text-xs">
            <span>Faint</span>
            <span>Strong</span>
          </div>
          <FieldDescription>{previewing ? 'Showing your wall. Let go to come back.' : 'Turn it down if the records get hard to read.'}</FieldDescription>
        </Field>
      )}
      {dragging !== null && createPortal(<WallBackground bg={look(current, dragging)} />, document.body)}
      <Confirm
        open={removing !== null}
        title={'Remove this background for good?' + (removingCurrent ? ` The wall goes back to ${backName}.` : '')}
        yes="Remove"
        onYes={() => removing && remove(removing)}
        onClose={() => setRemoving(null)}
      />
    </Fieldset>
  )
}

export function HangingSection() {
  const { site, saveSettings } = useRuntime()
  return (
    <Fieldset>
      <FieldsetLegend>Hanging</FieldsetLegend>
      <ToggleGroup
        value={[site.hang]}
        onValueChange={(v) => v[0] && v[0] !== site.hang && saveSettings({ hang: String(v[0]) })}
        className="grid w-full grid-cols-2 items-start gap-3 sm:grid-cols-4"
      >
        {HANGS.map(([k, name]) => (
          <Toggle key={k} value={k} className={TILE}>
            {/* a small piece of wall in this style, cropped to the rail and the top of one sleeve */}
            <span className={`${SWATCH} h-20`} aria-hidden="true">
              <span className="rack grid-cols-1" data-hang={k}>
                <span className="slot block">
                  <span className="hanger block">
                    <span className="hook" />
                    <span className="sleeve-box mx-auto block w-24">
                      <span className="sleeve-face block bg-[linear-gradient(150deg,var(--accent),color-mix(in_oklch,var(--accent)_45%,var(--shade)))]" />
                    </span>
                  </span>
                </span>
              </span>
            </span>
            <span className={NAME}>{name}</span>
          </Toggle>
        ))}
      </ToggleGroup>
    </Fieldset>
  )
}
