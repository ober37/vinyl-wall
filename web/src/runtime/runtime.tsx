// The claude.ai runtime as React state: boots db and user once, keeps the records live, and is the only path to writes.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { withSync } from '../model/edit'
import type { Rec } from '../model/record'

type Db = ClaudeCapabilityMap['db']
export type Status = 'loading' | 'no-runtime' | 'no-db' | 'ready' | 'revoked'

type Runtime = {
  status: Status
  records: Rec[]
  canEdit: boolean
  // one write at a time, so a record never has two in flight; resolves false when the write was refused
  update: (id: string, patch: Record<string, unknown>) => Promise<boolean>
  // a write computed from the record as the database has it right now (for the notes array, which is replaced whole);
  // fn returns null to write nothing, or throws to report why it can't
  mutate: (id: string, fn: (latest: Rec) => Record<string, unknown> | null) => Promise<boolean>
  // a record synced to Discogs is marked deleted so the background task can take it off Discogs; others go for good
  remove: (id: string) => Promise<boolean>
  error: string
  clearError: () => void
}

const Ctx = createContext<Runtime | null>(null)

export function useRuntime(): Runtime {
  const rt = useContext(Ctx)
  if (!rt) throw new Error('useRuntime outside RuntimeProvider')
  return rt
}

export function RuntimeProvider({ claude, children }: { claude: Window['claude'] | undefined; children: ReactNode }) {
  const [status, setStatus] = useState<Status>(claude?.use ? 'loading' : 'no-runtime')
  const [records, setRecords] = useState<Rec[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [error, setError] = useState('')
  const db = useRef<Db | null>(null)
  const writing = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    if (!claude?.use) return
    let unsub: (() => void) | undefined
    let live = true
    Promise.all([claude.use('db'), claude.use('user')]).then(async ([d, u]) => {
      if (!live) return
      if (!d) return setStatus('no-db')
      db.current = d
      // can("data.write") is the platform's answer; null means it said nothing, so fall back to production's check
      const w = u ? await u.can('data.write').catch(() => null) : false
      const edit = w ?? (u ? (await u.canEdit().catch(() => false)) || (await u.isOwner().catch(() => false)) : false)
      if (!live) return
      setCanEdit(edit)
      unsub = d.collection('records').onSnapshot(
        (snap) => {
          setRecords(snap.docs.map((x) => ({ ...x.data(), id: x.id }) as Rec).filter((r) => !r.deleted))
          setStatus('ready')
        },
        (e) => {
          setError(e.message)
          setStatus(e.code === 'revoked' ? 'revoked' : 'no-db')
        },
      )
    })
    return () => {
      live = false
      unsub?.()
    }
  }, [claude])

  // every write waits its turn; a fresh one reads the record first, so it builds on what's there now
  const queue = (id: string, fn: (latest: Rec) => Record<string, unknown> | 'delete' | null, fresh = false) => {
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
        else if (patch) await ref.update(withSync(patch))
        setError('')
        return !!patch
      } catch (e) {
        setError("Couldn't save: " + ((e as { message?: string }).message || String(e)))
        return false
      }
    })
    writing.current = next
    return next
  }

  const value = useMemo<Runtime>(
    () => ({
      status,
      records,
      canEdit,
      error,
      clearError: () => setError(''),
      update: (id, patch) => queue(id, () => patch),
      mutate: (id, fn) => queue(id, fn, true),
      remove: (id) =>
        queue(id, (r) => (r.discogsSync && (r.discogsSync as { rid?: unknown }).rid ? { deleted: true } : 'delete'), true),
    }),
    [status, records, canEdit, error],
  )

  return <Ctx value={value}>{children}</Ctx>
}
