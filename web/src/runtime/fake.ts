// A stand-in for window.claude, for local dev and tests. Behaves like the real db where the slice depends on it:
// update() requires the doc and merges nested objects, unsubscribe really unsubscribes, snapshots arrive async.

type Data = Record<string, Record<string, unknown>>
export type Call = { path: string; op: 'update' | 'delete'; data?: Record<string, unknown> }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
function merge(a: Record<string, unknown>, b: Record<string, unknown>) {
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k] as Record<string, unknown>, v) : v
  return out
}

export function fakeClaude(seed: { records: Data }, opts: { canWrite?: boolean | null; failWrites?: boolean } = {}) {
  const records: Data = structuredClone(seed.records)
  const calls: Call[] = []
  const listeners = new Set<() => void>()
  const snap = () => {
    const docs = Object.entries(records).map(([id, d]) => ({
      id,
      exists: true,
      data: () => structuredClone(d),
      metadata: { fromCache: false, hasPendingWrites: false },
    }))
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } }
  }
  const collection = (path: string) => {
    if (path !== 'records') throw new Error('fake db: only records')
    return {
      path,
      onSnapshot(next: (s: ReturnType<typeof snap>) => void) {
        const fire = () => queueMicrotask(() => listeners.has(fire) && next(snap()))
        listeners.add(fire)
        fire()
        return () => void listeners.delete(fire)
      },
      doc: (id: string) => ({
        id,
        path: `${path}/${id}`,
        async get() {
          const d = records[id]
          return { id, exists: !!d, data: () => (d ? structuredClone(d) : undefined), metadata: { fromCache: false, hasPendingWrites: false } }
        },
        async delete() {
          if (opts.failWrites) throw { code: 'not_granted', message: 'Not allowed' }
          calls.push({ path: `${path}/${id}`, op: 'delete' })
          delete records[id]
          listeners.forEach((l) => l())
        },
        async update(data: Record<string, unknown>) {
          if (opts.failWrites) throw { code: 'not_granted', message: 'Not allowed' }
          if (!records[id]) throw { code: 'invalid_argument', message: 'No such document' }
          calls.push({ path: `${path}/${id}`, op: 'update', data })
          records[id] = merge(records[id], data)
          listeners.forEach((l) => l())
        },
      }),
    }
  }
  // stands in for a change made elsewhere (another device, the background task); quiet: its snapshot hasn't arrived yet
  const remote = (id: string, data: Record<string, unknown>, quiet = false) => {
    records[id] = merge(records[id], data)
    if (!quiet) listeners.forEach((l) => l())
  }
  const canWrite = opts.canWrite === undefined ? true : opts.canWrite
  const db = { collection, doc: () => { throw new Error('fake db: no docs') } }
  const user = {
    can: async () => canWrite,
    canEdit: async () => !!canWrite,
    isOwner: async () => !!canWrite,
  }
  const claude = { use: async (name: string) => (name === 'db' ? db : name === 'user' ? user : null) }
  return { claude: claude as unknown as Window['claude'], calls, remote, records }
}
