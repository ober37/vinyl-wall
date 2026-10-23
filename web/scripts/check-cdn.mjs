// Loads the built page (dist/index.html) in Chrome the way claude.ai would serve it, with a tiny stand-in runtime, and
// uses it: filters the wall with a chip, opens a record, picks Side in Log a play. Fails on any page error or on a control
// that doesn't work (a Toggle that never finds its group is what loading appica as separate CDN files did, #60).
// The page imports React and appica from the vendor file on jsdelivr; --local serves web/vendor/vendor.js in its place,
// to check a vendor build before it's published. Needs Chrome; set CHROME to its path if it isn't in the usual macOS place.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'
import vendor from '../vendor/package.json' with { type: 'json' }

const VENDOR_URL = `https://cdn.jsdelivr.net/npm/${vendor.name}@${vendor.version}/vendor.js`
const local = process.argv.includes('--local')

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

// just enough of window.claude for the wall to render a few records
const stub = () => {
  const snap = (id, data) => ({ id, exists: !!data, data: () => data, metadata: {} })
  const recs = {
    r1: { title: 'Kind of Blue', artist: 'Miles Davis', status: 'own', runtime: 46, notes: [], added: 1 },
    r2: { title: 'Aja', artist: 'Steely Dan', status: 'ordered', notes: [], added: 2 },
    r3: { title: 'Pet Sounds', artist: 'The Beach Boys', status: 'wish', notes: [], added: 3 },
  }
  const coll = (name) => ({
    doc: (id) => ({ onSnapshot: (n) => (setTimeout(() => n(snap(id, null))), () => {}) }),
    onSnapshot: (n) => {
      const docs = name === 'records' ? Object.entries(recs).map(([id, r]) => snap(id, r)) : []
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
  // failed loads are reported with their URL by the response listener
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && fail.push('console: ' + m.text()))
  page.on('response', (r) => r.status() >= 400 && fail.push(`${r.status()} ${r.url()}`))
  if (local) {
    const body = readFileSync(join(import.meta.dirname, '../vendor/vendor.js'))
    await page.setRequestInterception(true)
    page.on('request', (r) =>
      r.url() === VENDOR_URL
        ? r.respond({ status: 200, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body })
        : r.continue(),
    )
  }
  await page.evaluateOnNewDocument(stub)
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.waitForSelector('[data-testid=sleeve]', { timeout: 15000 })
  const sleeves = () => page.$$eval('[data-testid=sleeve]', (b) => b.length)
  const click = async (xpath) => {
    const [el] = await page.$$('xpath/' + xpath)
    if (!el) throw new Error('not found: ' + xpath)
    await el.click()
    await new Promise((r) => setTimeout(r, 400))
  }
  // a filter chip narrows the wall to its records, and pressed again shows them all
  await click(`.//button[contains(normalize-space(), "on the way")]`)
  if ((await sleeves()) !== 1) fail.push(`filter chip: the wall shows ${await sleeves()} records, expected 1`)
  await click(`.//button[contains(normalize-space(), "on the way")]`)
  if ((await sleeves()) !== 3) fail.push(`filter chip off: the wall shows ${await sleeves()} records, expected 3`)
  // a record opens, and Log a play's Side choice takes (it shows the side picker)
  await page.click('[data-id=r1]')
  await page.waitForSelector('[role=dialog]', { timeout: 15000 })
  await new Promise((r) => setTimeout(r, 800)) // the sheet slides in; click once it's still
  await click(`.//button[normalize-space()="Side"]`)
  if (!(await page.$('xpath/.//button[normalize-space()="Side A"]'))) fail.push('Log a play: choosing Side did nothing')
  console.log(`vendor: ${local ? 'web/vendor/vendor.js (local)' : VENDOR_URL}`)
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
console.log('PASS the built page filters the wall, opens a record and takes a Log a play choice')
