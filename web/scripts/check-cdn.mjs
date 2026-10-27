// Loads the built page (dist/index.html) in Chrome the way claude.ai would serve it, with a tiny stand-in runtime, and
// uses it: filters the wall with a chip, opens a record, picks Side in Log a play, adds a record with an uploaded cover. Fails on any page error or on a control
// that doesn't work (a Toggle that never finds its group is what loading appica as separate CDN files did, #60).
// The page loads React and appica from jsdelivr through its import map, so this needs the network. It also reports how
// many files a first visit fetches and how long until the wall shows, and fails when those, the page's size or its
// longest line (SETUP has Claude read the page) go over BUDGET. Needs Chrome; set CHROME to its path if it isn't in the
// usual macOS place.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'

const html = readFileSync(join(import.meta.dirname, '../dist/index.html'))

// headroom over today's numbers (450 KB after phase 8 dropped the older-browser colour copies, 1,102 characters, 921
// files, 1.3 s); the time is loose because CI machines vary.
// 500 KB from #90 (import fill-in took the page to 485 KB; the page isn't minified, so code costs its full size).
// 1,000 files from #99 (appica's Autocomplete, for your shops where a record came from, took a first visit to 981).
// 1,050 files and 525 KB from #68 (appica's Toast, for the wall's messages, took a first visit to 1,018 and the page to
// 505 KB, most of it the toast's animation CSS).
// The import map is one long line of URLs, so it's left out of the line check.
const BUDGET = { kb: 525, line: 1500, files: 1050, seconds: 10 }
const fail = []
const kb = Math.round(html.length / 1024)
const line = Math.max(...html.toString().split('\n').filter((l) => !l.includes('type="importmap"')).map((l) => l.length))
console.log(`page: ${kb} KB, longest line ${line} characters`)
if (kb > BUDGET.kb) fail.push(`page is ${kb} KB, over the ${BUDGET.kb} KB budget`)
if (line > BUDGET.line) fail.push(`a line is ${line} characters, over the ${BUDGET.line} budget`)
// vite.config.ts's noColorFallbacks keeps only the color-mix() copy of each colour
if (html.includes('@supports (color: color-mix') || /^(\s+)([-\w]+): (?:(?!color-mix)[^;\n])*;\n\1\2: [^;\n]*color-mix/m.test(html))
  fail.push('the page still has older-browser colour copies')
const server = createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') return res.writeHead(200, { 'Content-Type': 'text/html' }).end(html)
  // the background photos are published beside the page, as SETUP.md does
  const bg = /^\/backgrounds\/([a-z0-9-]+\.jpg)$/.exec(req.url || '')
  if (bg) return res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end(readFileSync(join(import.meta.dirname, '../../app/backgrounds', bg[1])))
  // stored images (covers): claude.ai serves them at /_blob/<id>; any photo will do here
  if (req.url?.startsWith('/_blob/'))
    return res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end(readFileSync(join(import.meta.dirname, '../../app/backgrounds/record-shop.jpg')))
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
  const listeners = []
  const emit = (n) => {
    const docs = Object.entries(recs).map(([id, r]) => snap(id, r))
    setTimeout(() => n({ docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} }))
  }
  let seq = 0
  const coll = (name) => ({
    doc: (id = 'n' + ++seq) => ({
      id,
      onSnapshot: (n) => (setTimeout(() => n(snap(id, null))), () => {}),
      set: async (d) => {
        if (name === 'records') (recs[id] = d), listeners.forEach(emit)
      },
    }),
    onSnapshot: (n) => {
      if (name !== 'records') return (setTimeout(() => n({ docs: [], size: 0, empty: true, docChanges: () => [], metadata: {} })), () => {})
      listeners.push(n)
      emit(n)
      return () => {}
    },
  })
  const assets = { upload: async (b) => ({ id: 'a' + ++seq, url: '', sizeBytes: b.size, contentType: b.type }) }
  // window.__site: the settings doc, when a check needs one (a hanging style)
  const db = { collection: coll, doc: () => ({ onSnapshot: (n) => (setTimeout(() => n(snap('site', window.__site || null))), () => {}) }) }
  const user = { can: async () => true, canEdit: async () => true, isOwner: async () => true, id: async () => 'u_check' }
  const downloads = { save: async () => {} }
  window.claude = { use: async (k) => ({ db, user, assets, downloads })[k] ?? null }
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
})
try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => fail.push('page error: ' + e.message))
  // failed loads are reported with their URL by the response listener
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && fail.push('console: ' + m.text()))
  page.on('response', (r) => r.status() >= 400 && fail.push(`${r.status()} ${r.url()}`))
  let cdnFiles = 0
  page.on('request', (r) => r.url().startsWith('https://cdn.jsdelivr.net/') && cdnFiles++)
  const t0 = Date.now()
  await page.evaluateOnNewDocument(stub)
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.waitForSelector('[data-testid=sleeve]', { timeout: 15000 })
  const secs = (Date.now() - t0) / 1000
  console.log(`first visit: ${cdnFiles} files from jsdelivr, wall shown after ${secs.toFixed(1)} s`)
  if (cdnFiles > BUDGET.files) fail.push(`a first visit fetches ${cdnFiles} files, over the ${BUDGET.files} budget`)
  if (secs > BUDGET.seconds) fail.push(`the wall showed after ${secs.toFixed(1)} s, over the ${BUDGET.seconds} s budget`)
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
  // add a record with a cover uploaded first: it hangs and its sheet opens
  await page.keyboard.press('Escape')
  await new Promise((r) => setTimeout(r, 800))
  await click(`.//button[normalize-space()="Add a record"]`)
  await new Promise((r) => setTimeout(r, 800))
  await page.type('xpath/.//label[normalize-space()="Album"]/following::input[1]', 'Rumours')
  await page.type('xpath/.//label[normalize-space()="Artist"]/following::input[1]', 'Fleetwood Mac')
  await click(`.//button[normalize-space()="I own it"]`)
  await click(`.//button[normalize-space()="Add details now"]`)
  const file = await page.$('input[type=file][aria-label="Upload cover"]')
  if (!file) fail.push('Add a record: no cover upload')
  else {
    await file.uploadFile(join(import.meta.dirname, '../../app/backgrounds/record-shop.jpg'))
    await new Promise((r) => setTimeout(r, 1500))
    if (!(await page.$(`xpath/.//*[contains(text(), "Cover ready")]`))) fail.push("Add a record: the cover didn't upload")
  }
  await click(`.//button[normalize-space()="Hang it"]`)
  await new Promise((r) => setTimeout(r, 800))
  if (!(await page.$('xpath/.//h2[normalize-space()="Rumours"] | .//*[@data-slot="drawer-title" and normalize-space()="Rumours"]')))
    fail.push("Add a record: Hang it didn't open the new record")
  // the share picture hangs the records the way the wall does: the dark plank on Barnwood, a cork strip on Cork (a real
  // canvas, so it's checked here rather than in Vitest). The first rail runs along y 245-266 (Barnwood) and 259-278 (Cork)
  // of the 1080-wide picture, drawn at 2x; the stub wall's background is the listening-room photo, dark under its wash
  const railColour = async (site, y) => {
    const p = await browser.newPage()
    await p.evaluateOnNewDocument((s) => (window.__site = s), site)
    await p.evaluateOnNewDocument(stub)
    await p.goto(`http://127.0.0.1:${port}/`)
    await p.waitForSelector('[aria-label="Share your wall"]', { timeout: 20000 })
    await p.click('[aria-label="Share your wall"]')
    await p.waitForSelector('img[alt="Picture of your wall"]', { timeout: 15000 })
    // the rail's average colour over 80 pixels of its first length (the cork has grain; sleeves hang over its lower edge)
    const px = await p.$eval(
      'img[alt="Picture of your wall"]',
      async (img, y) => {
        await img.decode()
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        const g = c.getContext('2d')
        g.drawImage(img, 0, 0)
        const d = g.getImageData(140, y * 2, 80, 1).data
        const sum = [0, 0, 0]
        for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += d[i + k]
        return sum.map((x) => Math.round(x / 80))
      },
      y,
    )
    await p.close()
    return px
  }
  // each draws in its own page, so the two run side by side
  const [bw, ck] = await Promise.all([railColour(null, 255), railColour({ hang: 'cork' }, 263)])
  if (!(bw[0] < 100 && bw[0] > bw[2] && bw[0] - bw[2] < 40)) fail.push(`share picture: Barnwood's plank isn't drawn (${bw})`)
  if (!(ck[0] > 110 && ck[0] - ck[2] > 35)) fail.push(`share picture: Cork's strip isn't drawn (${ck})`)
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
console.log('PASS the built page filters the wall, opens a record, takes a Log a play choice, adds a record with a cover and draws the share picture')
