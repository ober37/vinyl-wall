// Writes cdn-lock.json: the import map that lets the built page load React and appica from jsdelivr.
//
// appica, Base UI and the rest load as their own published ES module files (not jsdelivr's per-component bundles, which
// each carry a private copy of shared state, so a Toggle never found its ToggleGroup, #60). Each file is loaded once, by
// URL, so every part shares one copy. Starting from what the app imports, this walks the installed packages the way a
// browser would and maps each bare import (`@base-ui/react/toggle`) to its file on jsdelivr at the installed version.
// CommonJS packages (React, react-dom, use-sync-external-store) can't load that way: they map to jsdelivr's converted
// +esm files, and every React those pull in is sent to the one React the page uses.
//
// Run after installing or upgrading packages, or importing a new appica component: `npm run cdn:lock`.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { init, parse } from 'es-module-lexer'

await init
const CDN = 'https://cdn.jsdelivr.net/npm/'
const WEB = join(import.meta.dirname, '..')
const SRC = join(WEB, 'src')
// what the page loads from the CDN rather than bundling: React and appica, and everything they import
const EXTERNAL = /^(react|react-dom|@appica\/ui-react)(\/|$)/
const CONDITIONS = ['browser', 'import', 'module', 'production', 'default']
// libraries of plain functions (no state that parts must share) load as jsdelivr's one-file bundle instead of hundreds
// of files: date-fns alone is 300
const BUNDLED = ['date-fns']

const json = (f) => JSON.parse(readFileSync(f, 'utf8'))
const files = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(d, e.name)) : [join(d, e.name)]))
const splitSpec = (s) => {
  const parts = s.split('/')
  const n = s.startsWith('@') ? 2 : 1
  return [parts.slice(0, n).join('/'), parts.slice(n).join('/')]
}
// the package a bare import means, seen from a directory (Node's lookup: the nearest node_modules up the tree)
function packageDir(name, from) {
  for (let d = from; ; d = dirname(d)) {
    const p = join(d, 'node_modules', name)
    if (existsSync(join(p, 'package.json'))) return p
    if (dirname(d) === d) throw new Error(`can't find ${name} from ${from}`)
  }
}
// package.json "exports": the target for a subpath, picking conditions the way a browser bundle would
function pickTarget(t) {
  if (typeof t === 'string') return t
  if (Array.isArray(t)) return t.map(pickTarget).find(Boolean) ?? null
  if (t && typeof t === 'object') for (const c of CONDITIONS) if (c in t) {
    const r = pickTarget(t[c])
    if (r) return r
  }
  return null
}
function resolveExports(exp, sub) {
  // "imports" maps are keyed by "#name"; an "exports" map without "." keys is the package's one export
  const keyed = typeof exp === 'object' && !Array.isArray(exp) && Object.keys(exp).some((k) => k.startsWith('.') || k.startsWith('#'))
  const map = keyed ? exp : { '.': exp }
  if (sub in map) return pickTarget(map[sub])
  for (const [k, v] of Object.entries(map)) {
    const star = k.indexOf('*')
    if (star < 0) continue
    const [pre, post] = [k.slice(0, star), k.slice(star + 1)]
    if (sub.startsWith(pre) && sub.endsWith(post)) {
      const t = pickTarget(v)
      return t && t.replace('*', sub.slice(pre.length, sub.length - post.length))
    }
  }
  return null
}
const withExt = (p) => [p, p + '.mjs', p + '.js', join(p, 'index.mjs'), join(p, 'index.js')].find((f) => existsSync(f) && statSync(f).isFile())
function resolveBare(spec, from) {
  const [name, sub] = splitSpec(spec)
  const dir = packageDir(name, from)
  const pj = json(join(dir, 'package.json'))
  let target = pj.exports ? resolveExports(pj.exports, sub ? './' + sub : '.') : sub || pj.module || pj.main || 'index.js'
  if (!target) throw new Error(`${spec}: no export for it in ${name}`)
  const file = withExt(join(dir, target))
  if (!file) throw new Error(`${spec}: ${target} doesn't exist in ${name}`)
  return { name, sub, dir, version: pj.version, file }
}
function isEsm(file, src) {
  if (file.endsWith('.mjs')) return true
  if (file.endsWith('.cjs')) return false
  // the nearest package.json decides; without a "type", look at the code
  for (let d = dirname(file); dirname(d) !== d; d = dirname(d))
    if (existsSync(join(d, 'package.json'))) {
      const t = json(join(d, 'package.json')).type
      if (t) return t === 'module'
      break
    }
  return !/\bmodule\.exports\b|\brequire\(/.test(src)
}

const imports = {} // bare specifier or URL -> URL
// a package's own "#name" imports (package.json "imports"), mapped only for files under that package's URL
const scopes = {}
function ownPackage(from) {
  for (let d = from; dirname(d) !== d; d = dirname(d)) if (existsSync(join(d, 'package.json'))) {
    const pj = json(join(d, 'package.json'))
    if (pj.name) return { dir: d, pj }
  }
  throw new Error(`no package around ${from}`)
}
const cjs = new Map() // +esm URL -> package version, for the React dedupe below
const seenFiles = new Set()
const queue = []
// the app's own imports of external packages
for (const f of files(SRC).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f)))
  for (const m of readFileSync(f, 'utf8').matchAll(/from '([^'.][^']*)'/g)) if (EXTERNAL.test(m[1])) queue.push([m[1], WEB])
queue.push(['react/jsx-runtime', WEB], ['react', WEB])

const urlOf = (r) => CDN + `${r.name}@${r.version}/` + relative(r.dir, r.file).split(sep).join('/')
while (queue.length) {
  const [spec, from] = queue.shift()
  if (spec.startsWith('.') || spec.startsWith('/')) {
    // a relative import from a file already on the CDN: the browser resolves it, unless it leaves off an extension
    const want = join(from, spec)
    const file = withExt(want)
    if (!file) throw new Error(`${spec} from ${from}: no such file`)
    if (file !== want) {
      throw new Error(`${spec} from ${from} needs an extension the browser can't add (${relative(WEB, file)})`)
    }
    if (!seenFiles.has(file)) walk(file)
    continue
  }
  if (spec.startsWith('#')) {
    const { dir, pj } = ownPackage(from)
    const target = pj.imports && resolveExports(pj.imports, spec)
    const file = target && withExt(join(dir, target))
    if (!file) throw new Error(`${spec} isn't in ${pj.name}'s imports`)
    const r = { name: pj.name, version: pj.version, dir, file, sub: '' }
    const src = readFileSync(file, 'utf8')
    if (!isEsm(file, src)) throw new Error(`${spec} in ${pj.name} is CommonJS`)
    ;(scopes[CDN + `${pj.name}@${pj.version}/`] ||= {})[spec] = urlOf(r)
    if (!seenFiles.has(file)) walk(file)
    continue
  }
  const r = resolveBare(spec, from)
  const src = readFileSync(r.file, 'utf8')
  let url
  if (BUNDLED.includes(r.name)) {
    url = CDN + `${r.name}@${r.version}${r.sub ? '/' + r.sub : ''}/+esm`
    cjs.set(url, r)
  } else if (isEsm(r.file, src)) {
    url = urlOf(r)
    if (!seenFiles.has(r.file)) walk(r.file)
  } else {
    url = CDN + `${r.name}@${r.version}${r.sub ? '/' + r.sub : ''}/+esm`
    cjs.set(url, r)
  }
  if (imports[spec] && imports[spec] !== url) throw new Error(`${spec} resolves to both ${imports[spec]} and ${url}`)
  imports[spec] = url
}
function walk(file) {
  seenFiles.add(file)
  const src = readFileSync(file, 'utf8')
  // every import and re-export with a literal specifier (a dynamic import of a computed one can't be followed)
  for (const i of parse(src)[0]) if (typeof i.specifier === 'string' && !i.typeOnly) queue.push([i.specifier, dirname(file)])
}

// jsdelivr's +esm files of the CommonJS packages import their own dependencies by version or range (react-dom asks for
// react@^19.3.0): send every version of each to the installed one, so there's one React
const installed = {}
for (const r of cjs.values()) installed[r.name] = r.version
const crawl = [...cjs.keys()]
const fetched = new Set()
while (crawl.length) {
  const u = crawl.shift()
  if (fetched.has(u)) continue
  fetched.add(u)
  const res = await fetch(u)
  if (!res.ok) throw new Error(`${res.status} ${u}`)
  for (const m of (await res.text()).matchAll(/(?:from|import)\s*\(?\s*"(\/npm\/[^"]+)"/g)) crawl.push('https://cdn.jsdelivr.net' + m[1])
}
for (const u of fetched) {
  const m = /^https:\/\/cdn\.jsdelivr\.net\/npm\/((?:@[^/]+\/)?[^@/]+)@([^/]+)\//.exec(u)
  if (!m) continue
  const [, name, v] = m
  if (!installed[name]) {
    // a package only the converted files use: pin it to whatever they asked for, first seen
    installed[name] = decodeURIComponent(v).replace(/^\^|~/, '')
  }
  if (decodeURIComponent(v) !== installed[name]) imports[`${CDN}${name}@${v}/`] = `${CDN}${name}@${installed[name]}/`
}

{ const per = {}; for (const f of seenFiles) { const m = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(f); per[m[1]] = (per[m[1]] || 0) + 1 } console.log(Object.entries(per).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + " " + v).join(", ")) }
writeFileSync(
  join(WEB, 'cdn-lock.json'),
  JSON.stringify({ note: 'Generated by scripts/cdn-lock.mjs; commit it.', files: seenFiles.size, importMap: { imports, scopes } }, null, 2) + '\n',
)
console.log(`${Object.keys(imports).length} import map entries, ${seenFiles.size} ES module files, ${cjs.size} converted CommonJS entries`)
