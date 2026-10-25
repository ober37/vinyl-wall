// The claude.ai runtime as React state: boots the capabilities once, keeps the wall's data live, and is the only path
// to writes and to starting the background task.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { withSync } from '../model/edit'
import type { Gear, Setup } from '../model/gear'
import type { Rec } from '../model/record'
import { siteOf, type Site } from '../model/site'
import { aboutPending, pendingParts, pendingWork, runActive, runEnds, syncing, type Settings } from '../model/task'

type Db = ClaudeCapabilityMap['db']
type Mcp = ClaudeCapabilityMap['mcp']
type Assets = ClaudeCapabilityMap['assets']
type Downloads = ClaudeCapabilityMap['downloads']
type Doc = Record<string, unknown> & { id: string }
type GearPatch = Record<string, unknown> | ((g: Gear | undefined) => Record<string, unknown> | null | undefined)
export type Status = 'loading' | 'no-runtime' | 'no-db' | 'ready' | 'revoked'

type Runtime = {
  status: Status
  records: Rec[]
  // the settings doc as stored, and what the wall draws from it (defaults until, or unless, it loads)
  settings: Settings
  // the settings doc has arrived (until then settings holds nothing, not the wall's choices)
  settingsLoaded: boolean
  site: Site
  // read-only here until its slice: About the artist
  artists: Doc[]
  gear: Gear[]
  setups: Setup[]
  canEdit: boolean
  // this viewer's id (their private data lives under data/users/<id>), and what this view can do
  myId: string | null
  hasMcp: boolean
  // uploads (Editors only; null for everyone else)
  hasAssets: boolean
  // one write at a time, so a record never has two in flight; resolves false when the write was refused
  update: (id: string, patch: Record<string, unknown>) => Promise<boolean>
  // a write computed from the record as the database has it right now (for the notes array, which is replaced whole);
  // fn returns null to write nothing, or throws to report why it can't
  mutate: (id: string, fn: (latest: Rec) => Record<string, unknown> | null) => Promise<boolean>
  // a record synced to Discogs is marked deleted so the background task can take it off Discogs; others go for good
  remove: (id: string) => Promise<boolean>
  // a new record: mint its id once (a retry after a failed write reuses it), then set it; resolves false on failure
  newId: () => string
  create: (id: string, doc: Record<string, unknown>) => Promise<boolean>
  // store an image (already shrunk) and resolve its asset id; rejects with a message to show
  upload: (file: Blob) => Promise<string>
  // removes a stored image nothing points at any more; a failure is left alone (production's assets.delete in a try)
  deleteAsset: (id: string) => Promise<void>
  // only the changed fields are written, so a save never undoes what the background task wrote meanwhile
  saveSettings: (patch: Settings) => Promise<boolean>
  // equipment: a piece of gear is written whole with what changed merged in (as production's saveGear), one write at a
  // time; setups are set whole too. Each resolves false when the write was refused.
  // data can be worked out from the piece as it is (undefined when it's gone); nothing returned writes nothing
  saveGear: (id: string, data: GearPatch) => Promise<boolean>
  deleteGear: (id: string) => Promise<boolean>
  // what: the words for a failure, "save the setup" unless said
  saveSetup: (id: string, doc: Record<string, unknown>, what?: string) => Promise<boolean>
  deleteSetup: (id: string) => Promise<boolean>
  newDocId: (collection: 'gear' | 'setups') => string
  // the library file (Export and Import in Settings): save a file to the viewer's device (rejects with { code }, "declined"
  // when they cancel), every document in a collection as stored (deleted records too), a document written whole, and the
  // ids of the images this wall holds (null when they can't be listed)
  hasDownloads: boolean
  saveFile: (filename: string, data: string | Blob) => Promise<void>
  readAll: (collection: string) => Promise<Doc[]>
  put: (collection: string, id: string, doc: Record<string, unknown>) => Promise<void>
  assetIds: () => Promise<Set<string> | null>
  // the viewer's Discogs token, in their private data (the background task reads data/users/me/discogs)
  saveToken: (token: string) => Promise<void>
  removeToken: () => Promise<void>
  // start the background task with what's waiting; at most once a minute (now skips that wait), one run at a time;
  // asked: the owner asked for it, so say why when it can't start
  fireTask: (how?: { now?: boolean; asked?: boolean }) => void
  // a sheet closing starts the task now if its edits are waiting to sync, instead of 20 seconds later
  flushSync: () => void
  // the last thing that went wrong, or a short notice about the page (production's flash): "Looking up …" isn't one, a
  // record's sheet shows that from the record itself
  error: string
  notice: string
  // clears the error and the notice; errorOnly keeps the notice (opening another record)
  clearError: (errorOnly?: boolean) => void
}

const Ctx = createContext<Runtime | null>(null)

// a save's fields merge into what's there one level down, as the database's update does: { discogs: { status } } keeps
// the rest of discogs, so a save made from an older copy can't undo a change made since
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
function mergeSettings(s: Settings, patch: Settings): Settings {
  const out: Settings = { ...s }
  for (const [k, v] of Object.entries(patch)) out[k] = isObj(v) && isObj(s[k]) ? { ...s[k], ...v } : v
  return out
}

export function useRuntime(): Runtime {
  const rt = useContext(Ctx)
  if (!rt) throw new Error('useRuntime outside RuntimeProvider')
  return rt
}

export const msgOf = (e: unknown) => (e as { message?: string; code?: string })?.message || (e as { code?: string })?.code || String(e)

export function RuntimeProvider({ claude, children }: { claude: Window['claude'] | undefined; children: ReactNode }) {
  const [status, setStatus] = useState<Status>(claude?.use ? 'loading' : 'no-runtime')
  const [records, setRecords] = useState<Rec[]>([])
  const [settings, setSettings] = useState<Settings>({})
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [artists, setArtists] = useState<Doc[]>([])
  const [gear, setGear] = useState<Gear[]>([])
  const [setups, setSetups] = useState<Setup[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [myId, setMyId] = useState<string | null>(null)
  const [hasMcp, setHasMcp] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const db = useRef<Db | null>(null)
  const mcp = useRef<Mcp | null>(null)
  const assets = useRef<Assets | null>(null)
  const [hasAssets, setHasAssets] = useState(false)
  const downloads = useRef<Downloads | null>(null)
  const [hasDownloads, setHasDownloads] = useState(false)
  const writing = useRef<Promise<unknown>>(Promise.resolve())
  const settingsWriting = useRef<Promise<unknown>>(Promise.resolve())
  const settingsExist = useRef(false)
  const gearWriting = useRef<Promise<unknown>>(Promise.resolve())
  // the gear as the page has it, writes included; a snapshot taken while gear writes wait is held until they're done
  // (production's pendingGear), so it can't undo one that hasn't been written yet
  const gearLive = useRef<Gear[]>([])
  const gearPending = useRef(0)
  const gearSnap = useRef<Gear[] | null>(null)
  const gotGear = (G: Gear[]) => {
    gearSnap.current = G
    if (gearPending.current) return
    gearLive.current = G
    setGear(G)
  }
  // the latest data, for the task logic (which runs outside renders)
  const live = useRef({ records, settings, canEdit })
  live.current = { records, settings, canEdit }
  const task = useRef({ lastFire: 0, fireTimer: 0 as unknown as ReturnType<typeof setTimeout>, afterRun: false, syncDirty: false, syncTimer: 0 as unknown as ReturnType<typeof setTimeout> })

  useEffect(() => {
    if (!claude?.use) return
    const unsubs: (() => void)[] = []
    let alive = true
    const use = <K extends keyof ClaudeCapabilityMap & string>(k: K) => claude.use(k).catch(() => null)
    Promise.all([use('db'), use('user'), use('mcp'), use('assets'), use('downloads')]).then(async ([d, u, m, a, dl]) => {
      if (!alive) return
      if (!d) return setStatus('no-db')
      db.current = d
      mcp.current = m
      setHasMcp(!!m)
      assets.current = a
      setHasAssets(!!a)
      downloads.current = dl
      setHasDownloads(!!dl)
      // can("data.write") is the platform's answer; null means it said nothing, so fall back to production's check.
      // Walls installed earlier keep the runtime they were published with, which may not have can() at all.
      const w = u ? (typeof u.can === 'function' ? await u.can('data.write').catch(() => null) : null) : false
      const edit = w ?? (u ? (await u.canEdit().catch(() => false)) || (await u.isOwner().catch(() => false)) : false)
      const id = u ? await u.id().catch(() => null) : null
      if (!alive) return
      setCanEdit(edit)
      setMyId(id)
      // a settings failure leaves the default look; only the records decide the page's status
      unsubs.push(
        d.doc('settings/site').onSnapshot(
          (snap) => {
            settingsExist.current = snap.exists
            setSettings(snap.exists ? (snap.data() as Settings) : {})
            setSettingsLoaded(true)
          },
          () => {},
        ),
      )
      const docs = (path: string, set: (d: Doc[]) => void) =>
        unsubs.push(d.collection(path).onSnapshot((snap) => set(snap.docs.map((x) => ({ ...x.data(), id: x.id }))), () => {}))
      docs('artists', setArtists)
      docs('gear', gotGear as (d: Doc[]) => void)
      docs('setups', setSetups as (d: Doc[]) => void)
      unsubs.push(
        d.collection('records').onSnapshot(
          (snap) => {
            setRecords(snap.docs.map((x) => ({ ...x.data(), id: x.id }) as Rec).filter((r) => !r.deleted))
            setStatus('ready')
          },
          (e) => {
            setError("Couldn't load the wall: " + e.message)
            setStatus(e.code === 'revoked' ? 'revoked' : 'no-db')
          },
        ),
      )
    })
    return () => {
      alive = false
      unsubs.forEach((u) => u())
    }
  }, [claude])

  const saveSettings = (patch: Settings) => {
    setSettings((s) => mergeSettings(s, patch))
    // a task started right after this save must already see it
    live.current.settings = mergeSettings(live.current.settings, patch)
    const next = settingsWriting.current.then(async () => {
      try {
        const ref = db.current!.doc('settings/site')
        if (settingsExist.current) await ref.update(patch)
        else {
          await ref.set({ ...live.current.settings, ...patch })
          settingsExist.current = true
        }
        return true
      } catch (e) {
        setError("Couldn't save settings: " + msgOf(e))
        return false
      }
    })
    settingsWriting.current = next
    return next
  }

  // ported from production's fireTask: one run at a time (settings.run marks it; the task clears it), a start asked for
  // meanwhile waits for that run to end, and starts are at least a minute apart. Only a start the owner asked for says
  // why it can't run; one the page starts on its own (a record added, an edit to sync) stays quiet
  const fireTask = (how?: { now?: boolean; asked?: boolean }) => {
    const t = task.current
    if (how?.now) {
      t.lastFire = 0
      clearTimeout(t.fireTimer)
    }
    const { settings: s, records: recs } = live.current
    if (!mcp.current) return how?.asked && setNotice("Background updates aren't available in this view. Ask Claude in chat to sync.")
    if (runActive(s)) {
      t.afterRun = true
      return
    }
    const wait = t.lastFire + 60000 - Date.now()
    if (wait > 0) {
      clearTimeout(t.fireTimer)
      t.fireTimer = setTimeout(fireTask, wait + 500)
      return
    }
    t.lastFire = Date.now()
    // each install stores the id of its own background task in settings (written during setup)
    if (!s.taskId) {
      t.lastFire = 0
      return how?.asked && setNotice("Background updates aren't set up yet. Ask Claude to finish setting up your Vinyl Wall.")
    }
    // the run says what it leaves for the next as it goes, so one that stops before saving anything isn't followed
    saveSettings({ run: { startedMs: Date.now() }, lookupLeft: 0, syncLeft: 0 })
    mcp.current
      .callTool('Claude Code Remote', 'fire_trigger', { trigger_id: s.taskId, text: pendingWork(recs, s) }, { cache: false })
      .catch((e: { code?: string; message?: string }) => {
        t.lastFire = 0
        saveSettings({ run: { startedMs: 0 } })
        setNotice(
          e.code === 'not_granted' || e.code === 'permission_denied'
            ? 'Background updates need permission to start Claude tasks. Allow it for this page and try again.'
            : "Couldn't start the background update: " + msgOf(e),
        )
      })
  }

  // a run ending (or going quiet too long) lets a start that waited for it go, if anything is still waiting, and a run
  // that left records for the next (lookups take 60 at a time, the sync stops after 10 minutes) is followed by it
  const [quiet, setQuiet] = useState(0)
  useEffect(() => {
    const t = task.current
    if (runActive(settings)) {
      const id = setTimeout(() => setQuiet((n) => n + 1), Math.min(runEnds(settings) - Date.now(), 20 * 60000) + 1000)
      return () => clearTimeout(id)
    }
    if (t.afterRun) {
      t.afterRun = false
      if (pendingParts(records, settings, true).length) {
        t.lastFire = 0
        fireTask()
        return
      }
    }
    if (canEdit && (Number(settings.lookupLeft) > 0 || Number(settings.syncLeft) > 0)) fireTask()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, quiet])

  // records waiting for album info, or for a sync marked elsewhere (chat, another device), start the task on their own,
  // at most every 30 minutes across reloads; a sync waits the usual 20 seconds, so the page's own edits still finish first
  useEffect(() => {
    if (status !== 'ready' || !settingsLoaded || !canEdit || !hasMcp || !settings.taskId || runActive(settings)) return
    const look = records.some((r) => !r.deleted && !r.example && aboutPending(r))
    if (!look && !records.some((r) => syncing(r, settings.discogs?.status === 'ok'))) return
    let t = 0
    try {
      t = +(localStorage.getItem('vw-lookup') || 0)
    } catch {
      // storage blocked: look up now
    }
    if (Date.now() - t < 30 * 60000) return
    try {
      localStorage.setItem('vw-lookup', String(Date.now()))
    } catch {
      // not remembered
    }
    if (look) fireTask()
    else syncSoon()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, settingsLoaded, canEdit, hasMcp, records, settings])

  // an edit to a field Discogs keeps starts the task 20 seconds after the last such edit (or when the sheet closes)
  const syncSoon = () => {
    const t = task.current
    t.syncDirty = true
    clearTimeout(t.syncTimer)
    t.syncTimer = setTimeout(() => {
      if (t.syncDirty) {
        t.syncDirty = false
        fireTask()
      }
    }, 20000)
  }
  const flushSync = () => {
    const t = task.current
    if (!t.syncDirty) return
    t.syncDirty = false
    clearTimeout(t.syncTimer)
    writing.current.then(() => fireTask())
  }

  // every write waits its turn; a fresh one reads the record first, so it builds on what's there now
  // what: the words for a failure ("Couldn't save: …", "Couldn't remove it: …")
  const queue = (id: string, fn: (latest: Rec) => Record<string, unknown> | 'delete' | null, fresh = false, what = 'save') => {
    const next = writing.current.then(async () => {
      try {
        const ref = db.current!.collection('records').doc(id)
        let latest = {} as Rec
        if (fresh) {
          const snap = await ref.get()
          if (!snap.exists) throw new Error('This record is gone.')
          latest = { ...snap.data(), id } as Rec
        }
        const patch = fn(latest)
        if (patch === 'delete') await ref.delete()
        else if (patch) {
          const data = withSync(patch)
          await ref.update(data)
          // the task's start message reads the records now, before the snapshot brings this write back
          live.current.records = live.current.records.map((r) => (r.id === id ? { ...r, ...data } : r))
          if (data.needsSync) syncSoon()
        }
        setError('')
        return !!patch
      } catch (e) {
        setError("Couldn't " + what + ': ' + msgOf(e))
        return false
      }
    })
    writing.current = next
    return next
  }

  // a new record goes straight in with set(), as production's createRecord does (no needsSync: the task syncs records that
  // have no discogsSync yet), in the same queue as every other write
  const create = (id: string, doc: Record<string, unknown>) => {
    const next = writing.current.then(async () => {
      try {
        await db.current!.collection('records').doc(id).set(doc)
        // the task's start message counts records now, before the snapshot brings this one back
        if (!live.current.records.some((r) => r.id === id)) live.current.records = [...live.current.records, { ...doc, id } as Rec]
        setError('')
        return true
      } catch (e) {
        setError("Couldn't add it: " + msgOf(e))
        return false
      }
    })
    writing.current = next
    return next
  }
  const upload = async (file: Blob) => {
    if (!assets.current) throw new Error("Uploads aren't available in this view.")
    const tryIt = () => assets.current!.upload(file)
    try {
      return (await tryIt().catch((e: { code?: string }) => (e?.code === 'store_unavailable' ? tryIt() : Promise.reject(e)))).id
    } catch (e) {
      const code = (e as { code?: string })?.code
      throw new Error(
        code === 'too_large'
          ? 'That image is too big to store. Try a smaller one.'
          : code === 'not_granted' || code === 'capability_removed'
            ? "Uploads aren't available in this view."
            : msgOf(e),
      )
    }
  }

  // gear and setups take their turn in their own queue; the gear shows the change at once
  const gearWrite = (what: string, fn: () => Promise<unknown>) => {
    gearPending.current++
    const next = gearWriting.current.then(async () => {
      try {
        await fn()
        return true
      } catch (e) {
        setError(`Couldn't ${what}: ` + msgOf(e))
        return false
      } finally {
        if (!--gearPending.current && gearSnap.current) gotGear(gearSnap.current)
      }
    })
    gearWriting.current = next
    return next
  }
  const saveGear = (id: string, data: GearPatch) => {
    const G = gearLive.current
    const cur = G.find((x) => x.id === id)
    const patch = typeof data === 'function' ? data(cur) : data
    if (!patch) return Promise.resolve(false)
    const g = { ...(cur || {}), ...patch, id } as Gear
    gearLive.current = G.some((x) => x.id === id) ? G.map((x) => (x.id === id ? g : x)) : [...G, g]
    setGear(gearLive.current)
    const { id: _, ...payload } = g
    return gearWrite('save equipment', () => db.current!.collection('gear').doc(id).set(payload))
  }
  const deleteGear = (id: string) => {
    gearLive.current = gearLive.current.filter((x) => x.id !== id)
    setGear(gearLive.current)
    return gearWrite('delete', () => db.current!.collection('gear').doc(id).delete())
  }
  const saveSetup = (id: string, doc: Record<string, unknown>, what = 'save the setup') => {
    setSetups((S) => (S.some((x) => x.id === id) ? S.map((x) => (x.id === id ? { ...doc, id } : x)) : [...S, { ...doc, id }]))
    return gearWrite(what, () => db.current!.collection('setups').doc(id).set(doc))
  }
  const deleteSetup = (id: string) => {
    setSetups((S) => S.filter((x) => x.id !== id))
    return gearWrite('delete', () => db.current!.collection('setups').doc(id).delete())
  }

  const secret = () => (myId && db.current ? db.current.collection('data/users/' + myId).doc('discogs') : null)

  const value = useMemo<Runtime>(
    () => ({
      status,
      records,
      settings,
      settingsLoaded,
      site: siteOf(settings),
      artists,
      gear,
      setups,
      canEdit,
      myId,
      hasMcp,
      hasAssets,
      error,
      notice,
      clearError: (errorOnly) => {
        setError('')
        if (!errorOnly) setNotice('')
      },
      update: (id, patch) => queue(id, () => patch),
      mutate: (id, fn) => queue(id, fn, true),
      remove: (id) => {
        // a record on Discogs is marked, so the task can take it off there too
        let synced = false
        return queue(id, (r) => ((synced = !!(r.discogsSync as { rid?: unknown } | undefined)?.rid) ? { deleted: true } : 'delete'), true, 'remove it').then((ok) => {
          if (ok && synced) setNotice('Removed. Taking it off Discogs too.')
          return ok
        })
      },
      newId: () => db.current!.collection('records').doc().id,
      create,
      upload,
      deleteAsset: (id) => (assets.current ? assets.current.delete(id).then(() => {}, () => {}) : Promise.resolve()),
      saveSettings,
      saveGear,
      deleteGear,
      saveSetup,
      deleteSetup,
      newDocId: (c) => db.current!.collection(c).doc().id,
      saveToken: async (token) => {
        const ref = secret()
        // said as it is, not as a failed save
        if (!ref) throw Object.assign(new Error('Sign in to claude.ai to save your token.'), { code: 'signed-out' })
        await ref.set({ token, savedAt: new Date().toISOString() })
      },
      removeToken: async () => {
        await secret()?.delete()
      },
      hasDownloads,
      saveFile: async (filename, data) => {
        if (!downloads.current) throw { code: 'unavailable', message: "Saving files isn't available here." }
        await downloads.current.save({ filename, data })
      },
      readAll: async (c) => (await db.current!.collection(c).get()).docs.map((x) => ({ ...x.data(), id: x.id }) as Doc),
      // in turn with the record writes; a record put in counts for the task's start message straight away, as create's do
      put: (c, id, doc) => {
        const next = writing.current.then(async () => {
          await db.current!.collection(c).doc(id).set(doc)
          if (c === 'records' && !live.current.records.some((r) => r.id === id)) live.current.records = [...live.current.records, { ...doc, id } as Rec]
        })
        writing.current = next.catch(() => {})
        return next
      },
      assetIds: async () => {
        try {
          return assets.current ? new Set((await assets.current.list()).assets.map((a) => a.id)) : null
        } catch {
          return null
        }
      },
      fireTask,
      flushSync,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, records, settings, artists, gear, setups, canEdit, myId, hasMcp, hasAssets, hasDownloads, error, notice],
  )

  return <Ctx value={value}>{children}</Ctx>
}
