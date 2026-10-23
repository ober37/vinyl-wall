// Loads the built page (dist/index.html) in Chrome the way claude.ai would serve it, with a tiny stand-in runtime,
// opens a record, and fails on any page error or on more than one version of a library being imported (two Reacts
// break hooks). jsdelivr also sends modulepreload hints for each file's own pins, which the browser fetches without the
// import map; those are downloaded but never run, so only modules a script imported are counted.
// Needs the network (jsdelivr) and Chrome; set CHROME to its path if it isn't in the usual macOS place.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'

const html = readFileSync(join(import.meta.dirname, '../dist/index.html'))
const server = createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') return res.writeHead(200, { 'Content-Type': 'text/html' }).end(html)
  // the background photos are published beside the page, as SETUP.md does
  const bg = /^\/backgrounds\/([a-z0-9-]+\.jpg)$/.exec(req.url || '')
  if (bg) return res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end(readFileSync(join(import.meta.dirname, '../../app/backgrounds', bg[1])))
  res.writeHead(req.url === '/favicon.ico' ? 204 : 404).end()
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const port = server.address().port

// just enough of window.claude for the wall to render one record
const stub = () => {
  const snap = (id, data) => ({ id, exists: !!data, data: () => data, metadata: {} })
  const rec = { title: 'Kind of Blue', artist: 'Miles Davis', status: 'own', notes: [] }
  const coll = (name) => ({
    doc: (id) => ({ onSnapshot: (n) => (setTimeout(() => n(snap(id, null))), () => {}) }),
    onSnapshot: (n) => {
      const docs = name === 'records' ? [snap('r1', rec)] : []
      setTimeout(() => n({ docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} }))
      return () => {}
    },
  })
  const db = { collection: coll, doc: () => ({ onSnapshot: (n) => (setTimeout(() => n(snap('site', null))), () => {}) }) }
  const user = { can: async () => true, canEdit: async () => true, isOwner: async () => true, id: async () => 'u_check' }
  window.claude = { use: async (k) => ({ db, user })[k] ?? null }
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
})
const fail = []
try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => fail.push('page error: ' + e.message))
  // failed loads are reported with their URL by the response listener below
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && fail.push('console: ' + m.text()))
  const loaded = new Map()
  page.on('response', (r) => r.status() >= 400 && fail.push(`${r.status()} ${r.url()}`))
  page.on('request', (r) => {
    if (r.initiator()?.url === 'about:client') return // a preload hint, not an import
    const m = /cdn\.jsdelivr\.net\/npm\/((?:@[^/]+\/)?[^@/]+)@([^/]+)\//.exec(r.url())
    if (m) (loaded.get(m[1]) || loaded.set(m[1], new Set()).get(m[1])).add(decodeURIComponent(m[2]))
  })
  await page.evaluateOnNewDocument(stub)
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.waitForSelector('[data-testid=sleeve]', { timeout: 15000 })
  await page.click('[data-testid=sleeve]')
  await page.waitForSelector('[role=dialog]', { timeout: 15000 })
  for (const [pkg, vs] of loaded) if (vs.size > 1) fail.push(`${pkg} loaded at ${[...vs].join(', ')}`)
  console.log(`jsdelivr: ${loaded.size} packages, ${[...loaded.values()].reduce((n, v) => n + v.size, 0)} versions`)
} catch (e) {
  fail.push(String(e.message || e))
} finally {
  await browser.close()
  server.close()
}
if (fail.length) {
  console.error('FAIL\n' + fail.join('\n'))
  process.exit(1)
}
console.log('PASS the built page loads one version of each library and opens a record')
