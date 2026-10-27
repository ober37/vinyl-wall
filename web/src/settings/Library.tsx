// Your library in Settings: Export your library to a file, and Import from a file one step at a time (choose a file, see
// what it adds, bring it in, done), as production's exportLibrary/openImport/readLibrary/applyLibrary. The import's state
// lives with the Settings sheet, so it keeps going when the sheet is closed.
import { useEffect, useRef, useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { shrinkImage } from '../model/image'
import {
  coverIds,
  doneMessage,
  exportFile,
  fileImage,
  fillPatch,
  gearFill,
  imageFile,
  importableArtist,
  libCount,
  lookPatch,
  planImport,
  planSummary,
  shopsFrom,
  recordWrites,
  setupFill,
  type Plan,
} from '../model/library'
import { today, type Rec } from '../model/record'
import { aboutPending } from '../model/task'
import { msgOf, useRuntime } from '../runtime/runtime'
import { APP_VERSION } from '../version'

// msg: why a file adds nothing; stopped: an import that stopped part-way, which can try the same file again
type Stage = 'idle' | 'plan' | 'busy' | 'done' | 'msg' | 'stopped'
// fn over the items, n at a time
async function pool<T>(n: number, items: T[], fn: (x: T) => Promise<void>) {
  let next = 0
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) await fn(items[next++])
    }),
  )
}
const dataURL = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(String(fr.result))
    fr.onerror = () => rej(fr.error)
    fr.readAsDataURL(b)
  })

export function useLibrary() {
  const rt = useRuntime()
  // the wall as it is now, for the steps of an import that outlive the render that started it
  const live = useRef(rt)
  live.current = rt
  const [stage, setStage] = useState<Stage>('idle')
  const [msg, setMsg] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [fileName, setFileName] = useState('')
  // the file as read, so a stopped import can try again without choosing it again
  const text = useRef('')
  // a stop part-way: the same file can be tried again
  const [seen, setSeen] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState('')

  const exportIt = async () => {
    if (exporting) return
    setExporting(true)
    setExportMsg('Saving your library…')
    const file = exportFile({
      records: rt.records,
      gear: rt.gear,
      setups: rt.setups,
      artists: rt.artists,
      settings: rt.settings,
      app: APP_VERSION,
    })
    // covers (and a photo background) travel as images by asset id, so a new wall needs no lookup for them (#35, #37);
    // read 6 at a time so a big wall's reads aren't throttled into "couldn't be included"
    const { ids, covers } = coverIds(file)
    let missed = 0
    await pool(6, ids, async (id) => {
      try {
        const res = await fetch('/_blob/' + encodeURIComponent(id))
        if (!res.ok) throw new Error(String(res.status))
        file.covers![id] = await dataURL(await res.blob())
      } catch {
        if (covers.has(id)) missed++
      }
    })
    try {
      await rt.saveFile(`vinyl-wall-${today()}.json`, JSON.stringify(file, null, 1))
      const n = (o?: object) => Object.keys(o || {}).length
      setExportMsg(
        `Saved ${libCount(n(file.records), n(file.gear), n(file.setups))}.` +
          (missed ? ` ${missed} cover${missed === 1 ? '' : 's'} couldn't be included.` : ''),
      )
    } catch (e) {
      setExportMsg((e as { code?: string })?.code === 'declined' ? '' : "Couldn't save the file: " + msgOf(e))
    }
    setExporting(false)
  }

  const read = async (t: string) => {
    setPlan(null)
    try {
      const [records, artists] = await Promise.all([rt.readAll('records'), rt.readAll('artists')])
      const p = planImport(t, {
        records,
        artists,
        gear: rt.gear,
        setups: rt.setups,
        settings: rt.settings,
      })
      if (typeof p === 'string') {
        setMsg(p)
        setStage('msg')
      } else {
        setPlan(p)
        setMsg('')
        setStage('plan')
      }
    } catch (e) {
      setMsg("Couldn't read the wall: " + msgOf(e))
      setStage('msg')
    }
  }
  const choose = async (f: File) => {
    if (stage === 'busy') return
    setFileName(f.name || '')
    try {
      text.current = await f.text()
    } catch {
      setMsg("Couldn't read this file. Choose it again, or another one.")
      setStage('msg')
      return
    }
    read(text.current)
  }

  const apply = async () => {
    const p = plan
    if (!p || stage === 'busy') return
    setPlan(null)
    setStage('busy')
    setSeen(false)
    setMsg('Bringing in your library…')
    // a cover id only works on the wall that stored it: anything this wall doesn't hold is uploaded from the file (#35),
    // or looked up again when the file has no image for it or the upload fails
    const stored = rt.hasAssets ? await rt.assetIds() : null
    const has = (id: unknown) => !!stored?.has(id as string)
    const moved = new Map<string, string>()
    const upload = async (id: string, max: number) => {
      try {
        moved.set(id, await rt.upload(await shrinkImage(imageFile(fileImage(p, id)!), max, 0.82)))
      } catch {
        /* looked up again instead */
      }
    }
    // the covers of records brought in, and of records here that get one from the file (#90)
    const up = [
      ...new Set(
        [...p.recs.map(([, d]) => d.coverAsset), ...p.fills.recs.map(([, d]) => d.coverAsset)].filter(
          (id): id is string => typeof id === 'string' && !has(id) && !!fileImage(p, id),
        ),
      ),
    ]
    // three at a time, as export reads them several at a time
    let uploaded = 0
    if (rt.hasAssets)
      await pool(3, up, async (id) => {
        await upload(id, 500)
        if (++uploaded % 5 === 0 || uploaded === up.length) setMsg(`Bringing in covers: ${uploaded} of ${up.length}…`)
      })
    setMsg('Bringing in records…')
    // album and artist info come across as found (#37); a record whose artist didn't come and isn't on this wall is looked up again
    const artistIds = new Set([...p.artists.map(([id]) => id), ...p.known])
    const recs = recordWrites(p, has, moved, artistIds)
    let done = 0
    try {
      for (const [id, d] of p.setups) await rt.put('setups', id, d)
      for (const [id, d] of p.gear) await rt.put('gear', id, d)
      for (const [id, d] of p.artists) await rt.put('artists', id, importableArtist(d))
      for (const [id, d] of recs) {
        await rt.put('records', id, d)
        if (++done % 5 === 0) setMsg(`Bringing in records: ${done} of ${recs.length}…`)
      }
      // what's already here gets what it's missing, worked out again on each one as it is now, so nothing changed since
      // the plan is written over; a cover this wall can't hold stays for the lookup (#90)
      for (const [id, d] of p.fills.setups) {
        const x = live.current.setups.find((s) => s.id === id)
        const patch = x && setupFill(x, d)
        if (patch && Object.keys(patch).length) {
          const { id: _, ...doc } = x
          await rt.saveSetup(id, { ...doc, ...patch })
        }
      }
      for (const [id, d] of p.fills.gear) await rt.saveGear(id, (g) => (g && Object.keys(gearFill(g, d)).length ? gearFill(g, d) : null))
      for (const [id, d] of p.fills.artists) await rt.put('artists', id, d)
      for (const [id, d] of p.fills.recs)
        await rt.mutate(id, (latest) => {
          const patch = fillPatch(latest, d)
          if (typeof patch.coverAsset === 'string') {
            const c = has(patch.coverAsset) ? patch.coverAsset : moved.get(patch.coverAsset)
            if (c) patch.coverAsset = c
            else delete patch.coverAsset
          }
          return Object.keys(patch).length ? patch : null
        })
      // a wall that had no records takes the file's look too; an existing wall keeps its own, and gains the file's shops
      if (p.empty) await takeLook(p, has, moved, upload)
      else {
        const m = shopsFrom(rt.settings, p.site)
        if (m) await rt.saveSettings({ shops: m.list })
      }
      setMsg(
        doneMessage(
          p,
          recs.map(([, d]) => d),
        ),
      )
      text.current = ''
      setStage('done')
      if (recs.some(([, d]) => d.needsEnrich || aboutPending(d as Rec))) rt.fireTask({ now: true })
    } catch (e) {
      setMsg(`Stopped after ${done} of ${recs.length} records: ${msgOf(e)}. Import the file again to bring in the rest.`)
      setStage('stopped')
    }
  }
  const takeLook = async (p: Plan, has: (id: unknown) => boolean, moved: Map<string, string>, upload: (id: string, max: number) => Promise<void>) => {
    const bg = (p.site.bg || {}) as { kind?: string; assetId?: string }
    // the file carries the photo itself; a wall that already holds it uses its own copy
    let photo: string | null = null
    if (bg.kind === 'photo' && bg.assetId) {
      if (has(bg.assetId)) photo = bg.assetId
      else if (live.current.hasAssets && fileImage(p, bg.assetId)) {
        await upload(bg.assetId, 2000)
        photo = moved.get(bg.assetId) || null
      }
    }
    const patch = lookPatch(p.site, photo)
    const rt = live.current
    const uploads = (rt.settings.uploads || []) as { id: string }[]
    if (photo && !uploads.some((u) => u.id === photo)) patch.uploads = [...uploads, { id: photo, name: 'Your photo' }]
    if (Object.keys(patch).length) await rt.saveSettings(patch)
    // setup gives every new wall an empty "My setup", and a file exported from such a wall can carry it too: once the
    // file brings its own setups, drop any "My setup" that's still untouched (no notes, no gear), as long as one remains
    if (!p.setups.length) return
    const left = new Set([...rt.setups.map((x) => x.id), ...p.setups.map(([id]) => id)])
    for (const x of rt.setups)
      if (x.name === 'My setup' && !x.note && !rt.gear.some((g) => g.setup === x.id) && !p.gear.some(([, d]) => d.setup === x.id) && left.size > 1) {
        await rt.deleteSetup(x.id)
        left.delete(x.id)
      }
  }

  // leaving the import view: a plan not yet confirmed, or a finished import now seen, starts over next time
  const leave = () => {
    if (stage === 'busy') return
    setSeen(true)
    if (stage !== 'stopped') {
      text.current = ''
      setStage('idle')
      setPlan(null)
      setMsg('')
      setFileName('')
    }
  }
  return {
    stage,
    msg,
    plan,
    fileName,
    exporting,
    exportMsg,
    exportIt,
    choose,
    apply,
    leave,
    tryAgain: () => read(text.current),
    // an import under way, or finished and not yet seen: Settings opens on it
    active: stage === 'busy' || (!seen && (stage === 'done' || stage === 'stopped')),
  }
}
export type Library = ReturnType<typeof useLibrary>

// the file picker behind every "Choose a file"
function useChooser(lib: Library) {
  const input = useRef<HTMLInputElement>(null)
  const el = (
    <input
      ref={input}
      type="file"
      accept=".json,application/json"
      hidden
      aria-hidden="true"
      onChange={(e) => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (f) lib.choose(f)
      }}
    />
  )
  return { el, open: () => input.current?.click() }
}

export function LibrarySection({ lib, onImport }: { lib: Library; onImport: () => void }) {
  const { hasDownloads } = useRuntime()
  return (
    <Fieldset>
      <div className="flex flex-col gap-2">
        <FieldsetLegend>Your library</FieldsetLegend>
        <p className="text-foreground-muted text-sm">
          Save your records, equipment and settings to a file you keep, or bring in a file you exported from a wall. Your Discogs token is never
          included.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {hasDownloads && (
          <Button size="sm" variant="outline" disabled={lib.exporting} onClick={lib.exportIt}>
            Export your library
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onImport}>
          Import from a file
        </Button>
      </div>
      <p role="status" className="text-foreground-muted text-sm empty:hidden">
        {lib.exportMsg}
      </p>
      {lib.active && (
        <p className="text-foreground-muted text-sm">
          {lib.msg}{' '}
          <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={onImport}>
            See progress
          </button>
        </p>
      )}
    </Fieldset>
  )
}

// the import's steps, inside the Settings sheet under its own title
export function ImportView({ lib, onDone }: { lib: Library; onDone: () => void }) {
  const chooser = useChooser(lib)
  // the step's own button takes focus as a plan or a finished import comes up
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (lib.stage === 'plan' || lib.stage === 'done') first.current?.focus()
  }, [lib.stage])
  const row = 'flex flex-col gap-3 sm:flex-row *:w-full sm:*:w-auto'
  const file = lib.fileName && <p className="text-foreground-intense font-mono text-sm break-all">{lib.fileName}</p>
  return (
    <div className="flex flex-col gap-6">
      {chooser.el}
      {/* one live region for the whole import, mounted from the start so every step is read out (out of the way while empty) */}
      <div className={lib.stage === 'idle' ? 'sr-only' : 'flex flex-col gap-2'}>
        {lib.stage !== 'done' && file}
        <p role="status" className="text-foreground text-sm">
          {lib.stage === 'plan' && lib.plan ? planSummary(lib.plan) : lib.msg}
        </p>
        {lib.stage === 'busy' && <p className="text-foreground-muted text-sm">Keep this page open until it's done.</p>}
      </div>
      {lib.stage === 'plan' && (
        <div className={row}>
          <Button ref={first} onClick={lib.apply}>
            Bring them in
          </Button>
          <Button variant="outline" onClick={chooser.open}>
            Choose another file
          </Button>
        </div>
      )}
      {lib.stage === 'stopped' && (
        <div className={row}>
          <Button onClick={lib.tryAgain}>Try again</Button>
          <Button variant="outline" onClick={chooser.open}>
            Choose another file
          </Button>
        </div>
      )}
      {(lib.stage === 'idle' || lib.stage === 'msg') && (
        <div className={row}>
          <Button onClick={chooser.open}>Choose a file</Button>
        </div>
      )}
      {lib.stage === 'done' && (
        <div className={row}>
          <Button ref={first} onClick={onDone}>
            See your wall
          </Button>
        </div>
      )}
    </div>
  )
}
