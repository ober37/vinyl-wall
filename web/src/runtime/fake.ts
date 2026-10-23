// A stand-in for window.claude, for local dev and tests. Behaves like the real db where the page depends on it:
// update() requires the doc and merges nested objects, unsubscribe really unsubscribes, snapshots arrive async.
// Any collection path works (records, gear, data/users/<id>, ...); a doc path is its collection plus an id.

type Data = Record<string, Record<string, unknown>>
export type Call = { path: string; op: 'update' | 'set' | 'delete' | 'fire'; data?: Record<string, unknown> }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
function merge(a: Record<string, unknown>, b: Record<string, unknown>) {
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k] as Record<string, unknown>, v) : v
  return out
}
const meta = { fromCache: false, hasPendingWrites: false }
const split = (path: string) => {
  const i = path.lastIndexOf('/')
  return [path.slice(0, i), path.slice(i + 1)] as [string, string]
}

export function fakeClaude(
  // collections by path; `docs` puts single docs in by their full path (settings/site)
  seed: { records: Data; docs?: Data; collections?: Record<string, Data> },
  // oldRuntime: a wall published on an earlier runtime, whose user capability has no can()
  opts: { canWrite?: boolean | null; failWrites?: boolean; userId?: string; mcp?: 'ok' | 'denied' | 'none'; oldRuntime?: boolean } = {},
) {
  const store: Record<string, Data> = structuredClone({ ...(seed.collections || {}), records: seed.records })
  for (const [path, d] of Object.entries(structuredClone(seed.docs || {}))) {
    const [c, id] = split(path)
    ;(store[c] ||= {})[id] = d
  }
  const calls: Call[] = []
  const listeners = new Set<() => void>()
  const fireAll = () => listeners.forEach((l) => l())
  const deny = () => {
    if (opts.failWrites) throw { code: 'not_granted', message: 'Not allowed' }
  }

  const snapOf = (c: string, id: string) => {
    const d = store[c]?.[id]
    return { id, exists: !!d, data: () => (d ? structuredClone(d) : undefined), metadata: meta }
  }
  const docRef = (c: string, id: string) => ({
    id,
    path: `${c}/${id}`,
    async get() {
      return snapOf(c, id)
    },
    async set(data: Record<string, unknown>) {
      deny()
      calls.push({ path: `${c}/${id}`, op: 'set', data })
      ;(store[c] ||= {})[id] = structuredClone(data)
      fireAll()
    },
    async update(data: Record<string, unknown>) {
      deny()
      if (!store[c]?.[id]) throw { code: 'invalid_argument', message: 'No such document' }
      calls.push({ path: `${c}/${id}`, op: 'update', data })
      store[c][id] = merge(store[c][id], data)
      fireAll()
    },
    async delete() {
      deny()
      calls.push({ path: `${c}/${id}`, op: 'delete' })
      if (store[c]) delete store[c][id]
      fireAll()
    },
    onSnapshot(next: (s: ReturnType<typeof snapOf>) => void) {
      const fire = () => queueMicrotask(() => listeners.has(fire) && next(snapOf(c, id)))
      listeners.add(fire)
      fire()
      return () => void listeners.delete(fire)
    },
  })
  const collection = (c: string) => ({
    path: c,
    doc: (id: string) => docRef(c, id),
    onSnapshot(next: (s: unknown) => void) {
      const fire = () =>
        queueMicrotask(() => {
          if (!listeners.has(fire)) return
          const docs = Object.keys(store[c] || {}).map((id) => snapOf(c, id))
          next({ docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: meta })
        })
      listeners.add(fire)
      fire()
      return () => void listeners.delete(fire)
    },
  })
  const db = { collection, doc: (path: string) => docRef(...split(path)) }

  // stands in for a change made elsewhere (another device, the background task); quiet: its snapshot hasn't arrived yet
  const remote = (id: string, data: Record<string, unknown>, quiet = false) => {
    store.records[id] = merge(store.records[id], data)
    if (!quiet) fireAll()
  }
  const remoteDoc = (path: string, data: Record<string, unknown>) => {
    const [c, id] = split(path)
    ;(store[c] ||= {})[id] = merge(store[c]?.[id] || {}, data)
    fireAll()
  }

  const canWrite = opts.canWrite === undefined ? true : opts.canWrite
  const user: Record<string, unknown> = {
    can: async () => canWrite,
    canEdit: async () => !!canWrite,
    isOwner: async () => !!canWrite,
    id: async () => opts.userId ?? 'u_me',
  }
  if (opts.oldRuntime) delete user.can
  const mcp = {
    async callTool(server: string, tool: string, input: Record<string, unknown>) {
      if (opts.mcp === 'denied') throw { code: 'not_granted', message: 'Not granted' }
      calls.push({ path: `${server}/${tool}`, op: 'fire', data: input })
      return { payload: {} }
    },
  }
  const caps: Record<string, unknown> = { db, user, mcp: opts.mcp === 'none' ? null : mcp }
  const claude = { use: async (name: string) => caps[name] ?? null }
  return { claude: claude as unknown as Window['claude'], calls, remote, remoteDoc, records: store.records, store }
}
