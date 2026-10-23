import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import lock from './cdn-lock.json' with { type: 'json' }

const VERSION = readFileSync(resolve(import.meta.dirname, '../VERSION'), 'utf8').trim()
const define = { __APP_VERSION__: JSON.stringify(VERSION) }
// release.yml and dev/build_web.py read the version here: a minifier can rename the constant, never this
const versionMeta = () => ({
  name: 'version-meta',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'vinyl-wall-version', content: VERSION }, injectTo: 'head-prepend' as const }],
})
import { resolve } from 'node:path'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { getThemeScript } from '@appica/ui-react/providers/theme-provider'

// ThemeProvider's own script only runs when server-rendered; this page is
// client-only, so put it in <head> to set the theme class before first paint.
const themeScript = () => ({
  name: 'appica-theme-script',
  transformIndexHtml: () => [{ tag: 'script', children: getThemeScript(), injectTo: 'head-prepend' as const }],
})

// The background photos are published beside the page (SETUP.md's files), never inlined; in dev, serve them from app/
const backgrounds = () => ({
  name: 'dev-backgrounds',
  apply: 'serve' as const,
  configureServer(server: { middlewares: { use: (path: string, fn: (req: { url?: string }, res: { setHeader: (k: string, v: string) => void; end: (b: Buffer) => void }, next: () => void) => void) => void } }) {
    server.middlewares.use('/backgrounds', (req, res, next) => {
      const name = (req.url || '').replace(/^\//, '').split('?')[0]
      if (!/^[a-z0-9-]+\.jpg$/.test(name)) return next()
      res.setHeader('Content-Type', 'image/jpeg')
      res.end(readFileSync(resolve(import.meta.dirname, '../app/backgrounds', name)))
    })
  },
})

// React and appica load from jsdelivr through the import map in cdn-lock.json (scripts/cdn-lock.mjs): appica, Base UI
// and the rest as their own published files, one URL per file, so every part shares one copy of each library's state
// (#60). The page holds only the app's own code and stays readable for SETUP, which has Claude read it before publishing
// it. Those files are written for bundlers and read process.env.NODE_ENV, so the page defines it first.
// BUNDLE=1 builds the fallback instead: one self-contained file with everything inlined.
const cdn = () => ({
  name: 'cdn-import-map',
  transformIndexHtml: () => [
    { tag: 'script', children: 'globalThis.process={env:{NODE_ENV:"production"}}', injectTo: 'head-prepend' as const },
    { tag: 'script', attrs: { type: 'importmap' }, children: JSON.stringify(lock.importMap), injectTo: 'head-prepend' as const },
  ],
})
const external = (id: string) => {
  if (!/^(react|react-dom|@appica\/ui-react)(\/|$)/.test(id)) return false
  if (!(id in lock.importMap.imports)) throw new Error(`${id} isn't in cdn-lock.json: run npm run cdn:lock`)
  return true
}

export default defineConfig(({ command }) =>
  process.env.BUNDLE || command === 'serve'
    ? { define, plugins: [react(), tailwindcss(), themeScript(), versionMeta(), backgrounds(), viteSingleFile()] }
    : {
        define,
        plugins: [react(), tailwindcss(), themeScript(), versionMeta(), cdn(), viteSingleFile()],
        build: { minify: false, rollupOptions: { external } },
      },
)
